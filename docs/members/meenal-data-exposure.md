# Meenal Sinha — Data Ingestion and Exposure Ranking

> ⚠️ **No demo data.** AERIS uses **only real data** from live sources. Do not create, hand-write, mock or hard-code sample, demo, placeholder or fabricated data — not in code, not in the UI, not in tests, and not as a "fallback". If a live source is unavailable, return an error and show an error state. The only offline files allowed are **real snapshots** that the fetchers captured from live sources into `data/live/` (each stamped with its source and fetch time). Tests may use small captured real API responses, labelled as such.

You build the **data foundation** and the **"who gets hit" step**. Everything runs locally with plain Python, no AWS account needed. Aditya deploys it on AWS afterwards. Shared formats: [`../data-contracts.md`](../data-contracts.md).

## Your outputs

| File | What it is |
|------|------------|
| `fires.json` | Active-fire detections |
| `aqi.json` | Ground air-quality readings |
| `wind.json` | Wind and boundary-layer forecast |
| `sites.geojson` | Schools and hospitals |
| `population.json` | Gridded population |
| `data/live/*` | Real snapshots captured by your fetchers, so the team can work offline |
| `ranked_sites.json` | Vulnerable sites ranked by exposure |

## Folders you own

```
ingest/
  common/        # http helper, retry, time utils (storage.py is Aditya's)
  firms/         # fetch_fires.py + handler.py
  aqi/           # fetch_aqi.py + handler.py
  weather/       # fetch_wind.py + handler.py
  sites/         # fetch_sites.py
  population/    # build_population.py
  tests/
data/live/       # captured real snapshots (source + fetch time stamped)
models/exposure/ # rank_sites.py, population_overlay.py, tests/
```

## Rules for your code

1. **Run offline.** Every function accepts parameters, with no hidden globals. Add a flag that reads a captured real snapshot from `data/live/`. If the network fails and no snapshot exists, raise a clear error; never invent values
2. **Lambda-ready.** Each fetcher has `lambda_handler(event, context)` that calls a pure function and then writes via `storage.write_json(key, obj)`. Import `storage` from `ingest/common/storage.py`. Aditya provides it with a local-file default, so until it lands write a 10-line stub that dumps to `data/out/`
3. **Contracts first.** Match the schemas exactly. If you need to change one, open a PR to `docs/data-contracts.md` and tell Pritam, Saba and Aditya
4. **API keys via environment variables** (`FIRMS_MAP_KEY`, `OPENAQ_API_KEY`); never hard-code. Add them to `.env.example`
5. Python 3.12, type hints, `requests`, `pydantic` for validation, `pytest`

---

## Task 1 — Real data snapshots (do this FIRST, it unblocks everyone)

Run your fetchers against the live sources for the Punjab/Haryana → Delhi-NCR region (bbox `[73.5, 28.0, 77.5, 32.5]`) and save the results to `data/live/` in the contract formats. These are **real snapshots, not demo data**: each file carries `source` and `generated_at`, and nothing is edited by hand.

- [ ] `fires.json`, `aqi.json`, `wind.json`, `sites.geojson`, `population.json` from the real sources
- [ ] A short `data/live/README.md` listing each file's source, query and fetch time
- [ ] Refresh the snapshots whenever the team needs newer data (re-run, never hand-edit)
- [ ] Pritam, Saba and Aditya build on these; the downstream files (`sources.json`, `corridor.geojson`, `ranked_sites.json`, `actions.json`) are produced by the real pipeline code, not written by hand
- [ ] Open a PR on day 1 with the first real snapshot

## Task 2 — NASA FIRMS fire fetcher

- Register for a free **MAP_KEY** at firms.modaps.eosdis.nasa.gov
- Call the Area API for `VIIRS_SNPP_NRT` (and optionally `MODIS_NRT`) with the bbox `[73.5, 28.0, 77.5, 32.5]` (Punjab, Haryana, NW Delhi) and `day_range=1`
- Parse the CSV; map `latitude, longitude, acq_date + acq_time, frp, bright_ti4, confidence` to the `fires.json` schema; convert VIIRS confidence `l/n/h` to `low/nominal/high`
- Drop `low` confidence by default (parameter)
- Handle empty results and HTTP errors with retries and a clear message
- [ ] `fetch_fires(bbox, day_range, key) -> dict`, `handler.py`, tests with a recorded CSV

