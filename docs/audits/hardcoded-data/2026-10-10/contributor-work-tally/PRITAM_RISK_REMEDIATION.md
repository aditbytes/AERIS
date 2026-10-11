# Pritam work-area risk remediation — 2026-10-10

Repository: D:/AERIS. Branch: feature/frontend-audit-heatmap.
Baseline HEAD: 7cf0572049d69b550cbb42d7e74cf5472d521793.
Changes remain uncommitted in the working tree.

## Scope and assessment

The four contributor-work-tally reports and the original FINDINGS.csv,
EXECUTIVE_SUMMARY.md, DATA_PROVENANCE.md and VALIDATION.md were read before
implementation. Scope was selected by work_bucket=Pritam and status=risk,
not by filename resemblance or author metadata. Exactly seven rows matched:
SCI-055 and SCI-056 (High), SCI-022, SCI-023, SCI-025, SCI-027 and SCI-049
(Medium). Shared and unassigned findings were excluded. No assignment ambiguity
was found for these seven rows.

Original audit classifications are retained. No original audit, tally CSV or
earlier report was overwritten. This report is a separate revised assessment:
four risks have bounded mitigations; three intentional baseline/statistic risks
remain accepted only for explicitly unvalidated numerical use. No finding is
declared scientifically validated or fully closed.

| ID | Original severity / classification | Final disposition | Remaining limitation |
|---|---|---|---|
| SCI-055 | High / potential risk | Partially mitigated: exact archived source bytes identified in a hash registry and read-only inspector; new CLI exports can carry companion provenance | Original run/input/parameter binding is unknown; existing pipeline/API/static UI do not automatically consume these labels |
| SCI-056 | High / potential risk | Partially mitigated: legacy corridor floors explicitly disclosed by hash; companion lineage and peak semantics added for new CLI exports | Archive remains preserved and directly readable; no replacement calibrated forecast or downstream operational gate |
| SCI-022 | Medium / potential risk | Accepted unvalidated baseline; actual selected parameters can be recorded without changing clustering | No causal/source-attribution validation; parameter sensitivity remains |
| SCI-023 | Medium / potential risk | Mitigated for companion-enabled exports: named unchanged confidence weights and explicit heuristic/type/emission labels | The original type/confidence fields still reach consumers without automatic land-use or probability validation |
| SCI-025 | Medium / potential risk | Accepted uncalibrated physics; actual parameters/source and calibration availability can be recorded | No eligible independent historical calibration or demonstrated observed skill |
| SCI-027 | Medium / potential risk | Accepted documented source-band peak statistic; companion explicitly excludes receptor-concentration/health-probability interpretations | Ranking/exposure consumers still use their existing proxy; receptor validation is not implemented by this change |
| SCI-049 | Medium / potential risk | Mitigated: explicit caller/deployer trust required before artifact reads/deserialization; compatibility/integrity checks preserved | Trust acknowledgment is not authentication or a pickle sandbox; a malicious artifact remains unsafe if trust is incorrectly granted |

This is responsibility-area remediation, not a conclusion about personal authorship
or fault. The original seven-risk tally remains a valid historical result.

## Evidence, reproduction and individual outcomes

### SCI-055 — Ten archived sources from the removed detector

Original location: data/live/sources.json:1–135; entire sources snapshot.
Runtime path: offline browser publication / API source feed, agent source tools,
or archived sources passed to pipeline.steps.corridor_handler and
models.plume.corridor.predict_corridor. Current producer:
models.source_detection.cluster.detect_sources; new inspector:
models.common.provenance.inspect_artifact.

Expected: consumers can distinguish preserved legacy heuristic output from a
current detector replay and from observed physical-source attribution.
Before: no artifact version or original parameter/input-byte binding. The executed
read-only replay found 10 archived sources versus 22 current sources from the
same stored fire capture. Two archived industrial_fire labels are not emitted by
the current detector. The existing audit reports nine rounded-strength matches
to the legacy FRP/150 rule; it does not establish a complete original run manifest.

Reproduction: load the two real JSON files with encoding="utf-8", run
detect_sources(fires), and compare source counts. Repeated default and three
override replays also match the pre-remediation HEAD detector exactly.

Mitigation: models/ARCHIVED_OUTPUTS.json binds the existing source SHA-256
900b5925955635660d90295b2324083fc52a23a3596aaab9450f518a7221135a,
with ARCHIVED_LEGACY / LEGACY_UNVERSIONED, NOT_RECORDED original bindings and
NOT_ESTABLISHED operational validation. The inspector matches exact copies,
not filenames, and does not declare edited/reserialized unknown files current.
The source CLI optionally records new-output provenance in a separate file.

