# AERIS modelling handoff and release audit

**Release decision: READY_WITH_DOCUMENTED_LIMITATIONS.** Tasks 1–4 are implemented
and their integration passed the local release audit. The production corridor
pipeline remains the physics baseline. No runtime scientific equations or model
selection behaviour were changed during this audit. One integration defect was
fixed: the weather request now buffers the pipeline's 48-hour horizon.

The original assignment is [Pritam's brief](../docs/members/pritam-models.md).
Its unchecked boxes describe the original plan. Current machine-readable evidence
is [RELEASE_AUDIT.json](RELEASE_AUDIT.json); earlier per-task reports remain in
the component READMEs as labelled historical checkpoints.

## Interfaces for the team

| Component | Entry point | Status |
| --- | --- | --- |
| Source detection | `models.source_detection.cluster.detect_sources(fires, aqi=None, params=None)` | PASS; real FIRMS replay |
| Plume baseline | `models.plume.corridor.predict_corridor(sources, wind, hours=48, params=None, start=None)` | PASS; covered real replay |
| Calibration | `models.plume.calibrate.calibrate(history, config=None, background_estimator=...)` | READY_FOR_VALID_HISTORY; actual fitting blocked |
| Optional point surrogate | `models.training.predict.predict_point(case, east_m, north_m, model="physics", model_dir=None)` | AVAILABLE_FOR_OPTIONAL_USE within its numerical reference scope |
| Pipeline | `pipeline.steps.detect_handler` / `corridor_handler` | PASS; real local storage integration; physics only |

Pass parsed captured dictionaries; models do not fetch data or silently invent
missing inputs. Source/corridor output schemas are unchanged. See the
[source formulas](source_detection/README.md), [plume formulas](plume/README.md),
[surrogate contract](training/README.md) and [shared contracts](../docs/data-contracts.md).

Parameter precedence is **explicit values > validated calibrated artifact >
baseline defaults**. Explicit partial dictionaries use baseline defaults for
missing values. An absent artifact gives `BASELINE`; invalid existing artifacts
fail clearly. `models/plume/params.json` is absent, so defaults remain uncalibrated.
The calibrated-file branch is inspected and tested using an isolated validator
stub and mathematical schema checks; no real calibrated file was fabricated to
claim an observational loading result.

## Final real-data demonstration

The original `data/live/` inputs and all publication copies were preserved.
CLI and pipeline runs used separate isolated directories containing byte copies
of the existing real snapshots. No fetcher, AWS call or network download ran.

| Evidence | Actual result |
| --- | --- |
| Fire feed | NASA FIRMS VIIRS NOAA21/NOAA20/SNPP capture, 2026-10-07T18:41:50.671283Z |
| Raw / filter-eligible detections | 227 / 227; no low-confidence/old detections in this capture |
| Clustered / DBSCAN noise detections | 151 / 76; default noise policy drops noise |
| Fresh candidate sources | 22; 15 heuristic `stubble_burning`, 7 `fire` |
| Wind | 323 actual grid points, 15,504 complete hourly samples |
| Replay window | 2026-10-07T18:41:50.671283Z to 2026-10-07T20:41:50.671283Z, **2 hours** |
| Generated corridor | **17 Polygon features + 22 LineStrings = 39 features** |
| Terminal puffs / centreline vertices | 44 / 66 |
| Per-source grids | 210–1,521 cells, with unchanged 2 km cells |
| Sources validator | `[]` |
| Corridor validator | `[]` |
| Geometry | All valid Shapely geometries; finite WGS84 longitude/latitude; polygons have positive area |
| Derived centrelines and ETA | Match actual puff mass centres and frames `[0, 1, 2]` |
| Determinism | Repeated source/plume CLI output bytes identical |
| Pipeline integration | Fresh detect/corridor handlers reproduce the same parsed CLI objects; ML loader never called |

Independent calculations checked spherical FRP-weighted centroids, geodesic
90%-enclosing radii and bounded scores against the actual clusters. Tests cover
filtering conditions absent from this real capture. Multipart cell unions remain
separate Polygon features; concentration thresholding never forces a polygon.

The preserved stored `sources.json` has 10 sources and stored `corridor.geojson`
has 50 features. Both actual validators also return `[]`, but these are older
derived snapshots and are not the fresh 22-source release demonstration. Valid
schema alone does not prove freshness, causal attribution or observed accuracy.

Stable local demonstration files are `.venv/release-audit/real-replay/sources.json`
and `corridor.geojson`. Handler outputs are under the separate
`.venv/release-audit/pipeline-replay/` directory. The CLI output hashes in the
release record refer to the preserved CLI files, not reserialized handler files.
These directories, command stdout/stderr, training artifacts and test temporaries
are ignored QA outputs, not live feed additions.

## Capability and coverage

`MODEL_CAPABILITY: 48 hours` is verified by existing labelled mathematical tests.
`REAL_SNAPSHOT_VALIDATION: 2 hours` is the final demonstration above, not a claim
of the longest possible replay. Available stored wind timestamps run from
2026-10-06T18:30:00Z to 2026-10-08T17:30:00Z. Forty-eight hourly samples span
47 hours and leave about 22.8026 temporal hours after the fresh source capture;
spatial coverage must also hold at every advected puff.

The actual default `python -m models.plume.corridor --live` exited **1**, reporting
that the requested 48-hour window exceeds real wind coverage. The previous valid
isolated corridor was byte-preserved. The default pipeline handler likewise
raised before storage writes. No future wind, assumed PBLH, weather fallback or
shifted start was supplied. Contract polygons cover bands through hour 24;
centreline frames can extend through hour 48 when inputs support it.

The audit found that weather ingestion requested only two **calendar days**,
which cannot provide 48 future hours after capture. Three calendar days also
fall short after 23:00 because the last sample is at 23:00 on the final day.
`DEFAULT_FORECAST_DAYS` is now four. Calendar tests cover captures just before
01:00, 13:00 and midnight, and a request-wiring test confirms that the default
reaches the upstream query. Explicit shorter requests remain supported. This is
request arithmetic/configuration validation, not a new fetched weather result;
per-point model coverage checks remain strict. The archived file is unchanged.

The exact default plume command was also executed against the original
`data/live/` inputs: it exited 1 for the 2026-10-08T14:52:16.603976Z reference,
and the original 50-feature corridor retained its SHA256 hash.

The current parser attaches UTC to naive API times as requested, and its existing
timezone regression tests pass. The archived capture's half-hour timestamp labels
are consistent with the old host-timezone bug. Its raw response is unavailable,
so labels were used literally, never corrected by guesswork. Confirm timing with
a fresh capture before observational event matching. The demonstration is a
numerical replay of captured inputs, not a prospective forecast-skill evaluation.

## Calibration and scientific interpretation

The actual calibration CLI was run twice against the repository. Both executions
exited **1**, produced identical eligibility-report bytes and reported:

```text
CALIBRATION_ENGINE: READY_FOR_VALID_HISTORY
REAL_CALIBRATION_STATUS: BLOCKED_NO_VALID_HISTORICAL_DATA
OPTIMIZER_EXECUTED: false
MATCHED_EVENTS / STATIONS / OBSERVATIONS: 0 / 0 / 0
FITTED_PARAMETERS: null
PARAMETER_SOURCE: BASELINE
```

There are 59 dated PM2.5 readings across 60 stations, one fire/wind capture and
no independent pre-event station series or protected historical event split.
No observation, background, fit or deployable parameter artifact was invented.
The existing engine validates future captured manifests, backgrounds, timing,
event splits and adoption criteria; mathematical optimizer tests establish
mechanics without pretending to be real history.

Source labels/confidence and normalized FRP emission strength are heuristics.
Plumes use projected metre advection, hourly persistent emissions, increasing
Gaussian sigma, a PBLH floor and empirical exponential decay/concentration scale.
They are **not WRF-Chem**, resolved chemistry, an emission inventory, causal
source attribution, city-wide observed PM2.5 forecasts, or medical guarantees.
Band concentration is a spatial/hourly peak for each source; risk is an
uncalibrated relative score. Centreline frame times are not guaranteed first
arrival at a receptor. These assumptions have not demonstrated observed skill.

## Optional ML release gate

```text
MODEL_DEFAULT: PHYSICS_BASELINE
MODEL_SURROGATE: AVAILABLE_FOR_OPTIONAL_USE
SURROGATE_VALIDATION: BASELINE_SIMULATED
REAL_OBSERVATIONAL_VALIDATION: NOT_AVAILABLE
```

The point interface accepts one steady-wind/PBLH source emitting hourly for
1–12 whole hours, at the fixed numerical origin 30°N, 75°E. Actual release checks
rejected requests above 12 hours, multiple-source fields, changing wind/PBLH
arrays, alternate-origin fields, polygon geometry and out-of-range coordinates.
Absent artifacts raise explicitly for `model="surrogate"` and do not affect the
production physics pipeline. New regression tests preserve these scope guards.

The feature-array inference contract is a reference-scenario numerical API;
callers must construct its coordinates for that fixed origin and scalar weather.
It cannot verify physical context omitted by a caller. It does not accept real
multi-source weather snapshots or convert them into ML requests. No automatic
production surrogate selection exists.

Local training reused the existing labelled Task 4 dataset (8,000 train, 1,600
validation, 1,600 protected test samples) without generating new scenarios.
The retrained 792,417-byte model matched the earlier artifact byte-for-byte.
Repeated inference response bytes matched. Re-evaluation reproduced ML test
RMSE/MAE/bias **6.871639 / 1.785270 / −0.777798 µg/m³**, with worst absolute error
**99.114390 µg/m³**. Physics has zero error against its own generated labels, an
identity check. These results demonstrate approximation only; large peak errors
and absent observational validation preclude operational promotion.

## Tests, runtime and Lambda

| Required command | Exact result |
| --- | --- |
| `pytest models/source_detection` | **90 passed**, 0 failed, 2.46 s |
| `pytest models/plume` | **116 passed**, 0 failed, 4.68 s |
| `pytest models/training` | **73 passed**, 0 failed, **1 warning**, 4.35 s |
| `pytest ingest/tests/test_wind.py` | **24 passed**, 0 failed, **1 warning**, 0.35 s |
| `pytest` | **455 passed**, 0 failed, **2 warnings**, 19.52 s |

Tests used `.venv/Scripts/python.exe -X utf8 -m pytest -q` with independent
workspace-local `--basetemp` directories. Warnings were not filtered: the full
suite reported the pre-existing Requests dependency mismatch (urllib3/chardet
compatibility) and Windows joblib's unavailable physical-core probe, which
returns logical-core count. The latter also appeared during Task 4 execution;
the earlier Task 4 suite set `LOKY_MAX_CPU_COUNT=1`. This release suite did not
set that cap, so the environment warning is visible. No new model-code warning
or test failure appeared.

Runtime is **Python 3.14.3**; **`PYTHON_3_12_RUNTIME: NOT_VERIFIED`**. All 38 Python
files under models, pipeline and weather ingestion, plus the weather test file,
passed Python 3.12 grammar
parsing. Grammar checks and installed package version metadata are not runtime
or wheel validation. The Python launcher could not execute, and a Python 3.12
runtime was not available; project requirements remain unchanged.

SAM configuration still targets **Python 3.12 / arm64**. Lambda declarations
include NumPy, scikit-learn, pyproj and Shapely for the modelling handlers.
Direct `threadpoolctl` imports are provided by scikit-learn's dependency closure;
boto3 is supplied by the Lambda runtime. Requests supports the shared ingestion
package. Test-only pytest is not a production dependency. Deployment staging
excludes tests, caches and notebooks and does not copy `.venv/`. No missing
runtime import was found; source code and declarations were inspected only.
Neither SAM nor Docker is available, so no Python 3.12 arm64 Lambda build, size/
memory/latency benchmark or cloud deployment is verified. Optional SageMaker
training/inference contracts pass locally; train/infer artifacts require matching
software and teacher hashes and must be retrained in the target environment.

## Integrity, security and ownership

All **19** files under `data/` and `web/public/data/` kept their SHA256 hashes;
no file was added there. Runtime model and pipeline implementation files are
unchanged. No `.venv`, pickle, cache or generated test temporary is tracked.
The release JSON is intentionally documentation/evidence, not observation data.
Scans found no literal credentials/tokens, machine paths or network clients in
owned runtime model code. The local handlers use the declared local storage
backend; production S3 and weather fetching remain explicit integration I/O.
Secret scan values were not printed and unrelated security settings were untouched.

Changed files in this audit:

- `README.md`: weaken unsupported attribution/performance claims and link current evidence.
- `docs/data-contracts.md`: clarify simulated-data policy and model output semantics; schemas unchanged.
- `docs/members/pritam-models.md`: distinguish the original assignment from current status/data policy.
- `ingest/weather/fetch_wind.py`: buffer the 48-hour horizon with a four-calendar-day request.
- `ingest/tests/test_wind.py`: request wiring, late-capture coverage and shorter-request checks.
- `models/README.md`: this current handoff and release audit.
- `models/RELEASE_AUDIT.json`: actual local results, command records and integrity hashes.
- `models/plume/README.md`: correct stale engine status and label earlier Task 2 evidence.
- `models/training/README.md`: describe unsupported-scope rejection and caller contract.
- `models/training/tests/test_surrogate.py`: seven unsupported-scope regression cases.
- `pipeline/tests/test_steps.py`: real pipeline regression that forbids ML artifact loading.

Changes outside Pritam's modelling/assignment and pipeline scope are the root
README, shared data-contract documentation and the weather fetcher/test file.
The documentation fixes claims/data-policy inconsistencies. The weather change
is required to resolve the ingestion-versus-pipeline horizon mismatch; its
existing UTC parser/vector semantics and the real capture are preserved. No
other member's implementation was modified. No commit, push or PR-state change occurred.

Remaining limits are data/scientific coverage and unverified target runtime/build,
not known local correctness defects. The team can consume the documented physics
interfaces and optional reference-scenario surrogate with these explicit limits.
