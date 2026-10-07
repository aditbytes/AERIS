# Pritam Singh — Source Detection and Plume Corridor

> ⚠️ **No demo data.** AERIS uses **only real data** from live sources. Do not create, hand-write, mock or hard-code sample, demo, placeholder or fabricated data — not in code, not in the UI, not in tests, and not as a "fallback". If a live source is unavailable, return an error and show an error state. The only offline files allowed are **real snapshots** that the fetchers captured from live sources into `data/live/` (each stamped with its source and fetch time). Tests may use small captured real API responses, labelled as such.

You build the **"where is it coming from" and "where will it go"** steps. This is the core science of AERIS. Everything runs locally in plain Python, with no AWS account needed. Aditya deploys it (Lambda, and SageMaker if you deliver an ML model). Shared formats: [`../data-contracts.md`](../data-contracts.md).

## Your outputs

| File | What it is |
|------|------------|
| `sources.json` | Pollution sources found from fire detections |
| `corridor.geojson` | Time-banded risk corridor from each source |

## Folders you own

```
models/
  source_detection/   # cluster.py, score.py, tests/
  plume/              # advect.py, corridor.py, calibrate.py, tests/
  training/           # train.py, inference.py (optional ML), notebooks/
  common/             # geo helpers (haversine, destination point, projections)
```

## Rules for your code

1. **Pure functions, no network.** Take parsed dicts in and return dicts out. Meenal's fetchers make the API calls
2. **Start from the real snapshots in `data/live/`** (Meenal publishes the first on day 1). Until then, call the live APIs yourself; never hand-write inputs
3. **Match the contracts exactly**, especially the field names in `sources.json` and `corridor.geojson`; Meenal and Saba depend on them
4. Python 3.12, `numpy`, `shapely`, `pyproj`, `scikit-learn`, `pytest`. Keep dependencies small so Aditya can package them as a Lambda
5. **A working simple model beats a clever broken one.** Ship the baseline first, then improve

---

## Task 1 — Source detection (`models/source_detection/`)

Goal: turn raw fire points into a small number of **sources**.

1. **Filter** low-confidence detections and detections older than a window (default 24 h)
2. **Cluster** with DBSCAN using haversine distance (`eps` about 5–10 km, `min_samples` 3). Treat noise points as individual minor sources or drop them (parameter)
3. For each cluster compute: centroid (FRP-weighted), `fire_count`, `total_frp_mw`, `radius_km` (distance containing 90% of fires), `first_seen`, `last_seen`
4. **Emission strength** (0–1): a monotonic function of `total_frp_mw`, normalised against a reference (for example `1 - exp(-frp/500)`). Document your choice
5. **Confidence** (0–1): combine fire count, the share of `high` confidence detections, and recency
6. **Type**: label `stubble_burning` if the cluster is over agricultural Punjab/Haryana and the detection is in Oct–Nov, otherwise `fire`. A simple bbox/season rule is fine
7. **AQI cross-check (nice to have)**: if `aqi.json` is given, boost confidence when downwind stations show PM2.5 rising

- [ ] `detect_sources(fires, aqi=None, params=...) -> dict` in the `sources.json` format
- [ ] CLI: `python -m models.source_detection.cluster --live`
- [ ] Tests: two separate clusters give two sources, an isolated low-confidence point is dropped, the centroid is inside the cluster

## Task 2 — Plume corridor baseline (`models/plume/`)

Goal: from sources and wind, a **time-banded corridor** of where smoke will go over the next 0–48 h.

Use a simple **Lagrangian puff / advection model**:

