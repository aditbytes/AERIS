"""Validate audit counts and unchanged repository state; write only audit evidence."""
from __future__ import annotations

import collections
import csv
import hashlib
import json
import os
import pathlib
import subprocess
import sys

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
checks = []


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, env=ENV).decode('utf-8', 'strict').strip()


def read_json(name):
    return json.loads((OUT/name).read_text(encoding='utf-8'))


def read_csv(name):
    with (OUT/name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


def check(name, ok, detail):
    checks.append({'check':name, 'passed':bool(ok), 'detail':detail})


baseline = read_json('BASELINE.json')
original = baseline['files']
changed = []
for row in original:
    file = ROOT/row['path']
    if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != row['sha256']:
        changed.append(row['path'])
check('original_first_party_bytes', not changed, {'checked':len(original), 'changed_paths':changed})
ignored = read_json('IGNORED_ARTIFACTS.json')
changed_ignored = [r['file'] for r in ignored if hashlib.sha256((ROOT/r['file']).read_bytes()).hexdigest() != r['sha256']]
check('ignored_ml_artifacts', not changed_ignored, {'checked':len(ignored),'changed_paths':changed_ignored})
check('head', git('rev-parse','HEAD') == baseline['head'], baseline['head'])
check('branch', git('branch','--show-current') == baseline['branch'], baseline['branch'])
index = pathlib.Path(git('rev-parse','--git-path','index'))
if not index.is_absolute(): index = ROOT/index
check('index_bytes', hashlib.sha256(index.read_bytes()).hexdigest() == baseline['index_sha256'], baseline['index_sha256'])
check('tracked_inventory', set(git('ls-files','-z').split('\0'))-{''} == set(baseline['tracked'])-{''}, len(set(baseline['tracked'])-{''}))
check('tracked_worktree_diff', not git('diff','--name-only'), 'No tracked working-tree changes')
check('staged_diff', not git('diff','--cached','--name-only'), 'Nothing staged')
expected_refs = {r['ref']:r['commit'] for r in read_json('LOCAL_REF_COMPARISON.json')}
actual_refs = dict(line.split(' ',1) for line in git('for-each-ref','--format=%(refname) %(objectname)','refs/heads','refs/remotes').splitlines())
origin_alias = actual_refs.pop('refs/remotes/origin/HEAD', None)
check('local_refs', actual_refs == expected_refs, {'checked':len(expected_refs),'symbolic_alias_excluded':'origin/HEAD'})
check('origin_head_alias', origin_alias == expected_refs['refs/remotes/origin/main'] and git('symbolic-ref','refs/remotes/origin/HEAD') == 'refs/remotes/origin/main', 'Existing symbolic alias targets cached origin/main')
check('reachable_commit_count', git('rev-list','--all','--count') == '220', 220)
check('remote_configuration', git('remote','-v') == 'origin\thttps://github.com/sinhaaditya5/AERIS.git (fetch)\norigin\thttps://github.com/sinhaaditya5/AERIS.git (push)', 'Existing origin URL unchanged')
new_files = [f for f in git('ls-files','--others','--exclude-standard','-z').split('\0') if f]
prefix = OUT.relative_to(ROOT).as_posix()+'/'
check('new_file_scope', all(f.startswith(prefix) for f in new_files), {'new_files':len(new_files),'outside_audit':[f for f in new_files if not f.startswith(prefix)]})

findings = read_csv('FINDINGS.csv')
inventory = read_csv('FILE_INVENTORY.csv')
by_file = {r['file']:r for r in inventory}
tokens = read_csv('LITERAL_OCCURRENCES.csv')
metrics = read_json('METRICS.json')
ids = [r['id'] for r in findings]
check('unique_finding_ids', len(ids)==len(set(ids)), len(ids))
declarations = [(r['file'],r['line'],r['endline'],r['value_description']) for r in findings]
check('unique_declaration_rows', len(declarations)==len(set(declarations)), len(declarations))
positions = [(r['file'],r['line'],r['column'],r['kind']) for r in tokens]
check('unique_literal_positions', len(positions)==len(set(positions)), len(positions))
bad_spans = []
for row in findings:
    n = int(by_file[row['file']]['lines'])
    low, high = int(row['line']), int(row['endline'])
    if not (1<=low<=high<=n) and not (n==0 and low==high==1): bad_spans.append(row['id'])
check('existing_files_and_line_spans', not bad_spans, {'checked':len(findings),'invalid':bad_spans})
check('literal_count_reconciliation', sum(int(r['literal_occurrences_count']) for r in findings)==len(tokens)==metrics['literal_occurrences'], len(tokens))
check('classification', all(r['category'] in set('ABCDEF') and r['status'] in {'defect','risk','intentional'} and r['reachability'] in {'runtime','test','development','artifact','unknown'} for r in findings), 'One category, status, and reachability per row')
for field, metric in [('category','categories'),('severity','severity'),('status','status'),('reachability','reachability'),('author','contributors')]:
    counts = dict(collections.Counter(r[field] for r in findings))
    expected = {k:v['findings'] for k,v in metrics[metric].items()} if field=='category' else metrics[metric]
    check('counts_'+field, counts==expected, counts)
for key,total in metrics['selected_measurable_counts'].items():
    check('selected_'+key, sum(int(r[key]) for r in findings)==total, total)
check('file_inventory_count', len(inventory)==metrics['inspected_files'], len(inventory))
check('source_denominator', sum(r['kind']=='source' for r in inventory)==metrics['primary_source_files'], metrics['primary_source_files'])
attribution = read_csv('CONTRIBUTOR_ATTRIBUTION.csv')
check('attribution_rows', {r['finding_id'] for r in attribution}==set(ids) and len(attribution)==len(findings), len(attribution))
intro_failures = []
for row in findings:
    for commit in filter(None,row['introduction_commit'].split(';')):
        result = subprocess.run(['git','cat-file','-e',commit.strip()+':'+row['file']],cwd=ROOT,env=ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode: intro_failures.append({'id':row['id'],'commit':commit.strip(),'file':row['file']})
check('introduction_commit_file_evidence', not intro_failures, {'attributed_findings':sum(bool(r['introduction_commit']) for r in findings),'invalid':intro_failures})
staging = read_json('STAGING_COPY_VERIFICATION.json')
check('staging_copy_bytes', all((ROOT/r['copy']).read_bytes()==(ROOT/r['source']).read_bytes() for r in staging), len(staging))
datasets = read_json('DATASET_INVENTORY.json')
publication = [r for r in datasets if r.get('copy_of')]
check('publication_copy_bytes', all((ROOT/r['file']).read_bytes()==(ROOT/r['copy_of']).read_bytes() for r in publication), len(publication))
unique_data = [r for r in datasets if not r.get('copy_of')]
check('unique_live_dataset_volume', len(unique_data)==10 and sum(r['bytes'] for r in unique_data)==23307913, {'datasets':len(unique_data),'bytes':sum(r['bytes'] for r in unique_data)})
check('historical_findings_separate', len(read_csv('HISTORICAL_FINDINGS.csv'))==5 and not any(i.startswith('SCI-H') for i in ids), 5)

tracked_diff = subprocess.run(['git','diff','--check'],cwd=ROOT,env=ENV,capture_output=True)
check('git_diff_check', tracked_diff.returncode==0, {'exit_code':tracked_diff.returncode})
whitespace = []
for file in sorted(OUT.iterdir()):
    if not file.is_file(): continue
    result = subprocess.run(['git','-c','core.autocrlf=false','-c','core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol','diff','--no-index','--check','--','NUL',str(file)],cwd=ROOT,env=ENV,capture_output=True)
    if result.returncode not in (0,1) or result.stdout or result.stderr:
        whitespace.append({'file':file.name,'exit_code':result.returncode,'message':(result.stdout+result.stderr).decode('utf-8','replace')[:500]})
check('new_audit_whitespace', not whitespace, {'checked_files':sum(f.is_file() for f in OUT.iterdir()),'problems':whitespace})
report = {'interpreter':sys.executable,'python_version':sys.version.split()[0],
          'checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),
          'git_status':git('status','--short','--untracked-files=all'),
          'note':'Does not authenticate external observations, licenses, personal identities, arbitrary secrets, or remote deployment.'}
(OUT/'VALIDATION.json').write_text(json.dumps(report,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'failures':[c for c in checks if not c['passed']]},ensure_ascii=True))
raise SystemExit(bool(report['failed']))