## Task 3 — Air quality fetcher

- Primary: **OpenAQ v3** API (PM2.5, PM10 for stations within the NCR bbox). Fallback: CPCB data if you can find an accessible feed, else report that no ground data is available
- Keep the latest reading per station and compute an AQI category from PM2.5 using the Indian CPCB breakpoints
- [ ] `fetch_aqi(bbox, key) -> dict`, `handler.py`, tests

## Task 4 — Weather and wind fetcher

- Use **Open-Meteo** (free, no key): `wind_speed_10m`, `wind_direction_10m`, and `boundary_layer_height` hourly for 48 h
- Query a grid of points (about 0.25° spacing) covering the bbox from the fire area to Delhi
- Compute `u_ms`, `v_ms` from speed and direction (`u = -s·sin(dir)`, `v = -s·cos(dir)`, with dir in radians as the "from" direction). Add a unit test with known directions (a north wind is `v < 0`)
- [ ] `fetch_wind(bbox, step_deg) -> dict`, `handler.py`, tests

## Task 5 — Schools and hospitals

- Use the **OpenStreetMap Overpass API**: `amenity=school`, `amenity=hospital`, `healthcare=hospital` within the Delhi-NCR bbox
- Convert ways and relations to centroid points; dedupe by name and distance
- Fill `occupancy` where tags exist (`capacity`, `beds`); otherwise estimate defaults (school ≈ 800, hospital ≈ 150 beds) and mark `"occupancy_estimated": true`
- Save once to `sites.geojson` (this is a static dataset; it does not need a schedule)
- [ ] `fetch_sites(bbox) -> geojson`, tests

## Task 6 — Population grid

- Use **WorldPop** (1 km India raster) or GHSL; clip to the NCR bbox and aggregate to a `population.json` with cells of about 1 km
- If the raster is too heavy for the time available, download once and commit the small clipped result under `data/live/`
- [ ] `build_population(bbox) -> dict`

## Task 7 — Exposure ranking (`models/exposure/`)

Inputs: `corridor.geojson` (Pritam), `sites.geojson`, `population.json`.

1. **Intersect**: for each site, find the corridor bands that contain it (use `shapely`; build a spatial index with `STRtree` if there are many sites)
2. **ETA**: a site's `eta_hours` is the `hour_from` of the earliest band that contains it. Interpolate along the centreline for a smoother estimate if time allows
3. **Exposure**: `pm25_delta_ugm3` = the band value at that site (scaled by distance from the centreline if you want a gradient)
4. **Vulnerability weight**: hospitals ×1.5, schools ×1.3, scaled by `log(occupancy)` and the child/elderly factor
5. **Score**: `risk_score = clip(pm25_delta/200 · vulnerability · urgency, 0, 1)`, where `urgency` is higher the sooner the ETA. Document the formula in the module docstring
6. **Rank** descending, assign `rank`, and write `ranked_sites.json`
7. **Exposed population**: sum `pop` of all population cells inside corridor bands with `risk` above a threshold. Report `estimate`, plus `low`/`high` by varying the threshold and a ±25% allowance for population-data error
8. Keep the formula transparent and in one place so judges (and Saba's agent) can explain it

- [ ] `rank_sites(corridor, sites, population) -> dict`, CLI `python -m models.exposure.rank_sites --live`, tests (a site inside a band outranks a site outside; a hospital outranks a school at equal exposure)

## Task 8 — Tests and docs

- [ ] pytest for every function; tests may use small captured real API responses in `tests/fixtures/`, labelled with source and capture time; never invented values
- [ ] `ingest/README.md`: how to get each key, how to run each fetcher
- [ ] Add your Python dependencies to `requirements.txt`

## Handoffs

| To | What | When |
|----|------|------|
| Everyone | Real snapshots in `data/live/` | Day 1 |
| Pritam | `fires.json`, `aqi.json`, `wind.json` (real) | Day 2 |
| Saba | `ranked_sites.json` computed from real inputs | Day 2–3 |
| Aditya | Lambda-ready handlers and an env var list | Day 2 |

## Definition of done

- Each fetcher runs from the command line and returns valid contract JSON
- Offline mode works from real snapshots in `data/live/`
- `rank_sites` runs end to end on real snapshot data and puts hospitals and schools in the corridor at the top
- Tests pass with `pytest`
