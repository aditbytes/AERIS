# Lagrangian plume corridor baseline

This is a simplified Lagrangian puff/advection baseline.
It is not WRF-Chem and is not a full atmospheric chemistry model.

The model estimates an **uncalibrated increment above background** from candidate
fire sources. It does not invent a background, ingest observations, attribute
ambient pollution, or provide medically validated public-health probabilities.
All default physical parameters and the empirical concentration conversion are
assumptions. No historical calibration, ML, optimization, networking, downloads,
or AWS clients are implemented in this model package.

## Architecture and public interface

`advect.py` validates inputs, prepares wind interpolation, defines parameters
and puff state, and performs projected transport. `corridor.py` evaluates
Gaussian concentrations, extracts polygons, produces GeoJSON, and provides the
local CLI. The existing source-detection algorithm is unchanged.

```python
from models.plume.advect import PlumeParams
from models.plume.corridor import predict_corridor

# Both dictionaries come from real local ingestion/model outputs.
result = predict_corridor(sources, wind, hours=48, params=PlumeParams())
```

`params` may also be a dict of dataclass overrides. `forecast_hours` remains a
compatible keyword alias for `hours`; conflicting nondefault values fail.
Horizons must be integer hours in `[1, 48]`. `start` accepts an aware datetime.
The existing `find_nearest_wind(lat, lon, wind, when)` interface is preserved
and now performs linear temporal interpolation as well as spatial IDW.

Inputs follow [`docs/data-contracts.md`](../../docs/data-contracts.md). Source
IDs must be unique; coordinates, scores, FRP/radius/count and UTC observation
ranges must be valid. A full source snapshot requires `generated_at`. An
explicit `start` permits the legacy caller's `{"sources": [...]}` subset.
Malformed values raise `ValueError`. Inputs are never mutated.

Default reference time is the later of the source and wind capture timestamps;
there is no model wall-clock read. It cannot precede the latest source
observation. An explicit earlier-than-capture reference is an **archive replay**,
not a prospective forecast issued at that time. Output `generated_at` and
`forecast_start` record this analysis reference; `wind_generated_at` records
the wind capture. This makes repeated inputs/configuration serialize identically.

## Actual wind interpretation

The checked-in `data/live/wind.json` is an object containing `generated_at`,
`source`, and `points`. Each point has WGS84 `lat`, `lon`, and an `hours` list.
Each hourly entry has an aware UTC `t`, `u_ms`, `v_ms`, `speed_ms`,
`dir_from_deg`, and `pblh_m`.

- `u_ms` is eastward and `v_ms` northward, both in **metres/second**. They are
  already converted physical vectors and are used directly, never reversed.
- `dir_from_deg` is meteorological compass direction **from** which wind blows.
  The ingestion conversion is `u=-speed*sin(direction)`,
  `v=-speed*cos(direction)`. A north wind gives `v < 0`, travelling south.
  Model transport uses u/v; it does not interpolate angles across 0/360 degrees.
- `pblh_m` is boundary-layer height in **metres**. Ingestion allows null PBLH
  and skips hours with absent speed/direction. The captured file has no null
  u/v/PBLH: **323 points x 48 hourly samples**, with 0.25-degree regular spacing
  (19 latitudes 28–32.5, 17 longitudes 73.5–77.5).
- Stored timestamps span **2026-10-06T18:30:00Z–2026-10-08T17:30:00Z**.
  Forty-eight samples provide 47 hours between endpoints, not 48 future hours
  after capture. Neither timestamp labels nor missing data are guessed.

The weather parser previously applied the execution host's timezone to naive
API times despite requesting `timezone=UTC`. It now attaches UTC explicitly
before conversion; a regression test simulates a UTC+05:30 host. The existing
capture's half-hour labels are consistent with that old bug, but its raw API
response is unavailable, so the snapshot is **not relabelled**. Its timing must
be confirmed using a fresh capture before observational calibration or claims
about event timing. Validation here uses the stored aware timestamps literally.

