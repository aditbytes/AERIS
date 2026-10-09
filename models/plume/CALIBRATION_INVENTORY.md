# Task 3: historical calibration eligibility audit

Audit date: 2026-10-08. Scope: local repository files, all local Git refs,
ingestion/storage code, model code and existing test fixtures. No network,
downloads, timestamp corrections, parameter fitting or ML was performed.

```text
REAL_CALIBRATION_STATUS: BLOCKED_NO_VALID_HISTORICAL_DATA
CALIBRATION_STATUS: BLOCKED_NO_VALID_HISTORICAL_DATA
CALIBRATION_HOLDOUT: NOT_AVAILABLE
PARAMETER_SOURCE: BASELINE_DEFAULT
```

The original Task 3 request required stopping calibration implementation when
no suitable real history exists, and that audit stopped here. The subsequent
completion request explicitly authorizes a gated engine and parameter loader;
these are now implemented without running real-data optimization. No
`params.json` or historical observations were created. The existing physics,
source detector and captured inputs remain unchanged. Task 2 meant the baseline was ready to be
calibrated when eligible history becomes available; it did not certify that
such history was already present.

## Actual candidate datasets

Counts below come from the files, rather than README estimates. In particular,
the live manifest's claim of 230 PM2.5 stations does not match the actual 60
station records. Capture time and measurement/valid time are different fields.

| Dataset | Provenance and kind | Records / stations | Measurement or valid-time range (UTC) | Capture / generation time (UTC) |
| --- | --- | --- | --- | --- |
| `data/live/aqi.json` | OpenAQ, named in each station's `source`; normalized captured PM observations, with derived AQI | 60 unique stations; 59 non-null PM2.5 values with timestamps; 1 null PM2.5/time record; 0 non-null PM10 values | 2026-09-30T18:58:57Z to 2026-10-07T08:00:00Z | 2026-10-07T18:58:03.921942Z |
| `data/live/fires.json` | NASA FIRMS VIIRS NOAA21 + NOAA20 + SNPP NRT; normalized captured satellite detections | 227 detections; station count not applicable | 2026-10-07T07:44:00Z to 2026-10-07T08:41:00Z | 2026-10-07T18:41:50.671283Z |
| `data/live/wind.json` | Open-Meteo GFS; captured numerical forecast, not measured wind or a historical reanalysis archive | 323 grid points x 48 hourly samples = 15,504 samples; station count not applicable | Stored labels 2026-10-06T18:30:00Z to 2026-10-08T17:30:00Z | 2026-10-07T18:37:57.090632Z |
| `data/live/sources.json` | Derived source-model output associated with the real FIRMS capture; not an independent observed emission inventory | 10 sources, containing 215 fire detections; station count not applicable | `first_seen` / `last_seen` span 2026-10-07T07:44:00Z to 2026-10-07T08:41:00Z | 2026-10-08T14:52:16.603976Z |

Coordinates in all four candidates are WGS84 `lat` / `lon`, in degrees.
Timestamp strings have explicit UTC `Z` labels. The AQI contract and calculation
use PM2.5 and PM10 in micrograms per cubic metre, but normalized records do not
retain original sensor-unit metadata or averaging-period start times. Those
details need independent confirmation for future calibration. `aqi` is a
derived index, not a substitute PM2.5 observation.

Fire fields include `frp_mw` (MW), `brightness_k` (K), `confidence`, `satellite`
and `acq_time`. Fire detections are not distinct physical events or measured
PM2.5 emissions. Sources contain normalized, dimensionless
`emission_strength` and `confidence`, `radius_km`, `total_frp_mw`, `fire_count`
and first/last detection times.

Wind fields are `u_ms` eastward and `v_ms` northward (m/s), `speed_ms` (m/s),
`dir_from_deg` (meteorological FROM direction), and `pblh_m` (m). The regular
0.25-degree grid covers latitude 28 to 32.5 and longitude 73.5 to 77.5.
PBLH is present at every stored sample. Forty-eight samples span 47 hours
between endpoints; they are not 48 future hours from this capture time.

