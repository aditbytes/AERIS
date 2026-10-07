# AERIS — Work Split (4 parts)

Team: **Aditya** (owner), **Meenal Sinha**, **Pritam Singh**, **Saba Saeed**.
Each part owns separate folders, so merge conflicts stay minimal. Owners are left open — assign in the table below.

| Part | Owner | Scope | Folders |
|------|-------|-------|---------|
| **1. Data & Ingestion** | _TBD_ | Pull fire, AQI, weather and school/hospital data; normalise; write to S3 | `ingest/`, `data/` |
| **2. Source & Plume Corridor** | _TBD_ | Cluster fires into sources; forecast the risk corridor from wind + history | `models/source_detection/`, `models/plume/`, `models/training/` |
| **3. Exposure & Action Agent** | _TBD_ | Intersect corridor with schools/hospitals, rank by exposure + ETA; Strands Agent writes the action plan | `models/exposure/`, `agent/` |
| **4. API, Map UI & Deploy** | _TBD_ | API endpoints, single-map UI, AWS deployment, demo video, blog | `api/`, `web/`, `infra/`, `scripts/` |

## Part details

### 1. Data & Ingestion
- Lambda ingestors: NASA FIRMS, CPCB/OpenAQ, weather (GFS/ERA5/IMD), schools + hospitals (OSM/UDISE/NHA)
- EventBridge schedules; raw → S3 (bronze), cleaned → S3 (gold)
- Small `data/sample/` fixtures so everyone can work offline
- **Delivers:** `fires.json`, `aqi.json`, `wind.json`, `sites.geojson`

### 2. Source & Plume Corridor
- Detect and cluster active fires into **sources** (location, intensity, time)
- Forecast the **corridor** (GeoJSON polygon + hourly ETA) from wind and historical observations
- Simple advection baseline first; SageMaker model if time allows
- **Consumes:** `fires.json`, `aqi.json`, `wind.json` · **Delivers:** `sources.json`, `corridor.geojson`

### 3. Exposure & Action Agent
- Intersect corridor with `sites.geojson`; score and rank schools/hospitals (exposure, ETA, vulnerability)
- Estimate exposed population
- Strands Agent (Bedrock) turns the ranking into a prioritised action plan with tools like `query_plume`, `rank_sites`
- **Consumes:** `sources.json`, `corridor.geojson`, `sites.geojson` · **Delivers:** `ranked_sites.json`, `actions.json`

### 4. API, Map UI & Deploy
- API Gateway/Lambda: `/sources`, `/corridor`, `/sites`, `/actions`
- One map: source → corridor → sites → actions, with a side panel for the plan
- IaC (SAM/CDK), deploy to `ap-south-1`, CloudFront + S3 hosting
- 3-minute demo video and AWS Builder Center blog
- **Consumes:** all outputs above

## Interface contracts

Parts talk through JSON/GeoJSON files in S3 (`s3://aeris-<env>/gold/...`). Agree on the schemas first, commit them to `api/schemas/`, then everyone can build against `data/sample/` fixtures in parallel.

```
Part 1 ──► fires / aqi / wind / sites ──► Part 2 ──► sources + corridor ──► Part 3 ──► ranked_sites + actions ──► Part 4
```

## Working agreement
- Branch per part (`part1-ingest`, `part2-plume`, `part3-agent`, `part4-web`); open PRs into `main`
- Change a shared schema only via PR, and tell the downstream owner
- Keep one end-to-end demo path working at all times: a working feature beats five that almost work