Focused regression: test_known_archive_is_labelled_by_exact_content[sources],
test_edited_or_reserialized_archive_is_unknown and
test_source_cli_writes_bound_heuristic_manifest. The two actual snapshots were
not regenerated, edited or re-encoded. This verified provenance risk is only
partially mitigated; no source-clustering defect is inferred from different counts.

### SCI-056 — Archived corridor retains removed concentration/risk floors

Original location: data/live/corridor.geojson:1–4518; entire FeatureCollection.
Runtime path: static browser / API corridor feed, exposure/ranking and agent
corridor tools. New producer metadata: models.plume.corridor.main.
Current scientific band symbol: models/plume/corridor.py:_band_features:149–167.

Expected: archived simulation is labelled as legacy and cannot be mistaken for
measured PM2.5, the current Gaussian-puff calculation or calibrated forecast skill.
Before: 50 archived features, including 40 bands. The deterministic probe confirmed
all 40 band concentrations and risk scores match the removed rules:

    concentration = round(max(15, 160 * strength * exp(-midpoint_hour / 20)), 1)
    risk = round(min(0.98, max(0.2, strength * (1 - hour_from / 30))), 2)

Forecast start remains 2026-10-07T18:00:00Z; generated_at remains
2026-10-08T14:52:16.643513Z. Neither timestamp is silently advanced.

Mitigation: the registry binds SHA-256
32f81bc4e31b03fdc2ea9282bc447da410b80c2d1a6a245d7767b60b10fbd603
to SCI-056 and describes the obsolete floors without claiming an exact generator
revision, observed concentrations or original parameter binding. New CLI companions
record source/wind byte hashes, legacy source lineage, forecast start, selected
parameters/source and explicit concentration/risk semantics. Wind coverage remains
strict; a 48-hour unsupported replay fails without changing prior outputs.

Focused regression: test_known_archive_is_labelled_by_exact_content[corridor],
test_corridor_cli_labels_peak_and_legacy_source_lineage and
test_corridor_failure_preserves_captured_inputs_and_prior_outputs.
The archive is unchanged. This is a verified legacy-artifact risk, not evidence
that the current plume equations have mandatory positive floors.

### SCI-022 — Unvalidated detection parameters

Audit range: models/source_detection/cluster.py:31–40.
Current symbol: SourceDetectionParams:28–55; detect_sources and cluster_fires.
Runtime: pure detector -> pipeline detect handler -> source outputs consumed by
plume, agent and browser.

Expected: invalid configurations fail; valid configurations remain declared
engineering assumptions, not empirically proven causal-source parameters.
Before and after: 24-hour window, 7.5 km epsilon, 3 samples, nominal confidence,
drop-noise policy, 500 MW FRP scale, count scale 10 and regional bbox remain
unchanged and configurable. Probe: default produces 22 clusters; eps_km=15
produces 11. Changing frp_scale_mw to 1000 retains 22 clusters but changes strength
interpretation. This is expected sensitivity, not a demonstrated clustering bug.

Mitigation/disposition: preserve validated parameter boundaries and public output
shape; companion-enabled CLI exports record the actual selected values and
EXPLICIT_OR_BASELINE_UNCALIBRATED. No thresholds were tuned to the captured data.
Existing parameter, missing-field, finite-number, filtering, temporal and
geospatial regressions passed. Observational/source-attribution validity remains
unverified; the numerical baseline risk is accepted with that limit.

### SCI-023 — Heuristic confidence and geographic/season type proxy

Audit range: models/source_detection/cluster.py:210–215.
Current symbol: _source_metrics:198–226; named _CONFIDENCE_WEIGHTS.
Runtime: detector output confidence/type/emission fields -> plume/agent/UI consumers.

Expected: confidence is a heuristic score, stubble_burning is an unverified regional
season proxy and normalized FRP is not measured emission mass.
Reproduction: an explicitly labelled mathematical fixture of three coincident
points at 30N, 73.9E in October, with no land-use input, produces stubble_burning
and confidence 0.7036727117273128. It supplies no land-use or ground-truth evidence.
The lack of such inputs is a verified limitation, not evidence of actual crop type.

Mitigation: name the existing 0.4/0.3/0.3 weights without changing their order or
values. Companion semantics explicitly say HEURISTIC_SCORE_NOT_PROBABILITY,
REGION_SEASON_PROXY_NOT_VERIFIED_LAND_USE and
NORMALIZED_FRP_PROXY_NOT_EMISSION_MASS. Existing schema/type values are preserved.
Default and override real replays remain exactly equal to HEAD.

