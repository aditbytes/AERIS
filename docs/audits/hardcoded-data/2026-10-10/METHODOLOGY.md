# Hardcoded data and provenance audit methodology

Audit date: 2026-10-10 (Asia/Calcutta). Repository: `D:\AERIS`.
Audited working revision: `7cf0572049d69b550cbb42d7e74cf5472d521793`, branch
`feature/frontend-audit-heatmap`. Initial working tree and index were clean.
This audit changes only this new report directory. It does not repair the findings.

## Scope and counting rules

The repository tree was inventoried, including tracked files, ignored Lambda staging
copies and specifically relevant ignored optional-ML artifacts. Dependency trees,
caches, browser/test output, earlier audit scratch copies and compiled builds are
excluded from primary source counts. `CENSUS.json` lists every excluded root.
`FILE_INVENTORY.csv` records paths, bytes, physical lines, SHA-256, scope, categories
and inspection status. Empty package files are included in the source-file denominator.
Binary artwork is inspected as metadata; no scientific values are inferred from images.

Primary source means Python, TS/TSX, CSS, shell, YAML, HTML, Makefiles, requirements,
environment examples, ignore files and first-party JSON configuration. Documentation,
captured/generated JSON/GeoJSON, package-lock.json and generated staging copies are
separate. All 49 staging files match their original source bytes; their 48 Python
copies do not inflate primary source or literal counts. Seven web publication files
match data/live files byte-for-byte and do not add unique observations.

`FINDINGS.csv` has one row per reviewed semantic declaration/dataset/policy or per
explicitly labelled residual file group. Imports of one declaration do not create
additional findings. Independently duplicated declarations can have separate rows.
Every row has exactly one category A-F and one primary reachability value. A residual
group collects remaining literal positions in one source file; it is not a single
scientific constant or dataset. Counts of manual findings and residual groups are
reported separately. High and Critical findings are manually verified; automated
groups are Informational and do not imply a defect merely because literals exist.

`LITERAL_OCCURRENCES.csv` records file, line, column and kind without exposing values.
Python AST constants exclude module/class/function docstrings. TypeScript compiler
AST literals exclude import/export module specifiers and include nonempty JSX text.
Python dictionary keys and TypeScript property keys can be literal occurrences.
CSS, shell, YAML, configuration and HTML use a documented lexical approximation:
quoted strings and standalone positive numeric tokens. These lexical matches can
include comments and syntax/reference values. F-string/template interpolations,
unquoted shell/configuration text and arbitrary computed values are not exhaustively
counted. Therefore this is an exact count under reproducible rules, not an exact
semantic count of all embedded data or an arbitrary hardcoded-data percentage.

Each literal position is assigned once: to the narrowest reviewed finding span
containing it, with ID as tie-breaker, or to its residual file group. Semantic finding
spans may overlap; per-category associated lines use a unique (file,line) union.
Category line totals can overlap and must not be summed as unique project lines.
Associated lines describe audit spans, not just lines consisting entirely of literals.

Selected constants/thresholds/endpoints/outputs in findings count the listed semantic
entries, not all literal tokens. Zeros mean no separately quantified entry, not proof
that an entire file contains no constants. These selected counts are lower bounds.
Coordinates in datasets count explicit lat/lon objects or GeoJSON positions; repeated
closing ring positions are included. Scalar entries count JSON leaf values, including
nulls, and exclude object keys. Array entries count positions at all nested levels.
Records are reported by type; wind grid points and hourly records are separate.
Heterogeneous record counts are not a count of independent scientific observations.

Runtime means shipped/browser/handler code or a bundled dataset reachable through
normal configuration, not a claim that its deployed execution was observed. Test,
development, artifact and unknown are distinct. Runtime-callable optional inference
is distinct from production corridor use; training scenarios are development-only.
Raw data, normalized observations, derived indices, forecasts, heuristic outputs,
assumptions and references are kept distinct in DATA_PROVENANCE.md.

## Manual verification and history

Reviewed paths: agent, api, data/live, docs, infra, ingest, models (including source
detection/plume/exposure/training/calibration), pipeline, scripts, web and .github,
plus root configuration. No database/schema/migration/seed implementation, Dockerfile,
populated notebook or eligible captured historical calibration archive was found.
The frontend import graph was checked for test/fixture imports; none was found.
Scientific/API/ingestion paths were traced from declarations through stored output
and browser rendering. Pure Python probes used `python -B`, controlled in-memory
inputs and patched I/O. No capture was regenerated and no application CLI, training,
calibration, deployment or network data fetcher was executed.

Introduction evidence uses chronological `git log -S`, introduction diffs and
file-add commits. Blame/last edit alone is not treated as original authorship.
CSV attribution describes mixed introduction/modification evidence where a policy
evolved. Grouped residual literals remain Unknown/unattributed. Author names are Git
metadata only, not verified people/accounts; MeenalSinha and Meenal Sinha are not
silently merged. Removed historical findings are reported separately and excluded
from current finding/defect/data totals. A capture commit proves repository
introduction, not authorship of external observations or independent provenance.

All 17 available local branch/tracking refs were compared with their merge base
against cached origin/main. Public GitHub metadata was read without authentication,
fetching refs, downloading datasets or changing settings. Public upstream reports
zero forks. Remote main differs from cached origin/main; the remote feature branch
returns HTTP 404. See FORK_COMPARISON.md for limits. These are branches, not separate forks.

Credential patterns were scanned without printing values across 349 current files
and 661 distinct locally reachable Git blobs. AWS access IDs, GitHub tokens, Google
API keys, JWT-like strings and private-key headers had no matches. Empty environment
examples, test placeholders and Secrets Manager references are not usable secrets.
Arbitrary-format keys, encrypted/binary secrets, environment values, unreachable Git
objects and remote-only history are not certified absent. No credential was used.

## Reproduction and validation

No installation is performed. Python 3.14.3 and the existing Node 24.16.0/TypeScript
installation were used. From repository root:

```powershell
python -B docs/audits/hardcoded-data/2026-10-10/inventory.py --scan
python -B docs/audits/hardcoded-data/2026-10-10/assemble_findings.py
python -B docs/audits/hardcoded-data/2026-10-10/inventory.py --compile
python -B docs/audits/hardcoded-data/2026-10-10/verification_probes.py
node docs/audits/hardcoded-data/2026-10-10/heatmap_probe.cjs
python -B docs/audits/hardcoded-data/2026-10-10/secret_scan.py
python -B docs/audits/hardcoded-data/2026-10-10/validate_audit.py
git diff --check
git status --short --untracked-files=all
git diff --cached --name-only
```

The scripts read application files and Git only; they write derived audit outputs
beside themselves. Their source, reviewed JSON inputs, and the explicit review_corrections.json overrides are included. Introduction, reviewed modification, and last file modification are separate CSV columns. Use a separate
copy of this audit directory if preserving this evidence snapshot. Human severity,
reachability, provenance and introduction judgments are inputs, not conclusions an
automated token scan can reproduce without review. Installed TypeScript is required;
the script intentionally does not download it. Public metadata/license evidence is
recorded documentation and is not fetched by these scripts.

Completion validation checks exact source spans, unique IDs, literal ownership,
CSV/JSON totals, publication/staging copy hashes and protected-file hashes. Final
HEAD, branch, index and locally available refs are compared with the baseline.
Existing unit/browser/backend suites were not rerun: this is a read-only audit,
not an implementation change. Earlier suite results are not new audit test results.
