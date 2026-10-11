"""Read-only repository census; reports are written only beside this script.

No imports of application code, network, installs, Git mutations, or dataset writes.
Use --scan to reproduce the census; --compile to integrate reviewed declarations.
"""
from __future__ import annotations

import argparse
import ast
import collections
import csv
import hashlib
import json
import os
import pathlib
import re
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
SKIP = {'.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache', 'coverage',
        'test-results', 'dist', 'build', '.aws-sam', '.mypy_cache', '.ruff_cache'}
SOURCE_SUFFIXES = {'.py', '.ts', '.tsx', '.css', '.sh', '.yaml', '.yml', '.html'}
SOURCE_NAMES = {'Makefile', '.gitignore', '.env.example', 'requirements.txt',
                'requirements-agent.txt', 'requirements-pipeline.txt', '.oxlintrc.json',
                'package.json', 'tsconfig.app.json', 'tsconfig.browser.json',
                'tsconfig.json', 'tsconfig.node.json'}


def git(*args):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
    return subprocess.check_output(['git', *args], cwd=ROOT, env=env).decode('utf-8', 'strict')


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=True, indent=2) + '\n', encoding='utf-8')


def write_csv(name, rows, fields):
    with (OUT / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: '; '.join(map(str, v)) if isinstance(v, list) else v
                             for k, v in row.items()})


def test_file(file):
    return '/tests/' in '/' + file or '/__tests__/' in file or '.test.' in file or file.endswith('testSetup.ts')


def reach(file):
    if test_file(file): return 'test'
    if file.startswith(('scripts/', 'models/training/')) or file in {'start.sh', 'web/playwright.config.ts', 'web/vitest.config.ts'}:
        return 'development'
    if file.startswith(('docs/', 'data/')): return 'artifact'
    return 'runtime'


def json_metrics(obj):
    c = collections.Counter()
    def walk(value):
        if isinstance(value, dict):
            if isinstance(value.get('lat'), (int, float)) and isinstance(value.get('lon'), (int, float)):
                c['coordinate_positions'] += 1
            for key, child in value.items():
                if key == 'coordinates':
                    def coords(v):
                        if isinstance(v, list) and len(v) >= 2 and all(isinstance(x, (int, float)) for x in v[:2]):
                            c['coordinate_positions'] += 1
                        elif isinstance(v, list):
                            for part in v: coords(part)
                    coords(child)
                walk(child)
        elif isinstance(value, list):
            c['array_entries'] += len(value)
            for part in value: walk(part)
        else:
            c['scalar_entries'] += 1
    walk(obj)
    if isinstance(obj, dict):
        for key in ('stations', 'fires', 'sources', 'features', 'sites', 'cells', 'actions', 'authority_actions', 'points', 'scenarios', 'worst_cases'):
            if isinstance(obj.get(key), list): c['records_' + key] = len(obj[key])
        if isinstance(obj.get('points'), list): c['records_wind_hours'] = sum(len(p.get('hours', [])) for p in obj['points'] if isinstance(p, dict))
    return dict(c)


