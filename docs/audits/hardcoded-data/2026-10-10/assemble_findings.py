"""Normalize reviewed audit inputs; never edits application files or uses the network."""
import json
import pathlib
import re
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
ROWS = []
EXCLUDED = []
CORRECTIONS = json.loads((OUT/'review_corrections.json').read_text(encoding='utf-8'))
MOJIBAKE = {'\u00e2\u2020\u2019':' -> ', '\u00e2\u02c6\u2019':' - ', '\u00e2\u20ac\u201c':' - ', '\u00c3\u2014':' x ', '\u00c2\u00b1':'+/-'}


def readable(value):
    if isinstance(value, str):
        for bad, good in MOJIBAKE.items(): value = value.replace(bad, good)
        return value
    if isinstance(value, list): return [readable(x) for x in value]
    if isinstance(value, dict): return {k:readable(v) for k,v in value.items()}
    return value


for name in ('reviewed_docs.json','reviewed_backend.json','reviewed_frontend.json','reviewed_science.json'):
    source = json.loads((OUT/name).read_text(encoding='utf-8'))
    rows = source['findings'] if isinstance(source,dict) else source
    for original in rows:
        row = readable(original)
        row.update(CORRECTIONS.get(row['id'], {}))
        if row['id'] == 'AR01':
            EXCLUDED.append({'id':'AR01','reason':'Directory-level staged duplicate inventory, not a separate declaration; all49copies are already in FILE_INVENTORY.'}); continue
        row['status'] = {'confirmed_defect':'defect','potential_risk':'risk','intentional_constant':'intentional'}.get(row['status'],row['status'])
        row['reachability'] = {'development-only':'development','artifact-only':'artifact','test-only':'test'}.get(row['reachability'],row['reachability'])
        row['introduction_commit'] = row.get('introduction_commit') or ''
        if row['introduction_commit']:
            row.setdefault('attribution_basis',row.get('attribution_evidence') or 'Chronological pickaxe/file-introduction and added-line review; Git author metadata only. Declaration introduction is separate from external observation authorship.')
        else: row['author'] = 'Unknown/unattributed'; row['attribution_basis']='No reliable grouped-declaration introduction evidence; not inferred from last editor.'
        if row['id'] in {'SCI-055','SCI-056'}:
            row['status']='risk'
            row['evidence'].append('models/README.md explicitly discloses older archived outputs; mismatch itself is not proof of fabricated observations or current-model output being presented as live.')
        missing=[]
        for key in ('constants_count','records_count','coordinates_count','endpoints_count','thresholds_count','mock_responses_count','synthetic_datasets_count','static_outputs_count'):
            if row.get(key) is None: missing.append(key);row[key]=0
        row['unmeasured_count_fields']=';'.join(missing)
        ROWS.append(row)
(OUT/'reviewed_findings.json').write_text(json.dumps(ROWS,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
(OUT/'EXCLUDED_REVIEW_ROWS.json').write_text(json.dumps(EXCLUDED,indent=2)+'\n',encoding='utf-8')
history=readable(json.loads((OUT/'reviewed_science_history.json').read_text(encoding='utf-8')))
for row in history['findings']:
    if row['id'] == 'SCI-H001':
        row['evidence'][-1] = '049cfa83 removed the synthetic generator and replaced the population payload with WorldPop cells. The current payload was subsequently refreshed in 3789d081; external authorship is not inferred from capture commits.'
(OUT/'HISTORICAL_EVIDENCE.json').write_text(json.dumps(history,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
print(json.dumps({'reviewed_current_findings':len(ROWS),'excluded_directory_rows':len(EXCLUDED),'historical_findings':len(history['findings'])}))
