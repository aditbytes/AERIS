# Optional plume point surrogate

As of the 2026-10-10 risk hardening, pickle loading requires explicit supplier
trust before any artifact is deserialized. For a model you trained or independently
authenticated, call `model_fn(directory, trusted_artifact=True)` or pass
`trusted_artifact=True` to `predict_point(..., model="surrogate", model_dir=...)`.
An omitted acknowledgment raises `PermissionError`; `trusted_artifact=False`
explicitly denies loading even if the deployer enabled trust.

For the standard SageMaker `model_fn(model_dir, context=None)` signature or the
evaluation CLI, a trusted deployment/operator can set
`AERIS_TRUST_MODEL_ARTIFACT=1` in the server/process environment. Other strings,
artifact metadata and request context cannot grant trust. Do not obtain this
setting from client input. A checksum supplied beside a pickle does not
authenticate its supplier; the trust flag is an acknowledgment, not a sandbox.
All existing compatibility, physics, software and checksum checks still apply.
The default physics path does not load a pickle.

The preserved ignored model/dataset were not regenerated. The local archive was
already incompatible with current physics/provenance before this remediation;
CLI edits also change the strict teacher source hash. No hash check was relaxed.
Rebuilding an artifact for a new code hash requires a separately reviewed
training run; historical metrics below are not revalidated artifact results.
See [the remediation report](../../docs/audits/hardcoded-data/2026-10-10/contributor-work-tally/PRITAM_RISK_REMEDIATION.md)
for executed tests and remaining risks.

This small local model approximates the existing plume engine's **PM2.5 increment**, in
µg/m³. It is an optional numerical surrogate, trained and evaluated on
`BASELINE_SIMULATED` scenarios. It has no observational calibration or demonstrated
atmospheric forecast skill. The production corridor pipeline still uses physics.

```text
MODEL_DEFAULT: PHYSICS_BASELINE
MODEL_SURROGATE: AVAILABLE_FOR_OPTIONAL_USE
REAL_OBSERVATIONAL_VALIDATION: NOT_AVAILABLE
SURROGATE_VALIDATION: BASELINE_SIMULATED
```

## Supported scope

One source emits a puff each hour starting at hour zero. Wind components and PBLH
remain constant throughout a forecast of 1–12 whole hours. The target sums every
surviving puff at one point at the final hour, using `simulate_source()` and
`concentration_at()` directly. `forecast_hours` is elapsed time since emissions
began, **not the age of a single puff**. Source strength is the existing normalized
emission score, not a measured mass emission rate. No background PM2.5 is added.

The numerical reference origin is 30°N, 75°E in the source-centred AEQD projection.
The reference start is 2020-01-01T00:00:00Z. Neither is an observed fire/event.
East/north point coordinates are metres from this reference origin. The fixed
origin bounds the effect of the engine's geographic velocity projection; an
artifact is not established for arbitrary latitudes. Changing wind/PBLH histories,
multiple sources, 48-hour corridor geometry and exposure polygons are outside this
surrogate's scope. Use the existing physics interfaces for those tasks.

## Ordered feature contract

| Feature | Units | Supported range / meaning |
| --- | --- | --- |
| `wind_speed_ms` | m/s | 0–6; hypot(u, v) |
| `sin_wind_toward` | dimensionless | u/speed, −1 to 1 |
| `cos_wind_toward` | dimensionless | v/speed, −1 to 1 |
| `downwind_m` | m | −100,000 to 350,000; point dotted with the transport direction |
| `crosswind_m` | m | −100,000 to 100,000; signed point coordinate perpendicular to transport |
| `forecast_hours` | hour | whole hours 1–12, elapsed since hourly emissions began |
| `pblh_m` | m | 50–3,000; the teacher applies its existing 200 m floor |
| `source_emission_strength` | dimensionless | 0.05–1, existing normalized source score |
| `source_radius_m` | m | 0–15,000, existing radius converted from km |

Direction is **toward**, not meteorological wind-from direction. Non-calm direction
features must have unit length. Calm direction features are both zero, with north
as the deterministic coordinate basis. Absolute point bearing/distance and raw
u/v are omitted because these ordered features already encode that information.
No source/station identifiers enter the model. Range acceptance is a numerical
guard, not evidence of accurate extrapolation throughout the accepted rectangle.

## Data generation and protection

`generate.py` uses explicit `PlumeParams()` defaults, never silently loading a
calibrated `params.json`. All teacher parameters, `lagrangian-puff-v1` and the
SHA256 of the three physics source files are recorded. The four calibration
parameters stay fixed; varying an unrecorded physical parameter would make this
compact feature contract ambiguous. Changing the teacher requires retraining.

