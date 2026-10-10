"""Controlled, read-only diagnostic probes. Inputs are not captured observations."""
import sys
sys.dont_write_bytecode = True
import json
import math
import pathlib
from unittest.mock import patch

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
sys.path.insert(0, str(ROOT))
from ingest.aqi.fetch_aqi import compute_pm25_aqi
from ingest.firms.fetch_fires import fetch_fires
from ingest.common.http import UpstreamError
from ingest.common.http import _safe_url
from ingest.firms import handler as firms_handler
from agent import agent

results = {'interpreter':sys.executable, 'python_version':sys.version.split()[0],
           'inputs':'Controlled diagnostic boundary/empty/missing-field inputs, not real measurements.'}
results['aqi_boundary_probes'] = [{'pm25':p,'aqi_and_category':compute_pm25_aqi(p)}
                                 for p in (30.0,30.05,30.1,60.05,90.05,120.05,250.05)]
pop = {'estimate':0,'low':0,'high':0,'data_available':False}
with patch.object(agent,'get_sources',return_value=[]), patch.object(agent,'get_exposed_population',return_value=pop), patch.object(agent,'get_ranked_sites',return_value=[]):
    plan = agent.generate_action_plan().model_dump()
    results['empty_agent'] = {'summary':plan['summary'],'site_actions':len(plan['actions']),
                              'authority_actions':len(plan['authority_actions'])}
with patch.object(agent,'get_sources',return_value=[]), patch.object(agent,'get_exposed_population',return_value=pop), patch.object(agent,'get_ranked_sites',return_value=[{'site_id':'AUDIT_CONTROLLED_SITE'}]):
    plan = agent.generate_action_plan().model_dump()
    results['missing_fields_agent'] = {'reason':plan['actions'][0]['reason'],
                                      'deadline_hours':plan['actions'][0]['deadline_hours']}
with patch('ingest.firms.fetch_fires.get',side_effect=UpstreamError('https://audit.invalid/',503,'controlled upstream failure')):
    empty = fetch_fires(key='AUDIT_NON_CREDENTIAL',sources=['VIIRS_SNPP_NRT'])
results['firms_all_failure'] = {'fires':len(empty['fires']),'source':empty['source'],
                               'fresh_generated_at_present':bool(empty['generated_at'])}
writes = []
def record_write(name,obj):
    writes.append({'name':name,'fire_count':len(obj['fires'])}); return 'AUDIT_IN_MEMORY_ONLY'
with patch.object(firms_handler,'fetch_fires',return_value=empty), patch.object(firms_handler.secrets,'get_secret',return_value='AUDIT_NON_CREDENTIAL'), patch.object(firms_handler.storage,'write_bronze',side_effect=record_write):
    firms_handler.lambda_handler({},None)
results['firms_handler_write_attempt'] = writes
aqi = json.loads((ROOT/'data/live/aqi.json').read_bytes())
readings = [s for s in aqi['stations'] if s.get('pm25') is not None]
results['captured_aqi_derivation'] = {'readings':len(readings),'matching_project_subindex':sum(compute_pm25_aqi(s['pm25'])[0]==s['aqi'] for s in readings)}
source = json.loads((ROOT/'data/live/sources.json').read_bytes())
results['source_territory_missing'] = sum(not s.get('territory') for s in source['sources'])
ranked = json.loads((ROOT/'data/live/ranked_sites.json').read_bytes())
results['captured_facility_deltas'] = {'sites':len(ranked['sites']),'unique_pm25_delta_ugm3':sorted({s['pm25_delta_ugm3'] for s in ranked['sites']})}
results['debug_path_redaction'] = {'dummy_path_credential_retained': 'AUDIT_NON_CREDENTIAL' in _safe_url('https://firms.modaps.eosdis.nasa.gov/api/area/csv/AUDIT_NON_CREDENTIAL/VIIRS_SNPP_NRT/73,28,77,32/1')}
corridor = json.loads((ROOT/'data/live/corridor.geojson').read_bytes())
strength = {s['id']:s['emission_strength'] for s in source['sources']}
bands = [f['properties'] for f in corridor['features'] if f['properties'].get('kind') == 'band']
results['legacy_corridor_formula'] = {
    'bands':len(bands),
    'concentration_matches':sum(p['pm25_delta_ugm3'] == round(max(15,160*strength[p['source_id']]*math.exp(-((p['hour_from']+p['hour_to'])/2)/20)),1) for p in bands),
    'risk_matches':sum(p['risk'] == round(min(.98,max(.2,strength[p['source_id']]*(1-p['hour_from']/30))),2) for p in bands),
}
assert results['captured_aqi_derivation'] == {'readings':59,'matching_project_subindex':59}
assert results['firms_handler_write_attempt'] == [{'name':'fires','fire_count':0}]
assert results['legacy_corridor_formula'] == {'bands':40,'concentration_matches':40,'risk_matches':40}
(OUT/'PROBE_RESULTS.json').write_text(json.dumps(results,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
print(json.dumps(results,ensure_ascii=True))