The archived wind's half-hour timestamp labels are consistent with the naive
UTC-to-host-local conversion defect fixed in Task 2. The original API response
is absent, so this audit cannot confirm or rewrite their physical timing.
Existing labels are preserved verbatim. Correctly timed fresh captures or
independently verified original provenance are required before fitting.

## PM2.5 chronology and background eligibility

Each station has exactly one record. Of the 59 dated PM2.5 values:

- 54 are at 2026-09-30T19:00:00Z.
- One is at 2026-09-30T18:58:57Z.
- One each is at 2026-10-01T05:00:00Z and 2026-10-02T15:00:00Z.
- One is at 2026-10-07T06:00:00Z.
- One is at 2026-10-07T08:00:00Z.

Thus 58 predate the first captured fire detection. The final record is
`OAQ_6135333`, Trinity School Lahore, at (31.4746, 74.2786), 50.0 micrograms/m3
at 08:00 UTC. It is 16 minutes after the earliest captured detection, so it is
incorrect to say every observation precedes all fire activity. However, it has
no same-station pre-event history or later series. Every current aggregated
source has `last_seen` at 08:20 or later, up to 08:41. Using those later source
states to predict the 08:00 observation would leak later fire information.
The current model also rejects a start before the latest source observation.

The other October 7 record is `OAQ_4554729`, Sandha Road, 45.8 micrograms/m3 at
06:00 UTC. It predates all captured fires and is a different station. It cannot
be substituted as the Lahore station's background without real evidence for
that relationship. The other 57 dated values are before the fire day.

There is no independently documented background field, repeated pre-event
station series, or post-event series. A station's sole observation cannot serve
as both its target and its own background. Different stations' one-time values
cannot be silently treated as interchangeable baselines. Consequently:

```text
accepted calibration datasets: 0
accepted event groups: 0
accepted stations: 0
accepted target observations: 0
observed PM2.5 minus background: NOT_AVAILABLE
transport-time / downwind matches: NOT_AVAILABLE
```

The 10 source candidates and 227 detections do not constitute 10 independent
historical calibration events. No physical downwind association was asserted
from distance alone, and no plume matching was tuned to admit a target.

## Other files and history examined

| Files | Actual contents / timing | Reason excluded from targets |
| --- | --- | --- |
| `web/public/data/{aqi,wind,sources,ranked_sites,actions}.json`, `web/public/data/{corridor,india-boundary}.geojson` | Seven byte-identical copies of their `data/live/` counterparts | Publication copies do not add observations, stations, events or coverage |
| `data/live/corridor.geojson` | 50 derived features, 40 Polygon bands and 10 LineStrings; generated 2026-10-08T14:52:16.643513Z; declared start 2026-10-07T18:00:00Z | Model output, not station observations; stored values must not become historical validation targets |
| `data/live/ranked_sites.json` | 444 derived site rankings; generated 2026-10-08T14:52:18.978772Z | Modelled exposure/risk, not observed PM2.5 |
| `data/live/actions.json` | 8 actions and 3 authority actions; generated 2026-10-08T14:52:19.030589Z | Generated recommendations, not observations |
| `agent/tests/reviewed_run.json` | Reviewed derived agent output dated 2026-10-07T19:18:10.234908Z; 3 actions and 2 authority actions | Forecast text and recommendations are not measured station targets |
| `data/live/sites.geojson` | 3,132 OSM school/hospital Point features; captured 2026-10-07T18:49:16.377954Z | Real geographic reference, no pollutant or event history; WGS84 geometry; capacity counts when present |
| `data/live/population.json` | 222,792 WorldPop-derived cells for population year 2020; generated 2026-10-08T13:13:45.663010Z | Geographic demographic reference in persons/cell, not pollutant observations; WGS84 `lat` / `lon` |
| `data/live/india-boundary.geojson` | One LineString geographic reference, no source or capture timestamp in the file | No measured pollution, wind or event records; capture provenance not established |
| `ingest/tests/test_aqi.py` and other test inputs | Parsing stubs explicitly labelled as format-correct, not captured observations; mathematical test inputs | Not eligible real history |
| Ignored `.venv/` replay and pytest scratch artifacts | Earlier source/plume validation outputs, byte-for-byte input copies, and controlled test payloads | Repeated computations and test payloads do not add independently captured history |