Regression: source companion semantics, explicit/stale reference times, existing
confidence formula/monotonicity and bbox/season boundary tests. This does not
establish land use or remove the need for disclosure in downstream consumers.

### SCI-025 — Assumed plume physical/numerical parameters

Audit range: models/plume/advect.py:55–69.
Current symbol: PlumeParams:52–83; resolve_params; parameters.load_parameters.
Runtime: predict_corridor -> projected transport/Gaussian grid/band output;
optional numerical teacher also uses this baseline.

Expected: valid parameters can compute a baseline; missing scientific history
must not be replaced by invented calibration or claimed observed accuracy.
Reproduction: load_parameters().provenance is BASELINE; params.json is absent.
The existing 15 physical/numerical defaults and validation constraints were
inspected and remain unchanged, including 2000 m sigma, spread 1000 m/sqrt(hour),
24-hour decay and the empirical concentration conversion.

Disposition: accepted uncalibrated baseline with optional actual-parameter/source
recording. No calibration file, observations, background, fitted coefficients or
performance evidence was fabricated. Existing calibration/history, invalid
parameter, null-weather, distance/time-gap and coverage tests passed.
advect.py and parameters.py are byte-unchanged. Companions never infer operational
skill from a parameter-source string; explicit parameter-artifact CLI values remain
conservatively labelled explicit rather than receiving automatic observational claims.

### SCI-027 — Band peak is not receptor concentration

Audit/current location: models/plume/corridor.py:_band_features:149–167;
predict_corridor computes hourly grid envelopes.
Runtime: polygon band properties -> exposure/ranking -> recommendations and browser.

Expected under the existing documented contract: concentration is the source-band
maximum over sampled grid cells/time frames; risk is a relative heuristic score.
It is not uniform concentration, a local facility sample or a health probability.
Reproduction: the labelled mathematical grid [10, 0, 50] creates two disconnected
polygons, each carrying the source-band peak 50 ug/m3. This matches the documented
statistic. No incorrect implementation of that statistic was demonstrated.

Disposition: preserve the statistic, equations and GeoJSON properties. Companion
labels say SOURCE_BAND_GRID_TIME_PEAK_NOT_RECEPTOR_CONCENTRATION and
UNCALIBRATED_RELATIVE_SCORE_NOT_HEALTH_PROBABILITY, with ug/m3 units.
concentration_at() remains the point sampler for separately validated receptor work.
The ASTs of _band_features, predict_corridor, concentration_at and
concentration_grid match HEAD exactly. Numeric band/exposure behavior was not changed.
Meenal's downstream SCI-033 risk is outside the seven assigned rows and remains
unmodified; replacing its proxy requires separate shared-contract work.

### SCI-049 — Supplier checksum cannot authorize pickle execution

Audit artifact: .venv/task4-surrogate/model/model.pkl, an ignored 792,417-byte file.
Current loading symbol: models/training/inference.py:model_fn:32–77;
callers predict_point, evaluate CLI and optional SageMaker loading.
Reachability: development/explicit optional surrogate use, not the production
corridor. No evidence establishes that the ignored artifact is publicly exposed.

Expected: only an independently trusted supplier may be deserialized; checksum,
type and compatibility checks are not a security sandbox.
Initial probe on the preserved local artifact was blocked by incompatible
physics/provenance metadata before the patched deserializer. No original pickle
was executed. That particular file did not demonstrate a present exploitable path.

A focused negative test then constructed supplier-controlled compatibility
metadata/checksum using current public declarations and non-pickle test bytes.
pickle.loads was patched to raise a marker; the pre-fix loader reached that marker
without a trust acknowledgment. This reproduces the general trust-boundary gap
without executing a pickle or inventing training/observational data.

Fix: model_fn now requires trusted_artifact=True, or the exact server environment
setting AERIS_TRUST_MODEL_ARTIFACT=1 when the keyword is omitted. False overrides
server trust. Nonboolean keyword arguments are rejected; other environment strings,
metadata and request context cannot authorize loading. Trust is checked before
artifact reads. Existing software, physics, configuration, provenance, checksum
and estimator checks remain. predict_point forwards the keyword; physics default
selection is unchanged. SageMaker's existing positional model_dir/context calling
shape is preserved, with explicit deployer configuration now required.
Known-local training fixtures in test_surrogate.py explicitly acknowledge trust.

