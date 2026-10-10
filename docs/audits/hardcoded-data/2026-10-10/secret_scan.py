"""Read-only, value-redacted credential pattern scan of current files and local Git blobs."""
import hashlib
import json
import os
import pathlib
import re
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
PATTERNS = {
    'AWS_access_key_id': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'GitHub_token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b'),
    'Google_API_key': re.compile(rb'\bAIza[A-Za-z0-9_-]{35}\b'),
    'private_key_header': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'JWT_like': re.compile(rb'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b'),
}


def matches(data, file, revision):
    rows = []
    for kind, pattern in PATTERNS.items():
        for hit in pattern.finditer(data):
            rows.append({'file': file, 'revision': revision, 'line': data[:hit.start()].count(b'\n')+1,
                         'pattern': kind, 'value': '[REDACTED]', 'usable': 'unverified_not_used'})
    return rows


census = json.loads((OUT / 'CENSUS.json').read_text(encoding='utf-8'))
findings = []
files = list(census['files'])
if (OUT/'IGNORED_ARTIFACTS.json').exists(): files.extend(json.loads((OUT/'IGNORED_ARTIFACTS.json').read_text(encoding='utf-8')))
for row in files:
    findings.extend(matches((ROOT / row['file']).read_bytes(), row['file'], 'working_tree'))
env = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all'], cwd=ROOT, env=env).decode().splitlines()
names = {}
for item in objects:
    oid, _, name = item.partition(' ')
    if name: names[oid] = name
oids = list(names)
metadata = subprocess.check_output(['git', 'cat-file', '--batch-check'], input=('\n'.join(oids)+'\n').encode(), cwd=ROOT, env=env).decode().splitlines()
blobs = [line.split()[0] for line in metadata if line.split()[1] == 'blob']
process = subprocess.Popen(['git','cat-file','--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=ROOT, env=env)
total_bytes = 0
for oid in blobs:
    process.stdin.write((oid+'\n').encode()); process.stdin.flush()
    header = process.stdout.readline().decode().split()
    size = int(header[2]); data = process.stdout.read(size); process.stdout.read(1)
    total_bytes += size
    findings.extend(matches(data, names[oid], oid))
process.stdin.close(); process.wait()
result = {'current_files_scanned':len(files), 'local_unique_blobs_scanned':len(blobs),
          'local_blob_bytes_scanned':total_bytes, 'matches':findings,
          'limitations':'Pattern-only scan; arbitrary-format keys, encrypted/binary secrets and unreachable Git objects not certified absent. No secret tested, used or printed.'}
(OUT / 'SECRET_SCAN.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result))