The generator samples speed uniformly from 0.1–6 m/s, direction uniformly around
the circle, every whole forecast hour, log-uniform PBLH, and uniform emission
strength/radius. Every twentieth scenario is calm. Half the receptors are broadly
sampled from −25 km to travel distance +25 km downwind and ±50 km crosswind. Half
are Gaussian offsets around a randomly chosen actual final-frame puff, using its
sigma. This balances plume interiors and exteriors without filtering, clipping or
rescaling target values. Labels preserve the engine's finite kernel cutoff and
nonlinear radius/spread behaviour. These engineering ranges and sampling weights
are not an empirical distribution of atmospheric conditions.

All receptor samples from a weather/source/forecast scenario stay in one split.
NumPy `SeedSequence([master_seed, split_index, scenario_index])` gives independent,
reproducible streams. A fingerprint of the **scenario inputs** detects repeated
cases even when receptor locations differ. Full split hashes protect points and
labels. Data validation checks provenance, seeds, feature construction and unique
scenario groups before fitting. The held-out test split is never used to fit,
select hyperparameters, scale features or stop training.

Training also replays every train/validation label before fitting, rejecting edited
or handwritten targets before publishing an artifact. Test labels are replayed
separately by the protected evaluator.

No live AQI snapshot, archived incomplete history, external model, network request
or downloaded data is used. The simulated-data policy for Task 4 does not make
these scenarios eligible for Task 3 observational calibration.

## Model and artifacts

`HistGradientBoostingRegressor`: 220 iterations, 31 maximum leaves, learning rate
0.07, minimum 12 samples/leaf, L2 0.1, seed 42, no early stopping. These fixed
settings were declared before test evaluation. There is no preprocessing fit or
hyperparameter search. The Poisson loss supplies a positive prediction link for
nonnegative continuous increments; it does not claim that concentrations are
Poisson counts. Targets remain untouched. Predictions cannot reproduce exact
teacher zeros, and large peak underestimates remain possible.

`model.pkl` stores the estimator; `metadata.json` records feature names/order,
units/ranges, target, scope, origin, dataset/split hashes and group identities,
sample/group counts, generation and fit seeds, teacher parameters/version/code
hashes, hyperparameters, validation metrics and Python/NumPy/scikit-learn versions.
The loader rejects incompatible schema, provenance, teacher, versions or model
checksum. Load only artifacts from trusted training: pickle's checksum verifies
integrity, not the safety of an untrusted supplier. Exact Python versions must
match; retrain in the intended inference environment. No GPU or new dependency
is required; the repository already includes scikit-learn and its dependencies.
Training/prediction limit native numerical thread pools to one thread.

## Local reproduction

From the repository root, using the existing environment:

```powershell
$env:LOKY_MAX_CPU_COUNT = '1' # Avoid the Windows joblib physical-core probe warning.
.venv\Scripts\python.exe -X utf8 -m models.training.generate --output .venv\task4-surrogate\dataset.json
.venv\Scripts\python.exe -X utf8 models\training\train.py --data .venv\task4-surrogate --model-dir .venv\task4-surrogate\model
.venv\Scripts\python.exe -X utf8 -m models.training.evaluate --data .venv\task4-surrogate --model-dir .venv\task4-surrogate\model --output models\training\evaluation_report.json
```

The local dataset and pickle artifact remain under ignored `.venv/`; the reviewable
evaluation report is [evaluation_report.json](evaluation_report.json). Generation
counts, receptors/group and seeds can be set with generator CLI flags. Training
accepts either a dataset file or a directory containing `dataset.json`.

## Actual generated-test evaluation

Seed 42, 1,400 scenario groups, eight points/group:

| Split | Independent scenarios | Point samples |
| --- | ---: | ---: |
| Train | 1,000 | 8,000 |
| Validation | 200 | 1,600 |
| Protected test | 200 | 1,600 |

| Comparison on test | RMSE (µg/m³) | MAE (µg/m³) | Bias (µg/m³) | Worst absolute error (µg/m³) |
| --- | ---: | ---: | ---: | ---: |
| Replayed physics teacher | 0 | 0 | 0 | 0 |
| ML surrogate | 6.871639 | 1.785270 | −0.777798 | 99.114390 |

Physics predictions are recomputed using the actual simulator and station sampler.
Each stored test label must reproduce its teacher call. Zero physics error is an
identity check because physics generated the targets; it measures no observed
forecast accuracy. Validation RMSE is 7.620062 µg/m³. The serialized model is
792,417 bytes in the tested environment (Python 3.14.3, scikit-learn 1.8.0).