## Wind interpolation and coverage

Prepare each point's valid `(u, v, PBLH)` samples in chronological order. Null
components mark an unavailable sample; nonfinite values, negative PBLH,
malformed timestamps, and duplicate points/timestamps raise errors. There is
no assumed PBLH when real PBLH is unavailable.

At a requested location/time:

1. Calculate WGS84 ellipsoidal geodesic distances to the wind points.
2. Use an exact valid grid point directly; otherwise select up to four nearest
   temporally usable points within the configured 50 km limit.
3. At each point, use an exact timestamp or linearly interpolate between its
   surrounding valid timestamps, only when their gap is at most three hours.
4. Weight these interpolated vectors/heights by `1 / distance**2` and normalize.

Coordinates and times are canonically ordered, including distance ties. A null
grid-point sample may be interpolated across a permitted short gap or use
other actual neighboring samples. No temporal extrapolation is permitted.
Short spatial extension beyond the sampled rectangle is explicitly bounded by
the nearest usable sample distance; it is not unlimited regional persistence.
Failure to find usable local wind/PBLH aborts the forecast. Global start/end
checks and per-puff queries enforce coverage through the terminal frame.

## Coordinate system and advection

Each source uses a WGS84 **azimuthal equidistant** projection centred at its
actual location. This keeps independent sources independent and avoids a
single inappropriate projection for widely separated sources. All numerical
positions, dispersion and grid cells are in **metres**. Output geometries are
transformed back to WGS84 **longitude, latitude** order.

True east/north wind axes differ from projected x/y away from the origin.
Transform their local tangent vectors using projected one-metre WGS84 geodesic
displacements, obtaining the local projection Jacobian `J`. Each explicit
Euler step uses the wind at the beginning of the interval:

```text
dt = 1 hour = 3600 seconds
(vx, vy) = J(location) * (u_ms, v_ms)
x_next = x + vx * dt
y_next = y + vy * dt
```

No degrees-to-metres constant is used. Puff/grid radii have a configurable
default 1000 km limit. Polar sources above 85 degrees and output crossing the
antimeridian fail explicitly; this is a regional baseline. Large or unsupported
domains are not silently drawn across the globe. Hourly Euler stepping and a
local tangent approximation are numerical limitations, not a resolved fluid
model.

## Emission, spread, PBLH and decay

Release one puff per source at forecast hours `0..hours-1`. Each retains source
ID, emission timestamp, age in hours, metre position, input emission strength,
sigma, decay and sampled PBLH. Frames are evaluated at hours `0..hours`, so a
48-hour simulation emits 48 puffs/source and has 49 sample frames.

```text
sigma0_source = max(sigma0_m, source_radius_m / sqrt(2 * ln(10)))
sigma(age_h) = sigma0_source + k_m_sqrt_hour * sqrt(age_h)
decay(age_h) = exp(-age_h / tau_hours)
pblh_factor = 1 / max(real_pblh_m, pblh_floor_m)
```

The radius conversion gives the initial source footprint a Gaussian whose
90%-mass radial distance matches the source's reported radius, unless the
baseline sigma floor is larger. The source detector's radius describes fire
detections; treating it as an initial smoke footprint is an explicit modelling
assumption. Spread cannot decrease with age. Decay starts at one and cannot
increase with age. PBLH is sampled at each puff centre/time; smaller measured
PBLH increases concentration until the 200 m floor. It is not a full boundary
layer, vertical dispersion, deposition or chemistry model. Hourly emissions
persist throughout the requested horizon by assumption, not verified ongoing
fire activity.

## Gaussian concentration, grid and bands

For cell-centre distance `r_m` from a puff centre, evaluate:

```text
C_puff_ugm3 = concentration_scale_ug * emission_strength
               / (2*pi*sigma_m**2)
               * exp(-r_m**2 / (2*sigma_m**2))
               / max(pblh_m, 200)
               * exp(-age_h / tau_hours)
C_cell = sum(C_puff_ugm3 for this source's emitted puffs)
```

The Gaussian horizontal kernel has inverse-square-metre normalization; PBLH
adds inverse metres. `concentration_scale_ug` supplies an **empirical nominal
puff mass/conversion**, not measured pollutant emission mass. A value of
`1e12 ug` corresponds dimensionally to 1000 kg at strength one per hourly puff;
it is uncalibrated and cannot be inferred from FRP normalization alone.
All PM2.5 values are modelled increments, never total ambient PM2.5.

Use per-source grids bounded by simulated trajectories plus four-sigma support,
with 2 km cells by default. Evaluate Gaussian contributions only in their local
support windows, then sum. The four-sigma truncation discards a theoretical
2D Gaussian mass fraction `exp(-8)` (about 0.034%); it is not renormalized.
Cell-centre sampling is approximate. A 250,000-cell limit is checked before
array allocation; forecasts exceeding budgets or projection support fail.
All hours through the requested horizon are calculated, even though the shared
contract only has bands ending at hour 24.

For bands **0–2, 2–4, 4–8, 8–24 h**, take the per-cell maximum across their
integer-hour frames, including both boundaries. Short explicit horizons clip
the final band and omit later bands. Select cells at or above **5 ug/m3**, union
the entire selected cells, repair invalid geometry if necessary, and preserve
holes. There is no geometric smoothing or forced polygon for absent exceedance.
Disconnected unions are emitted as separate **Polygon** features with the same
source/time properties because the actual contract/validator requires Polygon,
not MultiPolygon. Source plumes are never merged with each other.

Band `pm25_delta_ugm3` is the **peak source-specific concentration** across the
selected cells/frames; disconnected parts share that band summary. It is not
a cellwise concentration estimate applying uniformly to every polygon point.
Risk is `1 - exp(-band_peak / risk_scale_ugm3)`, clipped to `[0,1]`: monotonic,
deterministic, and uncalibrated, with no artificial minimum.

## Centreline and output contract

At each frame, calculate the centre of mass of **all surviving puffs** using
weights `emission_strength * decay`. Fresh emissions at the source can pull
this centre back toward the source; it is not the oldest puff's trajectory,
a plume front, or arrival time at any arbitrary target. Changing winds can
bend or reverse the centreline. `points_eta_hours` is the corresponding sample
hour for every vertex, not a guarantee of first smoke arrival at a receptor.

An exactly stationary source has no nonzero-length LineString that passes
Shapely validity. Its valid concentration polygons are retained and the
degenerate line is omitted, rather than inventing displacement. Zero emission
strength creates neither a line nor a band. This documented stationary-case
exception satisfies the actual repository validator but relaxes the prose
expectation of one line per source.

Top-level keys are exactly `type`, `generated_at`, `forecast_start`,
`wind_generated_at`, and `features`. Band/centreline property keys match
`docs/data-contracts.md` exactly. Both the model and CLI run
`pipeline.contracts.check_corridor`, check geometry validity, and forbid NaN/
infinity in JSON. Source IDs, frames, bands, polygon parts and ring orientations
are ordered deterministically. Identical inputs/parameters serialize identically
on the tested runtime; cross-version floating serialization was not tested.

## Parameters and units