Regressions cover default denial, six invalid environment values, explicit trust,
explicit distrust, nonboolean arguments, context nonauthorization, point selection
and retained checksum validation. A malicious pickle is still unsafe when an
operator incorrectly grants trust. No restrictive-unpickler or sandbox claim is made.
The ignored model, metadata and dataset remain byte-for-byte unchanged; no expensive
training or artifact regeneration was run. Existing tiny training fixtures are
part of the executed test suites and were stored only in ignored test temporaries.

## Implementation files

Modified tracked files:

- models/source_detection/cluster.py — named unchanged confidence weights and optional source CLI companion.
- models/plume/corridor.py — optional plume CLI companion; scientific functions unchanged.
- models/training/inference.py — explicit pre-deserialization trust gate.
- models/training/predict.py — forward optional trust acknowledgment.
- models/training/tests/test_surrogate.py — trust only the existing locally generated test artifacts; assertions retained.
- models/source_detection/README.md — companion/archive instructions and limitations.
- models/plume/README.md — lineage, peak semantics and coverage instructions.
- models/training/README.md — caller/deployer trust requirements and retained compatibility guards.
- models/README.md — dated addendum; earlier release evidence remains historical.

New files:

- models/ARCHIVED_OUTPUTS.json — two exact-byte legacy descriptions, not new scientific observations.
- models/common/provenance.py — strict read-only archive/companion inspection and manifest preparation.
- models/common/tests/test_provenance.py — archive, hashing, malformed/missing/stale/path/coverage regressions.
- models/training/tests/test_artifact_trust.py — safe deserializer instrumentation and trust regressions.
- This PRITAM_RISK_REMEDIATION.md report.

No application files outside models were changed. No shared schema, downstream
consumer, ingestion code, dependency manifest, CI workflow or scientific dataset
was modified. Existing Lambda staging rules already include the new helper/registry;
an isolated staging test confirmed both and excluded tests/training. Original
generated infra/lambda copies were preserved rather than silently refreshed.

## Executed tests and validation

All pytest runs used:
D:\AERIS\.venv\Scripts\python.exe — Python 3.14.3 (Windows x64).
Python314 is the only installed runtime found at the inspected local locations;
the py launcher failed to execute. No Python 3.12 runtime pass is claimed.
No warnings were suppressed.

For the commands below, the exact common prefix is:

    .\.venv\Scripts\python.exe -B -X utf8 -m pytest

PYTHONDONTWRITEBYTECODE=1 was set in each test process.
The two focused files are:
models/common/tests/test_provenance.py and models/training/tests/test_artifact_trust.py.

| Command arguments following the prefix | Exit | Actual result |
|---|---:|---|
| models/common/tests/test_provenance.py models/training/tests/test_artifact_trust.py -q -p no:cacheprovider --basetemp=.venv/qa-pritam-before | 1 | Before implementation: 27 failed, 1 passed, 2.73 s; missing provenance feature and absent trust guard demonstrated |
| models/common/tests/test_provenance.py models/training/tests/test_artifact_trust.py -q -p no:cacheprovider --basetemp=.venv/qa-pritam-narrow | 1 | 1 failed, 27 passed, 3.09 s; Windows text-writer newline conversion made the first companion hash incorrect |
| models/common/tests/test_provenance.py models/training/tests/test_artifact_trust.py -q -p no:cacheprovider --basetemp=.venv/qa-pritam-narrow-final | 0 | 28 passed, 2.28 s, after recording actual platform newline bytes |
| models/common/tests/test_provenance.py models/training/tests/test_artifact_trust.py -q -p no:cacheprovider --basetemp=.venv/qa-pritam-narrow-extended | 1 | 5 failed, 29 passed, 3.10 s; newly inserted test displaced three test lines, causing NameError; corrected in the test harness |
| models/common/tests/test_provenance.py models/training/tests/test_artifact_trust.py -q -p no:cacheprovider --basetemp=.venv/qa-pritam-narrow-complete | 0 | 34 passed, 1.95 s |
| models pipeline scripts/tests -q -p no:cacheprovider --basetemp=.venv/qa-pritam-broad | 0 | 443 passed, 1 warning, 21.58 s |
| models/common/tests/test_provenance.py models/training/tests/test_artifact_trust.py -q -p no:cacheprovider --basetemp=.venv/qa-pritam-narrow-boundaries | 0 | Final focused suite: 41 passed, 3.85 s, including additional missing/stale/coverage/context checks |
| -q -p no:cacheprovider --basetemp=.venv/qa-pritam-full | 0 | Complete repository suite: 611 passed, 2 warnings, 23.38 s |

Windows hash handling uses the same newline conversion as the existing text writers.
Regression tests confirm both source and plume output bytes are identical with
and without companion export; the hashes bind the actual emitted bytes.

