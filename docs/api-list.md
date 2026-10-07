# AERIS — API List

Two groups: **external data APIs** AERIS pulls from (owner: Meenal; keys held by Aditya on AWS), and **AERIS's own API** that the map UI calls (built by Aditya on API Gateway + Lambda).

> ⚠️ **Real data only.** Every API below returns live data. Never replace a response with demo or invented data. The endpoint details were written from memory of the public docs and **not yet called**, so check each against its official docs before building on it.

---

## 1. External data APIs

| # | Data | API | Auth | Cost | Used for | Output file |
|---|------|-----|------|------|----------|-------------|
| 1 | Active fires | NASA FIRMS Area API | free `MAP_KEY` | free | Source detection | `fires.json` |
| 2 | Ground air quality | OpenAQ v3 | free API key | free | AQI stations, calibration | `aqi.json` |
| 3 | Ground air quality (India) | data.gov.in CPCB real-time AQI resource | free API key | free | CPCB station backup/cross-check | `aqi.json` |
| 4 | Wind, boundary layer | Open-Meteo Forecast API | none | free (non-commercial) | Plume advection | `wind.json` |
| 5 | Historical weather | Open-Meteo Historical API | none | free (non-commercial) | Calibration | `wind.json` (history) |
| 6 | Schools, hospitals | OpenStreetMap Overpass API | none | free | Vulnerable sites | `sites.geojson` |
| 7 | Population | WorldPop (1 km India raster download) | none | free | Exposed-people estimate | `population.json` |
| 8 | Satellite NO₂/CO/AOD (optional) | Copernicus Data Space (Sentinel-5P) | free account | free | Source verification | optional |
| 9 | Reanalysis (optional) | ERA5 via Copernicus CDS API | free account | free | Historical wind/PBLH | optional |

### 1. NASA FIRMS — active fires
- Docs: https://firms.modaps.eosdis.nasa.gov/api/
- Get a key: https://firms.modaps.eosdis.nasa.gov/api/map_key/
- Endpoint: `GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}`
- `SOURCE`: `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `MODIS_NRT`
- Example bbox: `73.5,28.0,77.5,32.5` (Punjab, Haryana, NW Delhi); `DAY_RANGE` 1–5
- Returns CSV: `latitude, longitude, bright_ti4, acq_date, acq_time, confidence, frp, ...`
- Rate limit: a transaction cap per key per 10 minutes; fetch every 15 min at most
- Env var: `FIRMS_MAP_KEY`

### 2. OpenAQ v3 — air quality
- Docs: https://docs.openaq.org/
- Auth: header `X-API-Key: <key>`; env var `OPENAQ_API_KEY`
- Find stations: `GET https://api.openaq.org/v3/locations?bbox=73.5,28.0,77.5,32.5&parameters_id=2&limit=1000` (parameter 2 is PM2.5; confirm the id in the docs)
- Latest values: `GET https://api.openaq.org/v3/locations/{id}/latest`
- History: `GET https://api.openaq.org/v3/sensors/{sensor_id}/measurements?datetime_from=...&datetime_to=...`

### 3. data.gov.in — CPCB real-time AQI (backup)
- Portal: https://data.gov.in/ ("Real time Air Quality Index from various locations")
- Endpoint pattern: `GET https://api.data.gov.in/resource/{RESOURCE_ID}?api-key={KEY}&format=json&limit=1000`
- Find the current `RESOURCE_ID` on the dataset page; filter by `state` / `city`
- CPCB's own site (app.cpcbccr.com) has **no official public API**; do not scrape it
- Env var: `DATA_GOV_IN_KEY`

### 4–5. Open-Meteo — wind and boundary layer
- Docs: https://open-meteo.com/en/docs
- Forecast: `GET https://api.open-meteo.com/v1/forecast?latitude={lat1,lat2,...}&longitude={lon1,lon2,...}&hourly=wind_speed_10m,wind_direction_10m,boundary_layer_height&wind_speed_unit=ms&forecast_days=2&timezone=UTC`
- Several comma-separated coordinates return one result per point, so one call covers a grid
- Historical: `GET https://archive-api.open-meteo.com/v1/archive?...&start_date=...&end_date=...`
- No key. Free for non-commercial use, which fits the hackathon; check the terms before any commercial use