| Parameter | Default | Units / role |
| --- | ---: | --- |
| `sigma0_m` | 2000 | m; minimum initial horizontal sigma, uncalibrated |
| `k_m_sqrt_hour` | 1000 | m/sqrt(hour); spread growth, uncalibrated |
| `tau_hours` | 24 | hours; empirical removal time, uncalibrated |
| `concentration_scale_ug` | 1e12 | ug/nominal hourly puff at strength one; uncalibrated conversion |
| `grid_cell_m` | 2000 | m; cell width and height |
| `threshold_ugm3` | 5 | ug/m3; corridor extraction assumption |
| `risk_scale_ugm3` | 50 | ug/m3; relative-score saturation assumption |
| `pblh_floor_m` | 200 | m; minimum mixing-depth assumption |
| `wind_neighbors` | 4 | maximum spatial IDW neighbors |
| `idw_power` | 2 | distance-weight exponent |
| `max_time_gap_hours` | 3 | hours; largest permitted interpolation gap |
| `max_wind_distance_km` | 50 | km; nearest usable wind distance limit |
| `kernel_sigma_cutoff` | 4 | sigma units; computational support radius |
| `max_grid_cells` | 250000 | per-source array cell limit |
| `max_projection_radius_km` | 1000 | km; regional projection/grid support limit |

Physical scales must be finite and positive; k may be zero; count/budget
parameters must be positive integers. Policy/numerical settings are also
explicit assumptions, not fitted values. A caller may supply a JSON parameter
file, but file presence alone never means calibration. Actual future calibration
requires correct timestamp provenance, observed PM2.5 histories and held-out
validation, and is outside this task.

## CLI and pipeline integration

```bash
python -m models.plume.corridor --live
```

Reads `sources.json` and `wind.json` under `data/live/`, or under
`AERIS_DATA_DIR` with relative paths resolved against the repository root.
Default horizon is 48 h from the latest input capture. No source/wind refresh
is attempted. Optional `--start`, `--hours`, `--params` and `--output` permit
explicit replay/configuration. Validation precedes an atomic output replacement;
missing input, insufficient coverage or calculation failure exits 1 and preserves
prior output. Source/wind inputs cannot be used as output paths.

The checked-in capture cannot support the default 48 h. A useful **explicit
24-hour replay**, preserving tracked output snapshots, is:

```bash
python -m models.plume.corridor --live --hours 24 --start 2026-10-07T08:41:00Z --output .venv/plume-validation-24h.geojson
```

`pipeline.steps.corridor_handler` defaults to 48 h and accepts additive event
options `forecast_hours`, `forecast_start` (aware ISO-8601) and `plume_params`.
It propagates model errors before storage writes. Pipeline snapshot tests now
supply an explicitly covered replay interval rather than silently extrapolating
old archives. The Lambda pipeline requirements add pyproj, already permitted
by the root requirements; no new library family is introduced.

## Tests and limits

```bash
python -m pytest models/plume -q
python -m pytest -q
```

Mathematical tests use labelled controlled vectors and geometry, not claimed
real observations. They verify wind direction, zero wind/symmetry, source
strength, Gaussian mass normalization, decay, dispersion, PBLH floor, changing
winds, puff provenance, mass centres, source independence, 48-hour simulation,
interpolation and coverage, geometry including holes/disconnected parts,
determinism, resource guards, invalid inputs and CLI preservation. Integration
tests read actual captured snapshots. Windows runs use UTF-8 mode and separate
workspace-local pytest temporary directories under ignored `.venv/`.

Python 3.12 syntax/API inspection is separate from runtime tests: the available
runtime is Python 3.14.3; direct Python 3.12 execution and Lambda packaging are
not verified. Further scientific limits include coarse 10 m winds, hourly Euler
steps, IDW smoothing/bounded spatial extension, unverified persistence of fire
emissions, a simplified well-mixed vertical layer, empirical removal, hourly
threshold sampling, and lack of observational calibration/uncertainty estimates.
The numerical tests do not establish real PM2.5 forecast skill.

## Real-snapshot validation result

Source input: `data/live/sources.json`; generated `2026-10-08T14:52:16.603976Z`.
Wind input: `data/live/wind.json`; generated `2026-10-07T18:37:57.090632Z`.
Explicit replay reference: **2026-10-07T08:41:00Z**.