Additional executed checks:

- Read-only seven-risk probes: exit 0; archive source counts 10/22, legacy floor
  matches 40/40, detection epsilon sensitivity 22/11, October bbox-only heuristic
  classification, BASELINE parameter source/no params.json, disconnected polygon
  peaks [50, 50], and original-ML incompatibility before deserialization.
- Four current-vs-HEAD source replays: exact dictionary equality for default,
  eps_km=15, frp_scale_mw=1000 and min_samples=1/individual noise parameters.
- AST equality for predict_corridor, _band_features, concentration_at and
  concentration_grid: pass; no numeric equations changed.
- Python 3.12 grammar parsing: all 32 Python files under models passed
  ast.parse(..., feature_version=(3,12)) on Python 3.14. This is syntax-only.
- Isolated stage_sources() call: 51 runtime source/assets, including the new
  provenance module and registry; their bytes matched originals. No tests or
  optional training package staged. This was source staging, not SAM/native
  dependency assembly, deployed package-size measurement or deployment.
- Read-only inspector commands below: exit 0; both actual archives reported
  ARCHIVED_LEGACY / NOT_ESTABLISHED operational validation.
- git diff --check and new-file whitespace checks: passed.
- Protection checks: 389 of 398 pre-existing protected paths remain byte-identical;
  exactly nine intended tracked model code/docs/test paths changed. All 19
  data/live and web/public/data files, all three selected ignored ML artifacts,
  all 49 pre-existing audit/tally/partial reports and all 49 generated staging
  files remain byte-identical. HEAD, branch and index hash are unchanged.
  No files were staged or committed.

Environment warnings in the complete suite:
Requests reports urllib3 2.6.3 / chardet 7.3.0 / charset_normalizer 3.4.6
compatibility; joblib cannot run Windows physical-core discovery and falls back
to logical-core count. Neither warning was hidden or addressed with arbitrary
dependency changes.

## Review and read-only usage

From D:\AERIS:

    git status --short
    git diff --stat
    git diff --check
    git diff -- models
    git ls-files --others --exclude-standard
    .\.venv\Scripts\python.exe -B -X utf8 -m models.common.provenance data/live/sources.json --kind sources
    .\.venv\Scripts\python.exe -B -X utf8 -m models.common.provenance data/live/corridor.geojson --kind corridor

Inspect the new JSON/helper/tests/report explicitly: git diff does not include
untracked-file content. Companion exports must use isolated output directories;
the read-only commands above do not regenerate any snapshot.

## Before/after and unresolved work

Original confirmed defects in these seven rows: 0. No fabricated calibration or
numeric retuning was attempted. The reproduced deserialization authorization gap
is blocked by default; that does not erase the inherent trusted-pickle risk.

Four bounded risk mitigations: SCI-055, SCI-056, SCI-023 and SCI-049.
Three accepted unvalidated baseline/statistic risks: SCI-022, SCI-025 and SCI-027.
These seven dispositions are exclusive; remaining aspects below overlap them.

The two High findings each retain a downstream operational limitation: the
read-only registry and optional CLI companions do not automatically label or
block archived API/browser data. Consumers must adopt version/lineage/disclosure
contracts before operational claims. Changing Saba/Aditya consumer behavior would
require separately coordinated shared-contract work; no such code was changed.

Meenal's exposure proxy continues to consume source-band peaks; it was not
silently replaced with an unvalidated receptor calculation. Historical calibration,
land-use confirmation, satellite-confidence probability interpretation and
independent observed forecast skill remain unavailable. A valid schema is not
evidence of those properties.

Companion hashes bind exact UTF-8 output/input bytes and the entry-module code,
not every transitive package/source or an authenticated supplier. A registry
match is limited to the two known exact byte payloads; reserialized/edited unknown
outputs remain unknown. Companions and outputs are separate writes, so failures
between them require binding verification. Input hashes record the run's bytes,
not independent authentication of feed observations or timestamps. Legacy original
run bindings remain explicitly unknown.

The preserved optional ML artifact was already incompatible with current
physics/provenance; subsequent CLI edits also change its strict teacher code hash.
No compatibility gate was relaxed, and no production-sized artifact was retrained.
Only tiny existing test training fixtures ran.

Python 3.12 execution, Linux ARM64 native imports, SAM build/deployment, actual
deployed package size, remote CI, live upstream feeds and browser rendering of
new disclosures remain unverified. Passing local tests does not make this work
production-ready. No commit, push, merge, branch change or PR operation occurred.