def scan():
    tracked = set(git('ls-files', '-z').split('\0')) - {''}
    ignored = set(git('ls-files', '--others', '--ignored', '--exclude-standard', '-z').split('\0')) - {''}
    files, errors, excluded = [], [], []
    tokens = {}
    for base, dirs, names in os.walk(ROOT):
        for name in list(dirs):
            p = pathlib.Path(base) / name
            if name in SKIP or p == OUT:
                excluded.append(p.relative_to(ROOT).as_posix()); dirs.remove(name)
        for name in names:
            p = pathlib.Path(base) / name
            file = p.relative_to(ROOT).as_posix()
            try: data = p.read_bytes()
            except OSError as exc:
                errors.append({'file': file, 'error': type(exc).__name__}); continue
            try: text = data.decode('utf-8', 'strict'); lines = len(text.splitlines())
            except UnicodeDecodeError: text = None; lines = 0
            source = p.suffix in SOURCE_SUFFIXES or name in SOURCE_NAMES
            kind = 'source' if source else ('documentation' if p.suffix == '.md' or name == 'LICENSE' else 'asset_or_report')
            if name == 'package-lock.json': kind = 'generated_dependency_lock'
            if file not in tracked and any(file.startswith('infra/lambda/' + prefix + '/') for prefix in ('agent','api','ingest','models','pipeline')):
                kind = 'generated_staging_copy'; source = False
            row = {'file': file, 'kind': kind, 'tracked': file in tracked, 'ignored': file in ignored,
                   'bytes': len(data), 'lines': lines, 'sha256': hashlib.sha256(data).hexdigest(),
                   'reachability': reach(file), 'audit_status': 'read_scanned' if text is not None else 'binary_metadata_only'}
            if p.suffix in {'.json', '.geojson'} and name != 'package-lock.json':
                try: row['data_metrics'] = json_metrics(json.loads(text)); row['audit_status'] = 'json_parsed'
                except (ValueError, TypeError): row['audit_status'] = 'json_parse_failed'
            files.append(row)
            if source and text is not None:
                file_tokens = []
                if p.suffix == '.py':
                    tree = ast.parse(text, filename=file)
                    docstrings = set()
                    for node in ast.walk(tree):
                        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
                            first = node.body[0]
                            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                                docstrings.add(id(first.value))
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Constant) and id(node) not in docstrings:
                            kind = 'boolean' if isinstance(node.value, bool) else 'number' if isinstance(node.value, (int, float, complex)) else 'null' if node.value is None else 'string' if isinstance(node.value, str) else 'other'
                            file_tokens.append({'line': node.lineno, 'column': node.col_offset + 1, 'kind': kind})
                elif p.suffix not in {'.ts', '.tsx'}:
                    # Lexical approximation for CSS/shell/configuration/HTML, not a semantic parser.
                    pattern = r'''"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?<![\w-])\d+(?:\.\d+)?'''
                    for match in re.finditer(pattern, text):
                        before = text[:match.start()]
                        file_tokens.append({'line': before.count('\n') + 1, 'column': match.start() - before.rfind('\n'),
                                            'kind': 'string' if match.group()[0] in '\"\'' else 'number'})
                tokens[file] = file_tokens
    ts_files = [f['file'] for f in files if f['kind'] == 'source' and pathlib.Path(f['file']).suffix in {'.ts', '.tsx'}]
    if ts_files:
        output = subprocess.check_output(['node', str(OUT / 'literal_scan.cjs'), str(ROOT)], input=json.dumps(ts_files).encode(), cwd=ROOT)
        tokens.update(json.loads(output))
    files.sort(key=lambda f: f['file'])
    token_rows = [{'file': f, **t} for f in sorted(tokens) for t in sorted(tokens[f], key=lambda t:(t['line'], t['column']))]
    save('CENSUS.json', {'head': git('rev-parse', 'HEAD').strip(), 'files': files,
                         'excluded_roots': sorted(excluded), 'inaccessible_files': errors})
    write_csv('LITERAL_OCCURRENCES.csv', token_rows, ['file', 'line', 'column', 'kind'])
    return files, token_rows


