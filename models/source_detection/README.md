# Fire-cluster source detection

This is a local fire-cluster-based source detection heuristic. It groups parsed
NASA FIRMS observations into candidate pollution sources. It is not atmospheric
source attribution, an emission inventory, or proof of agricultural burning.
There are no network clients, downloads, AWS calls, or fallback datasets in this
module. Python 3.12+ and the repository dependencies are required; the algorithm
uses only NumPy, scikit-learn, and the standard library.

## Interface and contracts

```python
from models.source_detection.cluster import SourceDetectionParams, detect_sources

# fires is a parsed real fires.json snapshot from the ingestion layer.
result = detect_sources(fires, aqi=None, params=SourceDetectionParams())
```

`params` also accepts a dict containing the dataclass's parameter names. The
input and output follow [`docs/data-contracts.md`](../../docs/data-contracts.md).
The detector leaves its inputs unchanged.

Input is an object with `generated_at`, nonempty `source`, `bbox` ordered as
`[west, south, east, north]`, and a `fires` list. Every record requires nonempty
`id`, numeric `lat`, `lon`, `frp_mw`, `brightness_k`, aware ISO-8601 `acq_time`,
and `confidence` equal to `low`, `nominal`, or `high`. Ingestion normalizes VIIRS
letter codes and MODIS numeric confidence; this layer rejects raw codes. Extra
ingestion fields, such as `satellite`, are accepted but not emitted.

Coordinates are WGS84 degrees in the inclusive latitude/longitude ranges
`[-90, 90]` and `[-180, 180]`. FRP is MW and must be finite and nonnegative.
Brightness is Kelvin and must be finite and nonnegative. Numeric strings,
booleans, missing values, NaN, infinity, malformed or naive timestamps,
unsupported confidence, and acquisition times after capture/reference time
raise `ValueError`. All records are validated before filtering, including
records that would otherwise be excluded. No missing measurements are filled.

A valid captured snapshot with `fires: []` returns an empty `sources` list.
Missing input is an error. A valid snapshot whose fires all fail filtering or
are DBSCAN noise also returns an empty list; it never substitutes low-confidence
detections. The existing pipeline handler separately refuses empty source
results, preserving its previous output.

Output contains exactly `generated_at` and `sources`. Each source has exactly:

`id`, `type`, `lat`, `lon`, `fire_count`, `total_frp_mw`, `radius_km`,
`first_seen`, `last_seen`, `confidence`, `emission_strength`.

These are JSON-native finite values. No diagnostics or provenance fields are
added to the shared schema. `pipeline.contracts.check_sources` can validate the
output. Sources are sorted by descending total FRP, then latitude, longitude,
first/last observation time and count, before assigning `src_001`, `src_002`,
etc. Identical inputs/parameters, even with permuted fire records, serialize
identically. IDs describe the current ranked snapshot; they are not persistent
identities across changing captures. Numeric metrics retain floating precision
so rounding does not understate the radius or erase small emission strengths.

## Parameters

| Name | Default | Meaning |
| --- | --- | --- |
| `window_hours` | `24.0` | Maximum detection age, including the exact cutoff |
| `eps_km` | `7.5` | DBSCAN neighborhood radius in km |
| `min_samples` | `3` | DBSCAN core neighborhood count, including the point itself |
| `min_confidence` | `nominal` | Minimum ordered level: low < nominal < high |
| `noise_policy` | `drop` | Or `individual_minor_sources`, retaining each eligible noise point as one source |
| `frp_scale_mw` | `500.0` | Emission-strength reference scale in MW |
| `confidence_count_scale` | `10.0` | Count saturation scale for heuristic confidence |
| `as_of` | `None` | Aware datetime override for reference time |
| `agricultural_bbox` | `(73.8, 28.8, 77.2, 32.5)` | Regional proxy in west/south/east/north order |

Distances, window and scales must be finite and positive; `min_samples` must
be a positive integer. Invalid configuration fails explicitly.

## Time and filtering

Default reference time is the input capture's `generated_at`. This makes the
model a pure, reproducible function and permits honest replay of archived real
captures. Output `generated_at` records this analysis reference time, not the
machine's execution time. ISO-8601 offsets are accepted and normalized to UTC
`Z`; naive timestamps are rejected, rather than assumed to be local or UTC.

