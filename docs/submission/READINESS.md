# AERIS submission readiness — local verification, 2026-10-10

The local snapshot demo and implementation are ready for owner review. They demonstrate observation display, source candidates, an uncalibrated plume baseline, spatial ranking and advisory review. They do not establish calibrated forecast skill, operational safety, current live-feed availability or a deployed version containing these changes.

The approved submission scope is [CHANGE_INVENTORY.json](CHANGE_INVENTORY.json): 126 included paths across 15 meaningful groups, comprising 53 initially modified tracked files and 73 initially untracked files. Fifty of those files preserve unchanged historical audit evidence. One additional path is explicitly excluded as a local-only owner document and is not needed by submitted documentation. [VERIFICATION.json](VERIFICATION.json) records the original validation baseline and subsequent commit-group validation separately, including toolchains, actual results, preservation checks and unverified environments.

## Pre-commit verification baseline and preservation

- Branch: `feature/frontend-audit-heatmap`; HEAD and local upstream ref: `69442916784d10385df1ce8fa38b568b29ad27ed`.
- Integrated local `origin/main`: `63aa200cbf98a268d785e14fef820757880190a9`; HEAD is one commit ahead. These are local refs, not a claim of a newly fetched remote state.
- Initial working tree: nine modified tracked model files and 54 untracked paths. The existing frontend milestone `6944291` remains intact. PR #24 was inspected as Draft; it was not modified.
- `stash@{0}` remains `dc269a1ecf4a487e8e3e2064fa18fee3e9e67062`, the Pritam remediation backup before integration.
- Recovery: `C:\Users\LENOVO\AppData\Local\Temp\aeris-submission-recovery-kjtukbx2\working-files.zip` and `baseline.json`, created before implementation. The recovery archive is outside the repository and is not intended for a commit.
- SHA-256 comparisons cover 130 baseline paths: 12 live captures, seven original public-data files, 50 original audit files, 56 Lambda staging/build files, three ignored optional ML artifacts and two workflows. All remain byte-for-byte unchanged. The new public provenance manifest is separate from captured data.
- During the original implementation/verification phase, HEAD, branch, index SHA-256 and stash identity were unchanged; no staging or commits occurred. The owner subsequently authorized 15 local commits on the separate `feature/submission-readiness` branch, preserving `feature/frontend-audit-heatmap` and PR #24. The stash, captured data, recovery files and excluded owner document remain preserved. No push, merge, PR edit or billing operation is authorized in this execution. No dependency versions, scientific equations or model parameter values were tuned.

## Confirmed defects and implemented corrections

The integrated teammate fixes already protected FIRMS total failures, empty AQI/site publication, WorldPop Lambda empty outputs and wind batch coverage. This work preserves those changes and closes additional gaps established by implementation and regression tests.

| Area | Confirmed gap | Correction and evidence |
| --- | --- | --- |
| FIRMS | Nonfinite/out-of-range readings and malformed acquisition times could be accepted; absent times became midnight; unknown confidence could be promoted | Reject invalid records, preserve valid neighboring rows, require actual acquisition time and recognized confidence; `ingest/tests/test_feed_boundaries.py` |
| AQI | Zero coordinates/readings could be lost through truthy defaults; invalid coordinates and ambiguous timestamps entered downstream data; all-null readings could refresh a snapshot | Preserve valid zero, enforce finite/range checks, retain ambiguous CPCB source timestamps without inventing UTC, disclose AQI method and unknown coverage, block unusable refreshes; both new ingestion regression files |
| WorldPop | Failed streaming downloads could replace a good cache; the CLI could publish an empty result | Replace cache only after a completed nonempty download; guard CLI publication; `test_feed_boundaries.py` and `test_submission_integrity.py` |
| Wind | Successful batches did not necessarily contain usable hourly samples | Preserve the existing batch contract, separately disclose usable-hourly coverage and reject no-hour publication; ingestion tests and `MapContainer.test.tsx` |
| Stored JSON and publication | Platform newline transformations could change byte bindings; nonfinite JSON and bad feed batches could publish | Deterministic UTF-8 writes, strict finite JSON, exact stored-byte reads and pre-write batch validation; `pipeline/tests/test_provenance_integration.py` |
| Model provenance | Producer metadata did not survive production, API/static parsing, ranking, advice and browser display | Hash-bound companions and exact archive identification survive all those paths. Static publication checks fail for stale bindings; API tests and real browser journeys verify visible legacy disclosures |
| Advice | Missing evidence became invented ETA, concentration or threats; clinical/legal directives and countdown labels overstated support | Evidence-based rules, advisory-only context, bounded deadlines, explicit forecast-relative or unknown scheduling references, conservative UI/export wording; agent, advisory helper and browser tests |
| Heatmap lifecycle | The hook ran before the map ref was created and missed its load event, leaving Fit observed cells disabled | Attach after mount effects while preserving the initial-load guard and cleanup; existing lifecycle tests plus a new later-map-mount regression |
| Keyboard heatmap controls | Scrollable legend/table regions were inaccessible to keyboard users | Focusable named regions; keyboard regression and browser/axe checks |
| Local demo | Documented `127.0.0.1` frontend origin was rejected, while prefix matching accepted lookalikes | Parse and permit exact HTTP loopback origins only; nine local API origin tests |

