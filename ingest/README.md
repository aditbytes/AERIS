# AERIS — Ingest Module

Data ingestion layer for AERIS. Fetches real-time fire, air-quality, wind, site, and population data from external APIs and writes them to `data/live/`.

---

## Folder layout

```
ingest/
  common/        # shared HTTP helper (retry, timeouts), storage stub
  firms/         # NASA FIRMS active-fire fetcher
  aqi/           # OpenAQ v3 + CPCB/data.gov.in AQI fetcher
  weather/       # Open-Meteo wind / boundary-layer fetcher
  sites/         # OpenStreetMap Overpass schools/hospitals fetcher
  population/    # WorldPop population-grid builder
  tests/         # pytest unit tests
```

---

## Prerequisites

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
# Edit .env with real values — never commit .env
```

Required environment variables:

| Variable | Where to get it |
|----------|-----------------|
| `FIRMS_MAP_KEY` | [firms.modaps.eosdis.nasa.gov/api/map_key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) — free registration |
| `OPENAQ_API_KEY` | [explore.openaq.org/register](https://explore.openaq.org/register) — free account |
| `DATA_GOV_IN_KEY` | [data.gov.in](https://data.gov.in) — free registration |

---

## Running each fetcher

All fetchers write their output to `data/live/`.

### 1. NASA FIRMS — active fires

```bash
python -m ingest.firms.handler
# With options:
python -m ingest.firms.handler --bbox 73.5,28.0,77.5,32.5 --days 1
```

Output: `data/live/fires.json`

### 2. Air quality (OpenAQ + CPCB)

```bash
python -m ingest.aqi.handler
# With options:
python -m ingest.aqi.handler --bbox 73.5,28.0,77.5,32.5
```

Output: `data/live/aqi.json`

### 3. Wind / boundary-layer (Open-Meteo)

```bash
python -m ingest.weather.handler
# With options:
python -m ingest.weather.handler --bbox 73.5,28.0,77.5,32.5 --step 0.25
```

Output: `data/live/wind.json`

### 4. Schools and hospitals (OSM Overpass)

```bash
python -m ingest.sites.handler
# With options:
python -m ingest.sites.handler --bbox 76.5,28.0,77.8,29.2
```

Output: `data/live/sites.geojson`  
Attribution: © OpenStreetMap contributors

### 5. Population grid (WorldPop)

> **Note:** The first run downloads the WorldPop global GeoTIFF (~829 MB) to `data/raw/`. This is a one-time download; subsequent runs reuse the cached file. `data/raw/` is gitignored.

```bash
python -m ingest.population.handler
# Force re-download:
python -m ingest.population.handler --force-download
```

Output: `data/live/population.json`

### Run all fetchers at once

```bash
python -m ingest.firms.handler && \
python -m ingest.aqi.handler && \
python -m ingest.weather.handler && \
python -m ingest.sites.handler && \
python -m ingest.population.handler
```

---

## Running tests

```bash
# From the repo root
pytest ingest/tests/ -v

# Run just the wind tests (includes the required north-wind v < 0 test):
pytest ingest/tests/test_wind.py -v
```

---

## Lambda interface

Each fetcher exposes a `lambda_handler(event, context)` function, as required by the work-split doc. Aditya wraps these in Lambda and EventBridge schedules.

Event fields each handler accepts:

| Handler | Event fields |
|---------|-------------|
| `firms/handler.py` | `bbox`, `day_range`, `sources` |
| `aqi/handler.py` | `bbox` |
| `weather/handler.py` | `bbox`, `step_deg` |
| `sites/handler.py` | `bbox` |
| `population/handler.py` | `bbox` |

---

## Data provenance

Every output file includes `generated_at` (UTC ISO-8601) and `source` fields.  
**No mock, demo, or fabricated data is ever written.** If an upstream API fails, the fetcher logs an error and either continues with other sources or raises — it never substitutes invented values.

See `data/live/README.md` for the captured snapshot manifest.