A fire is retained when `reference - window <= acq_time <= reference` and its
confidence meets the configured minimum. No wall clock is read by the model.
For a present-time evaluation, explicitly pass an aware current `as_of` or
provide `--as-of` to the CLI. Replaying an old capture does not establish that
its fires are still active today. The default CLI reports both capture and
reference time; it does not refresh data.

## Spatial clustering and centroid

DBSCAN uses `metric="haversine"` and a ball tree. Input rows are
`[latitude, longitude]` converted from degrees to radians; its angular radius
is `eps_km / 6371.0`, matching `models/common/geo.py`'s Earth radius. This is a
spherical great-circle approximation, not Euclidean distance in degrees or
an ellipsoidal WGS84 geodesic. Records are canonically ordered before DBSCAN,
making ambiguous border assignment repeatable. DBSCAN can join a chain of
nearby fires into a source wider than `eps_km`; that parameter is a neighborhood
distance, not a maximum source diameter.

Each fire is converted to a 3D unit vector:

```text
v = (cos(lat) cos(lon), cos(lat) sin(lon), sin(lat))
centroid direction = sum(FRP_i * v_i)
lat = atan2(z, hypot(x, y)); lon = atan2(y, x)
```

Angles in these formulas are radians. Weights are scaled by maximum FRP before
summation to avoid large intermediate products. Zero-FRP fires carry no centroid
weight when other FRP is positive; if all FRP is zero, every fire gets equal
weight in the spherical mean. This handles the antimeridian without averaging
longitudes toward zero. Near-antipodal vectors with no well-defined centroid
raise an error. Spherical means are appropriate for compact clusters but do
not necessarily fall inside a concave geographic footprint.

`total_frp_mw` is the sum of validated FRP. A sum beyond finite float range
raises an error. `fire_count` counts detections, not distinct physical fires;
multiple satellites or repeat passes may observe the same event.

## Radius and time range

Calculate each detection's great-circle distance to the weighted centroid,
sort these **unweighted** distances, and choose element `ceil(0.9*N) - 1`
using zero-based indexing. This nearest-rank 90th percentile is the smallest
observed radius containing at least 90% of detections (possibly more with
ties). For small clusters this can include all detections. There is no
artificial minimum radius. The centroid may be FRP weighted, but the radius
measures the fraction of fire detections, not FRP. `first_seen` and `last_seen`
are the minimum and maximum retained acquisition times, compared as datetimes.

## Emission strength and confidence

Emission strength is:

```text
E = 1 - exp(-total_frp_mw / frp_scale_mw)
```

The implementation uses `-expm1(-FRP/scale)` for accuracy near zero and bounds
the result to `[0, 1]`. It is monotonic in FRP, starts at zero, and saturates
toward one. The reference scale is an uncalibrated assumption; E does not
estimate pollutant mass, concentration, or an emission rate.

Heuristic source-detection confidence is:

```text
count = 1 - exp(-fire_count / confidence_count_scale)
high_share = high-confidence fire count / fire_count
recency = mean(max(0, 1 - age_hours_i / window_hours))
C = clip(0.4 * count + 0.3 * high_share + 0.3 * recency, 0, 1)
```

All three components lie in `[0, 1]`. Moving the same retained detections
closer to the reference time cannot reduce recency or confidence. Weights are
explicit assumptions: 40% count, 30% high-confidence share, 30% recency.
This is not a statistically calibrated probability or a claim of independent
evidence; repeated detections can inflate the count component.

## Classification and optional AQI

Label `stubble_burning` if the centroid lies in the inclusive configured
Punjab/Haryana regional bbox and the latest detection's **UTC month** is
October or November. Otherwise label `fire`. The bbox preserves the existing
detector's geographic convention but includes nonagricultural land and parts
of neighboring regions, including Pakistan. No agricultural polygons or
land-use evidence are available, so this seasonal regional proxy cannot prove
stubble burning or locate a cluster within an administrative boundary.

