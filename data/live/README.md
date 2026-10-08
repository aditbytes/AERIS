# AERIS — `data/live/` Live Snapshot

This directory holds the most recently ingested real-time data files.
All files are produced by running the fetchers in `ingest/`.
**No file in this directory contains mock, synthetic, or fabricated data.**

---

## Snapshot manifest

| File | Source | Generated at (UTC) | Size | Notes |
|------|--------|-------------------|------|-------|
| `fires.json` | NASA FIRMS VIIRS NRT (3 satellites) | 2026-10-07T18:41Z | 57 KB | 227 fire detections |
| `wind.json` | Open-Meteo GFS | 2026-10-07T18:37Z | 3.2 MB | 323 grid points × 48 h |
| `sites.geojson` | OpenStreetMap / Overpass | 2026-10-07T18:49Z | 1.3 MB | 3,132 schools/hospitals |
| `aqi.json` | OpenAQ v3 | 2026-10-07T18:53Z | TBC | 230 active PM2.5 stations |
| `population.json` | WorldPop 2020 1 km (India-specific) | 2026-10-08T13:13Z | ~17 MB | 222,792 cells |

> **Note:** `data/raw/ind_ppp_2020_1km_Aggregated.tif` is gitignored (~18 MB).
> Run `python -m ingest.population.handler` to download it and generate `population.json`.

---

## File schemas

### `fires.json`
```json
{
  "generated_at": "<ISO-8601 UTC>",
  "source":       "NASA FIRMS VIIRS_NOAA21_NRT+VIIRS_NOAA20_NRT+VIIRS_SNPP_NRT",
  "bbox":         [73.5, 28.0, 77.5, 32.5],
  "fires": [
    {
      "id":           "f_0001",
      "lat":          28.29624,
      "lon":          77.38297,
      "acq_time":     "2026-10-07T07:44:00Z",
      "frp_mw":       4.42,
      "brightness_k": 335.02,
      "confidence":   "nominal",
      "satellite":    "VIIRS_NOAA21_NRT"
    }
  ]
}
```

### `wind.json`
```json
{
  "generated_at": "<ISO-8601 UTC>",
  "source":       "Open-Meteo GFS",
  "points": [
    {
      "lat": 28.0,
      "lon": 73.5,
      "hours": [
        {
          "t":            "2026-10-07T00:00:00Z",
          "u_ms":         1.5881,
          "v_ms":         2.3545,
          "speed_ms":     2.84,
          "dir_from_deg": 214,
          "pblh_m":       135.0
        }
      ]
    }
  ]
}
```

Wind-vector convention: `u = -speed × sin(dir_rad)`, `v = -speed × cos(dir_rad)` —
a north wind (dir_from = 0°) gives `v < 0` (blowing southward). Verified by `test_wind.py::TestWindComponents::test_north_wind_v_negative`.

### `sites.geojson`
GeoJSON FeatureCollection, `© OpenStreetMap contributors`.
```json
{
  "type": "FeatureCollection",
  "attribution": "© OpenStreetMap contributors",
  "generated_at": "<ISO-8601 UTC>",
  "features": [
    {
      "type": "Feature",
      "geometry": {"type": "Point", "coordinates": [77.21, 28.64]},
      "properties": {
        "id":        "s_0001",
        "name":      "Delhi School",
        "type":      "school",
        "occupancy": null,
        "source":    "OSM"
      }
    }
  ]
}
```
Occupancy is `null` when the OSM `capacity`/`beds` tag is absent — **not estimated**.

### `aqi.json`
```json
{
  "generated_at": "<ISO-8601 UTC>",
  "stations": [
    {
      "id":           "OAQ_2860223",
      "name":         "GK1 (Oberoi Terrace)",
      "lat":          28.538,
      "lon":          77.249,
      "pm25":         74.9,
      "pm10":         null,
      "aqi":          167,
      "aqi_category": "Moderate",
      "observed_at":  "2026-09-30T19:00:00Z",
      "source":       "OpenAQ"
    }
  ]
}
```
AQI computed using official CPCB PM2.5 breakpoints (linear interpolation).
CPCB/data.gov.in backup: `api.data.gov.in` was unreachable from this machine during snapshot capture — no CPCB records in this snapshot (not fabricated).

### `population.json`
```json
{
  "cell_km": 1.0,
  "generated_at": "<ISO-8601 UTC>",
  "source": {
    "name":    "WorldPop Global High Resolution Population Denominators",
    "url":     "https://worldpop-public-data.soton.ac.uk/GIS/Population/Global_2000_2020_1km/2020/IND/ind_ppp_2020_1km_Aggregated.tif",
    "doi":     "10.5258/SOTON/WP00647",
    "year":    2020,
    "license": "CC BY 4.0"
  },
  "bbox":  [73.5, 28.0, 77.5, 32.5],
  "cells": [
    {"lat": 28.0042, "lon": 73.5042, "pop": 1234}
  ]
}
```

---

## Regenerating the snapshot

```bash
# From the repo root, with .env populated:
python -m ingest.firms.handler        # → fires.json
python -m ingest.weather.handler      # → wind.json
python -m ingest.aqi.handler          # → aqi.json
python -m ingest.sites.handler        # → sites.geojson
python -m ingest.population.handler   # → population.json (downloads 829 MB first time)
```

See `ingest/README.md` for full instructions.

---

## Known Status

- `population.json` now uses the official India-specific WorldPop dataset (~18 MB) which successfully resolves the previous download timeout issue seen with the 845 MB global raster.
- `corridor.geojson` and `ranked_sites.json` are now fully populated and use the real data pipelines to calculate exposure counts.