def compile_reports():
    census = json.loads((OUT / 'CENSUS.json').read_text(encoding='utf-8'))
    files = list(census['files'])
    if (OUT / 'IGNORED_ARTIFACTS.json').exists():
        files.extend({**f,'kind':'generated_offline_ml_artifact','lines':f.get('lines',0),'tracked':False} for f in json.loads((OUT/'IGNORED_ARTIFACTS.json').read_text(encoding='utf-8')))
    by_file = {f['file']: f for f in files}
    with (OUT / 'LITERAL_OCCURRENCES.csv').open(encoding='utf-8', newline='') as stream:
        tokens = list(csv.DictReader(stream))
    findings = json.loads((OUT / 'reviewed_findings.json').read_text(encoding='utf-8'))
    for row in findings:
        assert row['file'] in by_file, row
        row.setdefault('endline', row['line']); row.setdefault('review_basis', 'manual')
        row.setdefault('introduction_commit', ''); row.setdefault('author', 'Unknown/unattributed')
        for key in ('constants_count', 'records_count', 'coordinates_count', 'endpoints_count', 'thresholds_count', 'mock_responses_count', 'synthetic_datasets_count', 'static_outputs_count'):
            row.setdefault(key, 0)
        row['literal_occurrences_count'] = 0
    residual = collections.defaultdict(list)
    for token in tokens:
        line = int(token['line'])
        owners = [r for r in findings if r['file'] == token['file'] and int(r['line']) <= line <= int(r['endline'])]
        if owners:
            min(owners, key=lambda r:(int(r['endline'])-int(r['line']), r['id']))['literal_occurrences_count'] += 1
        else: residual[token['file']].append(token)
    for number, (file, items) in enumerate(sorted(residual.items()), 1):
        r = reach(file)
        category = 'B' if r == 'test' else 'C' if file.startswith('models/') else 'E' if file.endswith(('.css', '.tsx', '.html')) else 'D'
        findings.append({'id': f'RES-{number:03}', 'file': file, 'line': min(int(i['line']) for i in items),
                         'endline': max(int(i['line']) for i in items), 'category': category,
                         'severity': 'Informational', 'status': 'intentional', 'reachability': r,
                         'value_description': 'Residual literal group: schema keys, messages, structural/default/test values outside specifically reviewed declaration spans; not a claim that each token is scientific data.',
                         'evidence': 'LITERAL_OCCURRENCES.csv lists each position; assigned only after reviewed spans are removed.',
                         'provenance': 'Repository source; automated residual grouping, semantic coverage limited.',
                         'recommendation': 'Leave routine source literals; review individual positions before interpreting as operational data.',
                         'review_basis': 'automated_residual', 'author': 'Unknown/unattributed', 'introduction_commit': '',
                         'literal_occurrences_count': len(items), **{k:0 for k in ('constants_count','records_count','coordinates_count','endpoints_count','thresholds_count','mock_responses_count','synthetic_datasets_count','static_outputs_count')}})
    ids = [r['id'] for r in findings]
    assert len(ids) == len(set(ids)), 'Duplicate finding IDs'
    assert all(r['category'] in 'ABCDEF' and r['reachability'] in {'runtime','test','development','artifact','unknown'} for r in findings)
    assert sum(r['literal_occurrences_count'] for r in findings) == len(tokens)
    fields = ['id','category','severity','status','file','line','endline','value_description','reachability','provenance','evidence',
              'author','introduction_commit','attribution_basis','modified_commit','modified_author','subsequent_remediation',
              'recommendation','review_basis','literal_occurrences_count','unmeasured_count_fields',
              'constants_count','records_count','coordinates_count','endpoints_count','thresholds_count','mock_responses_count',
              'synthetic_datasets_count','static_outputs_count']
    write_csv('FINDINGS.csv', findings, fields)
    inventory = []
    for file in files:
        matches = [r for r in findings if r['file'] == file['file']]
        inventory.append({**file, 'categories': sorted({r['category'] for r in matches}), 'finding_count': len(matches),
                          'literal_occurrences_count': sum(r['literal_occurrences_count'] for r in matches),
                          'finding_associated_lines': len({n for r in matches for n in range(int(r['line']), int(r['endline'])+1)}),
                          'data_metrics': json.dumps(file.get('data_metrics', {}), sort_keys=True)})
    write_csv('FILE_INVENTORY.csv', inventory, ['file','kind','tracked','ignored','bytes','lines','sha256','reachability','audit_status','categories','finding_count','literal_occurrences_count','finding_associated_lines','data_metrics'])
    attribution = []
    latest = {}
    for row in findings:
        commit = row.get('introduction_commit','')
        basis = row.get('attribution_basis', 'unknown: grouped residuals not attributed from last editor')
        author = row.get('author','Unknown/unattributed')
        if commit:
            commits = [git('rev-parse', c.strip()).strip() for c in commit.split(';') if c.strip()]
            authors = sorted({git('show','-s','--format=%an', c).strip() for c in commits})
            author = '; '.join(authors)
            row['author'] = author; row['introduction_commit'] = ';'.join(commits)
        file = row['file']
        if file not in latest:
            values = git('log','-1','--format=%H%n%an','--',file).splitlines()
            latest[file] = values[:2] if len(values)>=2 else ['', 'Unknown/unattributed']
        attribution.append({'finding_id':row['id'],'file':row['file'],'line':row['line'],'author_metadata':author,
                            'commit':row.get('introduction_commit',''),'evidence':basis,'identity_verified':False,
                            'latest_modification_commit':latest[file][0],'latest_modification_author':latest[file][1],
                            'reviewed_modification_commit':row.get('modified_commit',''),
                            'reviewed_modification_author':row.get('modified_author',''),
                            'subsequent_remediation':row.get('subsequent_remediation',''),
                            'finding_count':1})
    # Write normalized attribution back into findings; metadata identities are never independently verified.
    write_csv('FINDINGS.csv', findings, fields)
    write_csv('CONTRIBUTOR_ATTRIBUTION.csv', attribution, ['finding_id','file','line','author_metadata','commit','evidence','identity_verified','latest_modification_commit','latest_modification_author','reviewed_modification_commit','reviewed_modification_author','subsequent_remediation','finding_count'])
    historical = json.loads((OUT/'HISTORICAL_EVIDENCE.json').read_text(encoding='utf-8'))['findings']
    write_csv('HISTORICAL_FINDINGS.csv', historical, ['id','category','severity','status','file','revision','line','endline','value_description','reachability','provenance','evidence','author','introduction_commit','attribution_evidence','remediation_commit','remediation_author','recommendation','records_count','coordinates_count'])
    category_counts = {}
    for category in 'ABCDEF':
        rows = [r for r in findings if r['category'] == category]
        category_counts[category] = {'findings':len(rows),'files':len({r['file'] for r in rows}),
                                    'associated_lines':len({(r['file'],n) for r in rows for n in range(int(r['line']),int(r['endline'])+1)}),
                                    'literal_occurrences':sum(r['literal_occurrences_count'] for r in rows)}
    source_files = [r for r in files if r['kind']=='source']
    finding_files = {r['file'] for r in findings}
    count_fields = ('constants_count','records_count','coordinates_count','endpoints_count','thresholds_count','mock_responses_count','synthetic_datasets_count','static_outputs_count')
    save('METRICS.json', {'inspected_files':len(files),'primary_source_files':len(source_files),
                          'primary_source_bytes':sum(f['bytes'] for f in source_files),'primary_source_lines':sum(f['lines'] for f in source_files),
                          'files_with_findings':len(finding_files),'source_files_with_findings':len(finding_files & {r['file'] for r in source_files}),
                          'findings':len(findings),'manual_findings':sum(r['review_basis']=='manual' for r in findings),
                          'residual_groups':sum(r['review_basis']=='automated_residual' for r in findings),
                          'literal_occurrences':len(tokens),'categories':category_counts,
                          'severity':dict(collections.Counter(r['severity'] for r in findings)),
                          'status':dict(collections.Counter(r['status'] for r in findings)),
                          'reachability':dict(collections.Counter(r['reachability'] for r in findings)),
                          'contributors':dict(collections.Counter(r['author'] for r in findings)),
                          'selected_measurable_counts':{key:sum(r[key] for r in findings) for key in count_fields},
                          'inaccessible_files':census['inaccessible_files'],
                          'high_findings':[r['id'] for r in findings if r['severity'] in {'High','Critical'}]})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', action='store_true'); parser.add_argument('--compile', action='store_true')
    options = parser.parse_args()
    if options.scan: scan()
    if options.compile: compile_reports()