This is an archived 24-hour replay using the stored timestamps and existing
10-source snapshot. The forecast input capture postdates the replay reference,
so this does not demonstrate a prospective forecast or observed PM2.5 skill.
The source and wind files were copied byte-for-byte into an isolated
`AERIS_DATA_DIR`; the actual module CLI was run twice with the explicit
start/horizon. Parameters were not tuned for geographic coverage.

- Horizon: **24 h**; sources: **10**.
- Unique hourly puffs emitted: **240** (24 per source).
- Grid cell size: **2 km**; source grids: **2,750 to 27,412 cells**.
- Polygon features: **34**; centrelines: **10**.
- Centreline vertices: **250 total** (25 per source).
- Actual `check_corridor` result on CLI output: **`[]` (PASS)**.
- Shapely validity and finite JSON: **PASS** for every output feature.
- Two real CLI runs: **byte-identical output**; input snapshot hashes preserved.
- Stable ignored output artifact: `.venv/plume-validation-24h.geojson`.
- Direct plume pytest: **65 passed, 0 failed**.
- Full repository pytest: **322 passed, 0 failed, 1 existing Requests warning**.
- Runtime: **Python 3.14.3**; Python 3.12 grammar/API inspection passed, runtime not available.
- Source-detection algorithm SHA-256 unchanged; all `data/live/` snapshots unchanged.

Displayed metrics are rounded; stored GeoJSON retains full precision. Bearings
are the **net centre-of-mass displacement** clockwise from true north, while
line lengths sum the whole curved path. The real outputs have heterogeneous
directions: south, east/northeast, and west/southwest. They are not directed
toward a chosen city. The largest-FRP source (`src_004`) has a net displacement
of **19.403 km at 164.21 degrees (south-southeast)**, with an **80.299 km**
centreline path reflecting changing winds and continuous emissions.

| Source | Grid cells | Polygons | Puffs | Line points | Line km | Net km | Bearing deg | Peak delta ug/m3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| src_001 | 5589 | 2 | 24 | 25 | 109.880 | 17.767 | 177.30 | 10.163 |
| src_002 | 4028 | 4 | 24 | 25 | 100.825 | 61.319 | 98.11 | 10.578 |
| src_003 | 3375 | 4 | 24 | 25 | 90.555 | 33.431 | 68.05 | 41.427 |
| src_004 | 27412 | 2 | 24 | 25 | 80.299 | 19.403 | 164.21 | 9.652 |
| src_005 | 17097 | 2 | 24 | 25 | 64.556 | 13.635 | 246.71 | 11.113 |
| src_006 | 6882 | 4 | 24 | 25 | 60.756 | 12.835 | 255.27 | 23.307 |
| src_007 | 9718 | 4 | 24 | 25 | 38.342 | 20.560 | 261.83 | 19.077 |
| src_008 | 3496 | 4 | 24 | 25 | 52.005 | 16.899 | 250.64 | 32.455 |
| src_009 | 3645 | 4 | 24 | 25 | 99.931 | 68.816 | 89.86 | 19.761 |
| src_010 | 2750 | 4 | 24 | 25 | 62.936 | 2.732 | 171.20 | 10.381 |

**Real 48-hour validation: unavailable with these captures.** The default
`--live` CLI correctly exits 1: the requested window begins at the latest
input capture (`2026-10-08T14:52:16.603976Z`) and ends two days later,
outside the real wind endpoint (`2026-10-08T17:30:00Z`). It preserves
the previous corridor. A 32-hour replay also failed the local-wind limit
at `(31.21159, 72.95891)` on `2026-10-08T14:41:00Z`; no wind was invented
outside the configured 50 km neighborhood. A full **48-hour simulation**
is verified by labelled mathematical tests, not by these real captures.

**Recommendation: READY_FOR_CALIBRATION** for the implemented baseline.
Before fitting or assessing real predictive skill, capture fresh wind with
the corrected UTC parser, provide sufficient temporal/spatial coverage,
and collect actual PM2.5 histories. No calibration or ML was implemented.