Relative absolute error uses nonzero teacher targets only, without a stabilizing
denominator or target clipping. Test median relative error is 27.20%, mean 322.22%
and p90 178.20%; near-zero positive targets make relative error large. The report
explicitly counts 543 zero targets and 1,057 positive targets. MAE divided by mean
target is 33.38%. Test target mean/p99/max are 5.348364/76.879337/145.746893 µg/m³;
prediction mean/p99/max are 4.570566/52.658323/134.140557. The worst point has a
145.746893 target and 46.632504 prediction (−99.114390 error). Full distributions,
validation errors and five worst cases, including features and scenario IDs, are
in the report. None of these numbers establishes atmospheric predictive skill.

## Optional inference and SageMaker contracts

```python
from models.training.predict import predict_point

case = dict(u_ms=3.0, v_ms=4.0, forecast_hours=2, pblh_m=800.0,
            source_emission_strength=0.5, source_radius_m=2000.0)
physics = predict_point(case, east_m=10000, north_m=10000)  # Default; no artifact.
surrogate = predict_point(case, east_m=10000, north_m=10000,
                          model="surrogate", model_dir=".venv/task4-surrogate/model")
```

Explicit `model="surrogate"` requires a valid artifact and fails if absent; there
is no fabricated prediction or silent fallback. `model="physics"` is the default
for this reference-scenario interface. The existing corridor pipeline is unchanged.

Unsupported requests raise `ValueError`: hours above 12, multiple-source fields,
wind/PBLH arrays, alternate-origin fields, polygon geometry and coordinates
outside the feature domain. Only the documented scalar steady-weather case and
projected reference-origin point are accepted. The feature-array SageMaker
interface has the same fixed numerical scope; its coordinates must already be
constructed for that reference. It cannot infer hidden weather histories or
origin metadata that a caller omits. It rejects extra request fields rather than
silently consuming a broader scenario. Use `predict_corridor()` for real sources,
changing-weather and longer forecasts; the production pipeline always uses it.

`train.py` reads `SM_CHANNEL_TRAIN/dataset.json` and writes `model.pkl` plus metadata
to `SM_MODEL_DIR`. CLI arguments override those environment variables. A SageMaker
source bundle must include the repository's `models` package, including plume and
training modules and their existing dependencies; do not ship only `train.py`.
Retain the package directory layout and use `models/training/train.py` as the
training entry point. Train and infer with matching software versions.

`inference.py` implements `model_fn`, `input_fn`, `predict_fn`, `output_fn`, including
optional context arguments. Input/output content types are `application/json`:

```json
{"feature_names":["wind_speed_ms","sin_wind_toward","cos_wind_toward","downwind_m","crosswind_m","forecast_hours","pblh_m","source_emission_strength","source_radius_m"],"instances":[[5,0.6,0.8,14000,2000,2,800,0.5,2000]]}
```

Exact feature order/count, finite numbers, direction norm, whole hours and ranges
are mandatory. Missing/extra fields, booleans, numeric strings, NaN and infinity
are rejected; no feature substitutions occur. Responses name the target and
explicit simulated validation status. Local subprocess tests exercise the actual
environment-variable training entry point and the inference contracts. This is
local SageMaker contract validation, not a cloud deployment or Lambda runtime
benchmark. Python 3.12 runtime validation has not been performed.

## Task 4 verification

- `pytest models/training`: **66 passed**, 0 failed (4.07 seconds).
- `pytest models/plume`: **116 passed**, 0 failed (4.63 seconds).
- Full `pytest`: **443 passed**, 0 failed (19.06 seconds), one existing Requests
  dependency warning.
- Runtime: **Python 3.14.3**. Eight training-package Python files passed Python
  3.12 grammar parsing; this is syntax checking, not Python 3.12 execution.
- Deterministic generation and repeated training, split isolation, label replay,
  serialization, metadata/integrity checks, strict feature validation, metrics,
  explicit selection, absent artifacts and local SageMaker contracts passed.
- All 30 protected physics/source/pipeline and real snapshot/publication-copy
  SHA256 hashes were preserved; `models/plume/params.json` remains absent.
- No network/downloads, new dependencies, commits, pushes or PR modifications.

## Future history and default decision

`compare_predictions(targets, physics_predictions, surrogate_predictions)` is a
reusable numeric metric layer. It attaches no observational provenance. A future
adapter must consume Task 3 eligible historical matches, remove an independently
estimated background, preserve units, verify this surrogate's steady-weather
scope/origin/parameter compatibility and hold out entire independent events.
It must report observational provenance separately. The current generated-test
evaluator cannot be switched to a misleading real-validation claim by a flag.

Keep physics as the production default. Before any proposed promotion, require
independent eligible observational events and repeatable improvements in both
RMSE and MAE over physics, with no worse absolute bias or worst-event error,
across held-out time periods and relevant regimes; also establish an operational
latency/memory benefit in the intended runtime. Any application-specific error
tolerance must be declared before that evaluation. A generated teacher test alone
can never meet this gate. Current observational evidence is unavailable and the
surrogate has substantial peak errors, so no operational promotion is warranted.