Earlier misleading forecast/wind fallbacks and the three frontend failures were addressed in committed milestone `6944291`; the current work preserves that coverage and adds archive/AQI/coverage distinctions. Test expectations changed only where intended visible labels changed, while numeric and visibility assertions remain.

## Pritam finding disposition

Original categories and severity come from the unchanged [FINDINGS.csv](../audits/hardcoded-data/2026-10-10/FINDINGS.csv). Updated dispositions below do not rewrite the original historical report.

| Finding | Original classification | Verified disposition | Evidence and remaining requirement |
| --- | --- | --- | --- |
| SCI-055 | A / High / risk | Partially mitigated: disclosure and integration gap closed | Exact ten-source archive identification in model registry, API, static metadata and all browser views. Current replay yields 22 clusters from a 227-record fire capture; this is not the original run. Original input/parameter binding remains unknown. Model provenance and integration tests cover both statuses |
| SCI-056 | A / High / risk | Partially mitigated: legacy floors and lineage are visible | Exact 50-feature archive is disclosed as obsolete simulation with concentration/risk floors. New outputs record actual parameters, source/wind hashes and forecast start. Original archived bindings and observational skill remain unknown; static/API/browser tests verify disclosure |
| SCI-022 | C / Medium / risk | Explicit, validated baseline; scientifically unvalidated | Existing parameter boundary tests retained; actual detector parameters recorded in companions. Independent source-attribution and threshold validation is still required |
| SCI-023 | C / Medium / risk | Heuristic semantics disclosed; scientifically unvalidated | Unchanged 0.4/0.3/0.3 confidence weights, seasonal/geographic source-type proxy and normalized FRP are recorded and labelled. Land-use evidence, emission mass and calibrated probability are not established |
| SCI-025 | C / Medium / risk | Uncalibrated baseline explicitly retained | Actual loaded parameters are recorded; existing calibration-loader failure/eligibility checks pass. No suitable historical observations or held-out forecast-skill result were created |
| SCI-027 | C / Medium / risk | Interpretation mitigated; receptor calibration unresolved | Band grid/time maximum is distinct from receptor concentration, risk probability and population health outcomes in metadata, UI and advice. No equation changes or unvalidated receptor substitutions |
| SCI-049 | D / Medium / risk | Trust boundary fixed; supplier trust remains required | Eighteen artifact-trust tests pass, including a prohibition on all file reads before trust. Caller metadata/context and invalid trust values cannot grant access. Pickle remains executable trusted code; checksum matching is neither authentication nor a sandbox |

The [original contributor tally](../audits/hardcoded-data/2026-10-10/contributor-work-tally/CONTRIBUTOR_WORK_TALLY.md) and remediation report are preserved. This milestone crosses ingestion, storage, API, pipeline, agent and frontend contracts only where necessary to close verified integrity and provenance gaps.

## Original pre-commit validation

Python: `D:\AERIS\.venv\Scripts\python.exe`, **3.14.3**, Windows AMD64. Node: `C:\Program Files\nodejs\node.exe`, **24.16.0**. Final browser: installed Microsoft Edge **155.0.4283.45**, Playwright **1.64.0**. Python 3.12 was not run in this milestone; prior Python 3.12 evidence is not new verification.