All local Git refs were checked for past captures of the relevant input paths.
There is only **one distinct AQI payload, one distinct fire payload and one
distinct wind payload**, introduced in commit `55c869f`. Their observations and
coverage match the working-tree inputs above. The three distinct derived source
payloads in commits `3d7ce96`, `084df3b8` and `6f17ea1` all contain 10 sources
and 215 detections from the same October 7 07:44-08:41 window. Earlier source
outputs have generation time 2026-10-07T19:14:28.575796Z; the current output
has the October 8 generation time above. Reprocessing is not a new event.

No local `data/raw/`, `data/bronze/`, `data/history/`, `data/historical/` or
standalone bronze archive exists. No separately captured OpenAQ/CPCB historical
CSV, raw API response history, or historical wind/PBLH series was found.
`ingest/common/storage.py` supports timestamped bronze storage, but that
capability is not evidence that local history exists. Remote AWS storage was
not queried; unavailable remote objects cannot be counted as repository data.

## Existing model and parameter identifiability

| Parameter | Retained baseline | Status |
| --- | --- | --- |
| `sigma0_m` | 2000 m | ASSUMED |
| `k_m_sqrt_hour` | 1000 m/sqrt(hour) | ASSUMED |
| `tau_hours` | 24 hours | ASSUMED |
| `concentration_scale_ug` | 1e12 micrograms per nominal strength-one hourly puff | ASSUMED |

No fitted values or uncertainty estimates were selected. There are no valid
targets to execute a search or estimate any parameter. The completion engine
defines explicit engineering-prior grids, described in the plume README, without
claiming physical validation. With `params.json` absent, `resolve_params(None)`
still selects the documented baseline. The new loader distinguishes BASELINE,
CALIBRATED and EXPLICIT provenance; explicit caller/CLI overrides remain supported.
No real calibrated artifact exists.

The inspected formulation remains:

```text
sigma0_source = max(sigma0_m, radius_km * 1000 / sqrt(2 * ln(10)))
sigma(age_h) = sigma0_source + k_m_sqrt_hour * sqrt(age_h)
survival = exp(-age_h / tau_hours)
C_puff = concentration_scale_ug * emission_strength * survival
         / (2*pi*sigma^2*max(PBLH_m, pblh_floor_m))
         * exp(-distance_m^2/(2*sigma^2))
```

Hourly puffs preserve source identity and inherit the source's strength. Wind
and PBLH are interpolated locally at actual simulation times. The default
reference is the later input capture, while explicit replay may predate capture
availability but never a source's latest detection. Such replay is not proof
of a prospectively issued forecast.

Even with future history, identifiability needs investigation: the radius
footprint overrides the 2000 m sigma floor for 8 of the 10 current sources;
sigma0 and k can trade off when puff ages are similar; tau requires aged-plume
information; and concentration scale is confounded with heuristic source
strength, emission duration, spread and simplified vertical mixing. Parameters
unsupported by history must remain ASSUMED.

## Matching, targets and leakage controls

No real matching table, background series, train/holdout split or fit was
constructed. The completion engine implements these stages behind the strict
gate. A future eligible record must establish source/event time, input
availability, covered wind/PBLH, plausible modelled transport and observation
time, with a real station-specific background that does not use the target.
Transport association must use the actual puff field and timing, rather than
admitting every station in a radius.

The current detector accepts an AQI argument but does not use it to construct
source strength or confidence. This avoids that particular target-leakage route.
It does not make late fire inputs eligible for earlier targets. Source geometry,
FRP and strength must be frozen using only data available for the declared
analysis. Meteorological issue/capture time must also be distinguished from
forecast valid time; historical wind may be used for a declared hindcast, but
not misrepresented as forecast information available earlier.

Current `src_*` IDs are ranked within a snapshot, not persistent event IDs.
Repeated detections and overlapping captures of a physical event must stay in
one event group. Earlier independent events must be used for fitting and later
independent events protected for evaluation, with no target overlap, background
leakage, manual event-specific tuning or holdout-dependent parameter selection.
No such split is possible with this repository's single fire window and zero
accepted targets.