`aqi` is accepted for the public interface but does not change the score.
The existing `aqi.json` contract provides one observation per station, without
a PM2.5 series or wind direction. It cannot establish a rising trend or
downwind relation. Implementing a boost requires real history and wind plus
an agreed interface; a single PM2.5 reading is insufficient.

## Local CLI

From the repository root:

```bash
python -m models.source_detection.cluster --live
```

This reads `data/live/fires.json` and writes `sources.json` beside it. As with
the local storage layer, `AERIS_DATA_DIR` overrides the directory; relative
paths resolve against the repository root. The CLI always uses local files,
even when an S3 storage mode is configured. Missing/invalid input exits with
code 1 and leaves existing output untouched. It does not load optional AQI
because no valid cross-check can currently be derived.

To preserve checked-in snapshots during validation:

```bash
python -m models.source_detection.cluster --live --output .venv/sources-validation.json
python -m models.source_detection.cluster --live --output .venv/sources-current.json --as-of 2026-10-08T12:00:00Z
```

The second command demonstrates an explicit reference time; choose the actual
reference appropriate to your analysis. It may correctly return zero sources
when the captured detections are too old. CLI options also expose
`--window-hours`, `--eps-km`, `--min-samples`, `--min-confidence`,
`--noise-policy`, and `--frp-scale-mw`. The output path's parent must exist.
The CLI refuses an output path resolving to its input `fires.json`.

## Test strategy

```bash
python -m pytest models/source_detection/tests -q
python -m pytest -q
```

Tests explicitly label tiny geometric fixtures as mathematical inputs, never
real fire observations or real-world results. They check separation, noise
policy, DBSCAN border membership, high-latitude distances, centroid containment,
FRP weights, zero FRP, antimeridian behavior, nearest-rank radius, temporal
boundaries and offsets, emission monotonicity, confidence formula/recency,
season/bbox labels, invalid inputs, immutability, and deterministic ordering.
Integration tests use the existing provenance-stamped NASA FIRMS capture in
`data/live/fires.json`, check exact output keys and `check_sources`, and run
the real CLI in temporary directories without modifying source snapshots.

On Windows, use UTF-8 mode for existing repository tests that omit explicit
text encoding. In a restricted workspace, keep pytest temporary files there:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m pytest -q --basetemp=.venv/pytest-tmp
```

The next stage is the Lagrangian plume baseline. No plume implementation or
contract is changed by this source-detection task.

## Validation of the checked-in real capture

Input: `data/live/fires.json`, captured at `2026-10-07T18:41:50.671283Z`.
Provenance: `NASA FIRMS VIIRS_NOAA21_NRT+VIIRS_NOAA20_NRT+VIIRS_SNPP_NRT`. Acquisition range:
`2026-10-07T07:44:00Z` to `2026-10-07T08:41:00Z`.

The CLI was executed with default parameters and an output override to
`.venv/sources-validation.json`; all tracked real snapshots were preserved.
This is replay at capture time, not evidence of current activity.

- Raw detections: **227** ({'nominal': 226, 'high': 1}).
- Rejected by temporal/confidence filters: **0** records.
- Retained after temporal/confidence filtering: **227** records.
- Clustered: **151**; eligible noise dropped: **76**.
- Sources: **22** ({'stubble_burning': 15, 'fire': 7}).
- Clustered total FRP: **961.46 MW**.
- Exact field checks, finite JSON serialization and `check_sources`: **passed**.
- Repository pytest run: **253 passed, 0 failed**, with one pre-existing Requests dependency warning.
- Runtime used: Python **3.14.3** (the available interpreter); direct execution on Python 3.12 was unavailable.
- Source/test Python syntax also parses with Python 3.12 grammar.

Rejected means a valid record failed the temporal or confidence eligibility
rule, counted once even if it fails both. It does not mean the number of
retained records. Eligible DBSCAN noise is accounted for separately. For this
completed validation of a valid snapshot:

```text
raw detections = retained after filtering + rejected by filtering
227 = 227 + 0