### 6. OpenStreetMap Overpass — schools and hospitals
- Docs: https://wiki.openstreetmap.org/wiki/Overpass_API
- Endpoint: `POST https://overpass-api.de/api/interpreter` with a body like
  ```
  [out:json][timeout:120];
  (nwr["amenity"="school"](28.0,76.5,29.2,77.8);
   nwr["amenity"="hospital"](28.0,76.5,29.2,77.8););
  out center tags;
  ```
- Be polite: one bulk query, cache the result, no polling. It is a static dataset
- Attribution required: "© OpenStreetMap contributors"

### 7. WorldPop — population
- Hub: https://hub.worldpop.org/ (India, 1 km, "unconstrained, UN-adjusted" counts)
- It is a **file download** (GeoTIFF), not a live query: download once, clip to the bbox, aggregate to `population.json`

### 8–9. Optional
- **Sentinel-5P** (NO₂, CO, SO₂, aerosol) via https://dataspace.copernicus.eu/ (OData/STAC search plus download); good for verifying a plume visually, heavy to process
- **ERA5** via https://cds.climate.copernicus.eu/ (`cdsapi` Python package); only if Open-Meteo history is not enough

---

## 2. AERIS API (served by AWS)

Base URL: the API Gateway invoke URL (set as `API_BASE_URL` in the UI). All responses are JSON in the formats of [`data-contracts.md`](data-contracts.md). All routes are `GET` unless noted. CORS allows the CloudFront origin.

| Method | Route | Returns | Source file in S3 `gold/` |
|--------|-------|---------|---------------------------|
| GET | `/health` | `{"status": "ok", "last_run": "<time>"}` | n/a |
| GET | `/sources` | Detected pollution sources | `sources.json` |
| GET | `/corridor` | Time-banded risk corridor (GeoJSON) | `corridor.geojson` |
| GET | `/sites` | Schools and hospitals (GeoJSON) | `sites.geojson` |
| GET | `/ranked-sites?limit=20&type=school\|hospital` | Ranked vulnerable sites + exposed population | `ranked_sites.json` |
| GET | `/actions` | Agent action plan | `actions.json` |
| GET | `/stations` | Air-quality stations (for the map dots) | `aqi.json` |
| GET | `/summary` | Headline numbers: source count, ETA, exposed people, summary text | built from the files above |
| POST | `/run` | Triggers a fresh pipeline run; returns a run id (optional) | n/a |
| GET | `/run/{run_id}` | Run status: `running`, `succeeded`, `failed` | n/a |

### Response conventions
- Every response includes `generated_at`. If the underlying data is older than its refresh interval, add `"stale": true` and keep the last real result; never substitute invented data
- Errors: `{"error": "<code>", "message": "<text>"}` with status `404` (no data yet), `502` (upstream source failed), `500` (internal)
- `Cache-Control: max-age=60` on reads

---

## 3. AWS service APIs (internal, called from Lambda)

| Service | API | Used by |
|---------|-----|---------|
| Amazon S3 | `GetObject`, `PutObject` | storage layer for every stage |
| Secrets Manager / SSM | `GetSecretValue` / `GetParameter` | read API keys |
| Amazon Bedrock Runtime | `Converse` / `InvokeModel` | Strands agent's model |
| SageMaker Runtime | `InvokeEndpoint` | optional ML corridor model |
| EventBridge Scheduler | schedules (no direct calls) | trigger fetchers |
| Step Functions | `StartExecution` | optional pipeline orchestration for `/run` |
| CloudWatch Logs | automatic | logs, alarms |

---

## 4. Keys checklist

| Env var | Where to get it | Stored in |
|---------|-----------------|-----------|
| `FIRMS_MAP_KEY` | FIRMS map key page | Secrets Manager |
| `OPENAQ_API_KEY` | openaq.org account | Secrets Manager |
| `DATA_GOV_IN_KEY` | data.gov.in account | Secrets Manager |
| `API_BASE_URL` | API Gateway output | UI build env |

Never commit keys; use `.env` locally (gitignored) and `.env.example` for names only.