Corridor `pm25_delta_ugm3` is a peak across a source's band cells and hours, not
the Gaussian concentration at each station/time. Future calibration must
evaluate the station-time puff concentration; comparing band peaks against
every station would create an invalid target mapping. No physics change was
required by this audit.

## Metrics and validation

| Evaluation | RMSE | MAE | Bias | Matched events / stations / observations |
| --- | --- | --- | --- | --- |
| Baseline calibration period | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | 0 / 0 / 0 |
| Fitted calibration period | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | 0 / 0 / 0 |
| Protected chronological holdout | NOT_AVAILABLE | NOT_AVAILABLE | NOT_AVAILABLE | 0 / 0 / 0 |

Event-level and station-level metrics, baseline-versus-fitted improvement and
out-of-sample performance are all NOT_AVAILABLE. Zero eligible observations
does not mean zero prediction error.

The original audit's existing suites were run on Python 3.14.3:

- `python -m pytest models/plume -q`: **65 passed, 0 failed**, 0.97 seconds.
- `python -m pytest -q`: **322 passed, 0 failed**, 13.10 seconds; one existing
  Requests dependency compatibility warning.

On Windows these commands used UTF-8 mode and separate unique `--basetemp`
directories under ignored `.venv/`. That audit did not add calibration code or
run a calibration CLI. The subsequent completion adds mathematical optimizer,
schema/loading and chronology tests, alongside actual-capture blocked-CLI and
pipeline regression checks. Mathematical artifacts are marked MATHEMATICAL_TEST,
cannot be named deployable `params.json`, and are rejected by the production
loader. They are not real-data fits. Python 3.12 runtime remains unverified.

## Completion engine behavior

`python -m models.plume.calibrate` now discovers normalized local historical
manifests or audits the current live files. For this repository it exits 1
with BLOCKED_NO_VALID_HISTORICAL_DATA, optimizer_executed=false, null metrics,
no fitted values and no `params.json`. No downloads or original-input changes
occur. The earlier numerical/model replay outputs remain ineligible as targets.

The engine requires independently reviewed real provenance/timing, reproducible
frozen fire/source packets, independent pre-event station backgrounds, plausible
baseline-puff transport, and protected chronological event/station coverage.
It optimizes station-time Gaussian increments, not corridor-band maxima.
Only a supported real-data fit that improves both training and protected holdout
RMSE can produce a validated parameter artifact. Weak/boundary parameters stay
at baseline; explicit caller parameters override the calibrated file, which
overrides baseline only when valid. Missing history and malformed artifacts
cannot silently create fitted values.

See [plume README](README.md#calibration-engine-and-eligibility) for the exact
internal manifest schema, matching policies, engineering-prior bounds, sensitivity,
split rules, result fields, artifact checks and future successful path.
Implementation recommendation: READY_FOR_VALID_HISTORY. Actual calibration
data readiness is still blocked and requires the real histories listed below.

Completion validation: **116 plume tests passed, 0 failed**; **377 repository
tests passed, 0 failed**, with one existing Requests warning, on Python 3.14.3.
Actual default calibration CLI exits 1 with optimizer not executed, matched
events/stations/targets 0/0/0, fitted parameters null and no `params.json`.
A newly computed 22-source detector output from the existing FIRMS capture was
accepted by the plume in a covered 2-hour replay, producing 36 contract-valid
features. It is a rerun of the same capture, not new historical evidence. The
original older 10-source snapshot and all other captured data remain unchanged.

## Scientific conclusion

Recommendation: **FIX_REQUIRED** for Task 3 data readiness. Obtain correctly
timed real wind/PBLH and independently observed station PM2.5 histories covering
pre-event background and post-event transport for multiple distinct fire events,
with units, averaging intervals and capture/issue provenance preserved. This
is a missing-evidence requirement, not an identified physics implementation
defect. No downloads were attempted in this no-network calibration audit.

The simplified Lagrangian baseline remains uncalibrated. These files do not
establish atmospheric source attribution, causal proof, medically validated
risk, city-scale PM2.5 accuracy, operational forecast skill or generalization.
They do not justify starting the ML surrogate.
