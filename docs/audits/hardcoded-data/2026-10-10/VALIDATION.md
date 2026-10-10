# Executed validation and repository protection

Final execution environment:

- Python executable: `C:\Users\LENOVO\AppData\Local\Programs\Python\Python314\python.exe`
- Python version: **3.14.3**. No Python 3.12 audit execution is claimed.
- Node executable: `C:\Program Files\nodejs\node.exe`
- Node version: **24.16.0**; existing local TypeScript/Zod installations were used.

## Commands and actual results

| Command from repository root | Result |
|---|---|
| `python -B docs/audits/hardcoded-data/2026-10-10/inventory.py --scan` | Passed: 346 census files; 193 primary source files; 20,829 literal occurrences. |
| `python -B docs/audits/hardcoded-data/2026-10-10/assemble_findings.py` | Passed: 227 current reviewed groups, one excluded directory inventory row, five separate historical findings. |
| `python -B docs/audits/hardcoded-data/2026-10-10/inventory.py --compile` | Passed: 352 current groups, including 125 residual file groups; 349 inventory rows; one-owner literal count reconciliation. |
| `python -B docs/audits/hardcoded-data/2026-10-10/verification_probes.py` | Passed, exit 0: seven boundary probes; empty/missing-field agent behavior; patched total FIRMS failure/publication attempt; captured AQI, ranking, territory, and legacy formula checks. No real file publication or network request. |
| `node docs/audits/hardcoded-data/2026-10-10/heatmap_probe.cjs` | Passed, exit 0: actual function processes 59 captured readings into 28 cells; one rejected station, no duplicates, all samples stale at the recorded audit time. Transpilation is in memory. |
| `python -B docs/audits/hardcoded-data/2026-10-10/secret_scan.py` | Passed, exit 0: 349 current files and 661 locally reachable unique blobs; 46,838,455 historical blob bytes; zero signature matches. Pattern limitations remain. |
| `python -B docs/audits/hardcoded-data/2026-10-10/validate_audit.py` | Passed, exit 0: **42 checks passed, zero failed**. Details and exact final Git status are in VALIDATION.json. |
| `git diff --check` | Passed, exit 0; tracked application diff remains empty. |
| `git diff --cached --name-only` | Empty output; nothing staged. |
| `git status --short` | Only `?? docs/audits/`; every new file is inside the timestamped audit directory. |

The validation additionally checks every new audit file with
`git -c core.autocrlf=false -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --no-index --check -- NUL <audit-file>`.
This checks actual whitespace errors while accepting valid Windows CRLF endings;
per-command configuration does not modify repository or global Git configuration.
Exit 1 for a clean new-file addition is normal; whitespace diagnostics fail validation.

## Protection evidence

All **346 original files** and the **three selected ignored ML artifacts** match
recorded SHA-256 values. All 49 staging copies and seven publication copies remain
byte-identical to their source files. The branch and HEAD match BASELINE.json:
`feature/frontend-audit-heatmap`, `7cf0572049d69b550cbb42d7e74cf5472d521793`.
Index bytes match SHA-256
`546fada5ee1210f54bfcbae2f3181dbdee8ac053b5f201bd907ef67c7baf6b90`.
All 17 compared branch/tracking ref objects remain unchanged; origin/HEAD is a
symbolic alias to cached origin/main. Locally reachable history remains 220 commits.
Tracked paths and the existing origin URL remain unchanged. Nothing is staged,
committed, pushed, merged, deleted, or switched.

## Failures corrected within audit tooling

The initial probe harness supplied the wrong argument count to UpstreamError.
That harness error was corrected to the actual three-argument signature before
the successful probe run. It did not execute a real fetch or write a capture.

The first completion validator reported 37 passes and four failures: the baseline's
NUL-separated tracked-path list had a terminal empty entry; a symbolic origin/HEAD
alias was outside the branch comparison list; one test fixture was incorrectly
attributed to the earlier production implementation commit; and Windows line-ending
warnings were classified as whitespace failures. The validator and audit attribution
were corrected. The test file's actual introduction is `2bfad5e9`, not `7639e995`.

A subsequent new-file check with autocrlf disabled treated CRLF carriage returns as
trailing whitespace. It reported 41 passes and one failure. Explicit cr-at-eol handling
corrected this diagnostic without changing original files or weakening checks for
actual trailing spaces, blank EOF lines, or spaces before tabs. Final validation
passes all 42 checks. These were audit-tool/report issues, not newly failing application tests.

## Environment warnings and unverified checks

Requests emits a dependency compatibility warning for urllib3 2.6.3 and
chardet 7.3.0 / charset_normalizer 3.4.6. The probes patch HTTP and do not establish
live request compatibility; dependencies were not changed. The default Windows
console initially could not encode one Unicode source snippet; UTF-8 reads and
ASCII-escaped diagnostic output were used thereafter. No input was decoded with
replacement or rewritten.

Application unit/browser/accessibility/build suites were **not rerun**, because no
application implementation was changed and this task authorizes a read-only forensic
audit. Existing reports are historical evidence, not newly passed tests. Remote CI,
AWS/SAM deployment, live feeds, raw provider archives, private/deleted forks,
remote-only main code, current regulatory applicability, dataset-specific rights,
and independent observational calibration remain unverified. See METHODOLOGY.md
and DATA_PROVENANCE.md for exact scope and exclusions.