| Check actually executed | Result / exit code |
| --- | --- |
| Complete Python suite | **701 passed, 2 warnings**, 21.69 s / 0 |
| Complete Vitest suite | **179 passed across 15 files**, 2.63 s / 0 |
| TypeScript app, node and browser configurations | All three passed / 0 each |
| Oxlint | Passed with seven existing warnings / 0 |
| Vite production build to a temporary output directory | Passed, 2,059 modules; bundle-size warning / 0 |
| Edge production browser suite | **30 passed, 0 failed, 0 skipped, 0 flaky**, 77.294 s / 0 |
| Automated axe checks within browser suite | Zero reported violations across eight views and tested modal/heatmap journeys |
| Static provenance manifest check | Passed / 0 |
| Lambda verifier `--config-only` | Passed: ten Python 3.12 ARM64 functions, four dependency groups / 0; wheels explicitly not checked |
| Read-only audit JSON/CSV syntax and preservation | Passed; original reports were not regenerated |
| Pending Markdown local file links | Checked; see verification record for scope |
| `git diff --check` | Passed / 0; Windows line-ending advisories remain |
| Pattern scan of pending file bytes | No selected token/private-key patterns found; not an exhaustive secret certification |

Executed Python command from the repository root:

```powershell
.\.venv\Scripts\python.exe -B -X utf8 -m pytest -ra -p no:cacheprovider --basetemp "$env:TEMP\aeris-submission-full-final"
.\.venv\Scripts\python.exe -B -X utf8 -m scripts.publish_model_provenance --check
.\.venv\Scripts\python.exe -B -X utf8 scripts/verify_lambda_dependencies.py --config-only
git diff --check
```

Executed TypeScript/lint commands from `web`:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.app.json --noEmit --incremental false --pretty false
.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --incremental false --pretty false
.\node_modules\.bin\tsc.cmd -p tsconfig.browser.json --noEmit --incremental false --pretty false
.\node_modules\.bin\oxlint.cmd
```

Vitest and Vite were run through their Node APIs with temporary cache/output directories, avoiding changes to repository caches, `web/dist`, Lambda staging copies or captured feeds. Vitest used `startVitest([], {run:true, watch:false, cache:false, fsModuleCache:false, configLoader:'runner'}, {cacheDir:<temporary directory>})`. Vite used the existing React/alias/relative-base configuration, disabled source maps and built snapshot mode to a temporary directory. TypeScript checks ran separately rather than through `npm run build`.

Playwright used `web/tests/browser/dashboard.spec.ts` and the existing configuration, with a temporary output/report directory and preview URL `http://127.0.0.1:4174`. Final browser evidence is at `C:\Users\LENOVO\AppData\Local\Temp\aeris-submission-final-zZgu4s\results.json`. Basemap styles/tiles/glyphs and optional font CSS were intercepted as test assets; normal journeys used real atmospheric captures and real MapLibre workers/WebGL. Software rendering, viewport tests and axe cannot establish every device, assistive technology or external service behavior. No axe rules or failing checks were disabled.

For normal owner reproduction (these commands may create ignored build/cache/report artifacts):