1. For each source, release a puff every hour (the "emission"), each with the source's `emission_strength`
2. For every hour step `dt`, move the puff by the local wind: `Δ = (u, v) · dt`. Interpolate wind in space (inverse-distance weighting between grid points) and time from `wind.json`
3. Add **turbulent spread**: puff sigma grows with travel time, for example `σ(t) = σ0 + k·√t` (calibrate `k`, see Task 3). Stable boundary layers (low `pblh_m`) mean less vertical mixing and therefore higher surface concentration, so scale concentration by `1 / max(pblh, 200)`
4. Apply **decay/deposition**: `exp(-t/τ)` with `τ` about 24 h for PM2.5
5. Accumulate puff concentrations on a grid (about 1–2 km cells) for each forecast hour. Convert to `pm25_delta_ugm3` using a scale constant that you calibrate
6. **Corridor polygons**: for each time band (0–2 h, 2–4 h, 4–8 h, 8–24 h) take the union of grid cells where concentration exceeds a threshold, simplify and output as `Polygon` features with `risk` (0–1) and `pm25_delta_ugm3`
7. **Centreline**: the path of the centre of mass of the puffs, with `points_eta_hours` for each vertex. Meenal uses this for ETA

- [ ] `predict_corridor(sources, wind, hours=48, params=...) -> geojson`
- [ ] CLI: `python -m models.plume.corridor --live`
- [ ] Sanity tests: wind from the NW gives a corridor towards the SE; zero wind gives a symmetric blob; higher `emission_strength` gives a higher `pm25_delta`; on a real burning event from the live snapshot, the corridor heads in the direction the real wind blows and the result is explained honestly. Do not tune the model to force a corridor onto Delhi

## Task 3 — Calibration with history (`calibrate.py`)

The brief says "use wind + source location + **historical observations**".

- Use `aqi.json` snapshots (or a historical CSV; OpenAQ and CPCB history work) to tune `σ0`, `k`, `τ` and the concentration scale so that forecast PM2.5 deltas at downwind stations best match what was observed after past burning events
- Method: grid search or `scipy.optimize` minimising RMSE of (forecast delta vs observed PM2.5 − background) at stations
- Save the fitted parameters in `models/plume/params.json`, which `predict_corridor` loads by default
- Document what data you used and the error you got. If real history is hard to get, say clearly that the parameters are uncalibrated assumptions; do not calibrate on invented data

## Task 4 — Optional ML surrogate (`models/training/`)

Only after Tasks 1–3 work. The architecture diagram mentions a neural/ML surrogate and the hackathon rewards AWS use, so an ML model that Aditya can train on **SageMaker** strengthens the submission.

- Train a gradient-boosted model (`sklearn`/`xgboost`) or small MLP: inputs = wind speed/direction, distance and bearing from the source, hours since emission, `pblh`, source strength; target = PM2.5 delta at a station (from the physics baseline, history, or both)
- Training data: generate from the baseline with random scenarios plus any real history
- Deliver SageMaker-compatible scripts: `train.py` (reads `SM_CHANNEL_TRAIN`, writes the model to `SM_MODEL_DIR`) and `inference.py` (`model_fn`, `input_fn`, `predict_fn`, `output_fn`)
- Compare against the baseline in `notebooks/eval.ipynb`: RMSE and a forecast-vs-observed plot. Keep the baseline as the default if the ML model is not clearly better

## Task 5 — Tests and docs

- [ ] pytest for every public function; unit tests may use tiny geometric inputs to check maths (for example a straight wind line) and small captured real data; never present them as results
- [ ] `models/README.md`: model assumptions, formulas, parameters, known limits (the model is not WRF-Chem, say that honestly)
- [ ] Add dependencies to `requirements.txt`

## Handoffs

| To | What | When |
|----|------|------|
| Meenal, Saba | First `sources.json` and `corridor.geojson` produced by your code from real data | Day 2 |
| Meenal | Real `corridor.geojson` | Day 2 |
| Aditya | `requirements.txt`, entry point function names, the `params.json` | Day 2 |
| Aditya | `train.py` / `inference.py` (if you do Task 4) | Day 3 |

## Definition of done

- `detect_sources` and `predict_corridor` run on real snapshots from `data/live/` and produce valid contract output
- The corridor is derived from real fire and wind data and reported as it is
- Parameters are calibrated or clearly marked as assumptions
- Tests pass with `pytest`