retained after filtering = clustered detections + eligible noise dropped
227 = 151 + 76
```

Actual source metrics below are rounded **for display only**; stored JSON
retains full precision. All first/last observation times below are UTC on
**2026-10-07**. Labels come solely from the documented seasonal bbox rule.

| Source | Type | Lat | Lon | Fires | FRP MW | Radius km | Confidence | Strength | First UTC | Last UTC |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| src_001 | stubble_burning | 30.75201 | 73.92737 | 29 | 186.68 | 17.4099 | 0.5450 | 0.3116 | 07:44:00 | 08:39:00 |
| src_002 | fire | 30.42610 | 73.55660 | 14 | 102.54 | 8.4727 | 0.4726 | 0.1854 | 07:44:00 | 08:39:00 |
| src_003 | stubble_burning | 31.05572 | 74.48322 | 7 | 73.35 | 3.6675 | 0.3720 | 0.1364 | 07:44:00 | 08:39:00 |
| src_004 | stubble_burning | 31.02252 | 74.20121 | 6 | 72.74 | 4.9073 | 0.3486 | 0.1354 | 07:44:00 | 08:39:00 |
| src_005 | stubble_burning | 31.47930 | 73.91007 | 11 | 69.85 | 6.9168 | 0.4389 | 0.1304 | 07:44:00 | 08:39:00 |
| src_006 | fire | 30.51763 | 73.78055 | 13 | 67.49 | 11.5558 | 0.4608 | 0.1263 | 07:44:00 | 08:39:00 |
| src_007 | fire | 32.19628 | 73.77257 | 8 | 52.57 | 8.9050 | 0.3872 | 0.0998 | 07:44:00 | 08:22:00 |
| src_008 | stubble_burning | 31.11648 | 74.65710 | 10 | 47.07 | 4.4489 | 0.4233 | 0.0898 | 07:44:00 | 08:39:00 |
| src_009 | stubble_burning | 32.23730 | 73.93812 | 6 | 37.00 | 6.4556 | 0.3487 | 0.0713 | 07:44:00 | 08:22:00 |
| src_010 | stubble_burning | 31.79788 | 74.58350 | 4 | 34.52 | 3.1695 | 0.3054 | 0.0667 | 08:22:00 | 08:39:00 |
| src_011 | fire | 30.13987 | 73.53458 | 3 | 28.41 | 1.3032 | 0.2731 | 0.0552 | 07:44:00 | 08:39:00 |
| src_012 | fire | 30.60307 | 73.62624 | 3 | 25.45 | 0.3234 | 0.2693 | 0.0496 | 07:44:00 | 08:22:00 |
| src_013 | stubble_burning | 30.88181 | 74.32901 | 5 | 24.06 | 5.9795 | 0.3297 | 0.0470 | 08:22:00 | 08:39:00 |
| src_014 | stubble_burning | 30.84167 | 74.07846 | 4 | 21.12 | 5.6380 | 0.3045 | 0.0414 | 08:22:00 | 08:39:00 |
| src_015 | stubble_burning | 31.80746 | 74.12379 | 4 | 20.47 | 4.8030 | 0.3036 | 0.0401 | 08:22:00 | 08:39:00 |
| src_016 | fire | 30.68276 | 73.54790 | 5 | 18.88 | 5.2567 | 0.3283 | 0.0371 | 08:22:00 | 08:22:00 |
| src_017 | fire | 31.89744 | 73.69620 | 3 | 18.66 | 0.2732 | 0.2757 | 0.0366 | 08:22:00 | 08:39:00 |
| src_018 | stubble_burning | 31.88962 | 74.85078 | 4 | 18.28 | 6.7571 | 0.3008 | 0.0359 | 07:44:00 | 08:22:00 |
| src_019 | stubble_burning | 32.00749 | 74.35111 | 3 | 12.46 | 0.2194 | 0.2772 | 0.0246 | 08:22:00 | 08:41:00 |
| src_020 | stubble_burning | 31.84106 | 74.35927 | 3 | 10.94 | 4.9472 | 0.2745 | 0.0216 | 08:22:00 | 08:22:00 |
| src_021 | stubble_burning | 31.78233 | 75.00188 | 3 | 10.43 | 4.1511 | 0.2693 | 0.0206 | 07:44:00 | 08:22:00 |
| src_022 | stubble_burning | 31.68399 | 75.05161 | 3 | 8.49 | 0.2719 | 0.2719 | 0.0168 | 07:44:00 | 08:22:00 |

A second evaluation with `as_of=2026-10-08T12:00:00Z` excludes all 227
detections as older than the default 24-hour window and returns zero sources.
Parameters were not tuned to produce any geographic outcome.

## Final QA gate

**SOURCE_DETECTION_STATUS: PASS_WITH_LIMITATIONS**

No blocking correctness issue was found. The final audit changed only this
README's metric terminology and QA record; it did not change the detector,
parameters, tests, shared contracts, or plume implementation.

### PASS

- Temporal/confidence filtering, configurable noise handling, haversine DBSCAN,
  spherical FRP-weighted centroid, zero-FRP handling, wraparound, emission
  monotonicity, confidence/recency, and seasonal classification passed the
  source-detection tests. The 90th percentile remains the unweighted nearest-rank
  definition `ceil(0.9*N) - 1`, with no radius floor.
- Independent spherical `pyproj.Geod(a=6371000, b=6371000)` calculations matched
  the nearest-rank radius for all **22 real clusters**, within **1e-9 km**.
  DBSCAN receives latitude/longitude in radians with `eps_km / 6371.0`.
- All real-output coordinates, counts, FRP, radii and 0-1 scores passed range
  checks. Exact contract keys and `json.dumps(..., allow_nan=False)` passed.
- Five identical model invocations produced identical serialized JSON. Two
  independent CLI invocations produced byte-identical `sources.json`, including
  ordering, IDs, floating-point values, and structure.
- Actual `pipeline.contracts.check_sources` result on CLI-generated output:
  **`[]`** (zero problems).
- `python -m models.source_detection.cluster --live` exited **0**, using the
  established `AERIS_DATA_DIR` mechanism with a byte-for-byte copy of the real
  `data/live/fires.json` capture in an isolated workspace directory. It wrote
  **22 sources**, matching direct model output, without fabricated inputs or
  fallback data. Repeating the same module command with missing input exited
  **1**, named the missing `fires.json`, and preserved prior output.
- Final direct source-detection pytest result: **90 passed, 0 failed**.
  Final repository pytest result: **253 passed, 0 failed, 1 warning**.
  Both used `.venv/Scripts/python.exe -X utf8 -m pytest`, `-q`, and separate
  workspace-local `--basetemp` directories. The repository warning is the
  pre-existing Requests dependency warning.
- All original `data/live/` files retained their SHA-256 hashes. No user files
  were removed and no commit was made. `.venv/sources-validation.json`, CLI
  captures/results, and pytest temporary directories are local QA artifacts
  already ignored by `.gitignore`'s `.venv/` rule; they should remain untracked.
  The durable handoff is this README's real-data report, not the virtual
  environment's generated files.

### NOT VERIFIED

```text
PYTHON_3_12: NOT_VERIFIED
Python 3.12 runtime validation: NOT AVAILABLE
Python 3.12 syntax/compatibility inspection: PASS
```

The available interpreter is Python **3.14.3**. Every Python file under
`models/source_detection/` and `models/common/` passed
`ast.parse(..., feature_version=(3, 12))`. Inspection found no standard-library
API requiring a later Python version: union annotations, frozen dataclasses,
aware ISO-8601 parsing (including `Z`), pathlib, and the math functions used
are supported by Python 3.12. Installed NumPy 2.4.3, scikit-learn 1.8.0,
SciPy 1.17.1 and Shapely 2.2.0 declare Python `>=3.11`; pytest 9.0.3 declares
`>=3.10`. These compatibility checks do not verify Python 3.12 runtime behavior
or its binary wheels. The project's declared Python requirement is unchanged.
Lambda packaging/deployment was not executed.

### LIMITATIONS

This remains a fire-cluster-based source detection baseline. Confidence and
emission strength are uncalibrated heuristics. The bbox/season classification
does not establish agricultural land use or administrative boundaries and can
include neighboring regions. Multiple satellites/passes may count the same
event repeatedly. Default analysis replays capture time; present-time use
requires an explicit `as_of` and sufficiently recent observations. AQI trend
and downwind corroboration remain unavailable without real history and wind.

**RECOMMENDATION: READY_FOR_PLUME** — no blocking Task 1 correctness issue.
Task 2 was not implemented during this QA gate.