```powershell
Set-Location D:\AERIS\web
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Python warnings are an installed Requests dependency compatibility warning and joblib's Windows physical-core lookup fallback. Lint warnings are four Fast Refresh export warnings, two existing effect/set-state warnings and one ref cleanup warning. The main production chunk is 1,384.67 kB (387.51 kB gzip); the map worker is 508.31 kB. No dependency versions or validation rules were changed to suppress warnings.

Initial failures were diagnosed, not hidden: obsolete AQI-label assertions were corrected while preserving value checks; a proposed wind change was corrected to preserve teammate batch-coverage semantics; the existing heatmap initial-load regression was preserved while fixing mount order; real browser failures led to keyboard-scroll fixes and reproducible external-font test fixtures. Final suites above ran after those implementation corrections.

## Data and operational limits

- The observed PM2.5 heatmap uses real timestamped station readings: 59 eligible readings in 28 occupied 0.1-degree cells from 60 captured records. Values span 1.1–235 µg/m³; observation dates span September 30–October 7, 2026 and are stale on the audit date. Arithmetic cell means are neither interpolation nor a calibrated continuous exposure field. Unknown averaging periods and quality/coverage limits remain visible.
- The source archive has ten sources. The corridor archive has 50 features, including 40 bands, generated `2026-10-08T14:52:16.643513Z` for forecast start `2026-10-07T18:00:00Z`. Later ranking/action generation times do not prove a shared original run. The preserved action archive can contain old operational wording; it is explicitly historical review material.
- CPCB naive timestamps remain ambiguous. AQI provider helpers can return an empty list for either no eligible readings or a fetch failure; coverage is therefore unknown rather than a fabricated success/failure claim. HTTP mocks are not live provider validation.
- Wind batch completion and usable-hourly coverage are distinct. Neither alone proves complete route/time coverage; the plume WindField still validates requested coverage and can correctly reject stale wind captures.
- Hash bindings detect changed bytes, not forged suppliers or observational validity. Output and companion are separate object writes; a partial write can produce a mismatch that readers reject. Prevalidation blocks known bad batches, but a storage failure during publication is not an atomic cross-object transaction.
- Population/risk are spatial and threshold-sensitivity proxies, not clinical confidence intervals or health probabilities. Bedrock was tested with stubs; free-form grounding is not guaranteed. All generated plans require human review and are advisory only.
- Browser SHA-256 needs HTTPS or loopback secure context. Basemap/glyph/font availability was not verified remotely. Keyboard/axe/Edge coverage is substantial local evidence, not certification for every user environment.
- Lambda configuration checks and packaging regression tests passed, but this milestone did not remeasure a native deployment assembly, download Linux ARM64 wheels, run SAM, invoke Bedrock or deploy AWS. Ignored staging copies were deliberately preserved and must be refreshed by the existing staging/build process for a real deployment. Old package-size reports are not evidence for a newly assembled package containing these changes.
- Remote CI, live feeds, current deployed code, historical calibration, forecast accuracy, measured impact, AWS cost and the final submitted video/blog remain unverified. No GitHub billing restriction was changed or claimed fixed.

## Review and next actions

Review the [three-minute demo](../demo-script.md), [submission documentation](README.md), [blog draft](aws-builder-blog.md), [frontend audit](../../web/FRONTEND_AUDIT.md) and the included/excluded paths and ordered groups in the change inventory. The appropriate future PR scope is **data integrity, provenance propagation, advisory limits, frontend lifecycle/accessibility and verified local demo documentation**; it should not claim new scientific calibration or a successful deployment.

The owner approved the local branch and 15 dependency-ordered commit groups, with one local-only exclusion. Pushes, merges and PR creation/updates remain separate owner decisions and were not performed. Fifteen reviewable groups are supported; 25–30 would fragment coupled changes artificially. Independent calibration, authenticated artifact distribution, live-feed verification and native Linux ARM64 deployment validation are genuine future milestones requiring evidence or infrastructure. No further unrelated implementation is needed for this local readiness milestone.

## Approved local commit execution

The owner subsequently approved the 15 dependency-ordered groups on `feature/submission-readiness`, based on `6944291`, with the owner document excluded. The submission inventory contains **126 committed paths and one separately counted local-only exclusion**; no submitted documentation depends on that excluded file. Its bytes remain unchanged and it remains untracked. The original branch/ref and PR #24 are preserved. Group checks ran against the full preserved working tree, not isolated intermediate checkouts. Every staged scope was checked against its explicit file list and reviewed with `git diff --cached --check` and `git diff --cached --stat`.

The final group reran the full Python suite (**701 passed, two environment warnings, 16.50 s**, Python 3.14.3), `npm.cmd test` (**179 passed, 15 files, 2.97 s**), `npm.cmd run typecheck`, `npm.cmd run lint` (same seven warnings), `npm.cmd run build` (same bundle warning), and `npm.cmd run test:e2e` (**30 passed**, installed Edge 155.0.4283.45). All commands returned zero. Static provenance, the Lambda configuration-only verifier and documentation/inventory checks also returned zero; **63 local links in 11 submitted Markdown files** resolved. Exact argument lists, per-group results and log locations are recorded separately in VERIFICATION.json.

Normal npm commands created ignored build/cache/browser artifacts during this execution; none were staged. Browser cases passed, but preview-server shutdown stalled in this managed Windows session. Only each test's identified Vite preview server was terminated with elevated `taskkill` after all 30 cases completed, and each browser runner then exited zero. A PowerShell Stop-Process attempt failed with a .NET error; an elevated-helper attempt lacked access to its temporary file and ran no tests. These operational issues are recorded, and no browser checks or configuration were weakened. Node also printed a cosmetic NO_COLOR/FORCE_COLOR conflict warning.

All 130 protected baseline paths, both original recovery files and `stash@{0}` were rechecked. The final documentation commit is the commit containing this report; its own hash is not embedded as a fabricated self-reference. No push, merge or PR operation was performed. Python 3.12, remote CI, live feeds, Linux ARM64 packaging, native package sizes, SAM/AWS deployment and independent scientific calibration remain unverified.
