<div align="center">

<img src="docs/assets/logo.svg" alt="AERIS" width="520"/>

**Source → Plume → Exposure → Action**<br>
*An engine that groups satellite fire detections, models smoke transport, and supports response planning.*

![Track](https://img.shields.io/badge/Track-Air-1e88e5?style=flat-square)
![Hackathon](https://img.shields.io/badge/Environmental%20Hacks-Bharat%20Builds%20Tour-ed7100?style=flat-square)
![AWS](https://img.shields.io/badge/AWS-Lambda%20%C2%B7%20Step%20Functions%20%C2%B7%20Bedrock-232f3e?style=flat-square&logo=amazonaws)
![Strands](https://img.shields.io/badge/Strands-Agents-00838f?style=flat-square)
![Status](https://img.shields.io/badge/status-live%20on%20AWS-2e7d32?style=flat-square)

[Live demo](https://d2iyso2niquge7.cloudfront.net) · [Architecture](docs/assets/aeris-deployed-architecture.png) · [Data contracts](docs/data-contracts.md) · [API](docs/api-list.md)

</div>

## ⚡ Overview

**AERIS** (*Air Exposure & Risk Intelligence System*) treats air pollution as a decision problem, not a reporting problem. Every October and November, crop-residue fires in Punjab and Haryana send smoke towards Delhi NCR, and the AQI only reports it after people are already breathing it.

AERIS combines satellite fire detections, ground air-quality readings, wind and weather, and the locations of schools, hospitals and people. It groups fires into **candidate source clusters**, estimates smoke transport with a simplified physics baseline, and connects modelled corridors to sites and response planning on a map, to support early decisions.

Source labels and risk scores are uncalibrated heuristics; the implementation does not establish causal attribution, observed forecast accuracy, or guaranteed exposure/arrival times. Current modelling evidence and limits are documented in [`models/README.md`](models/README.md).

```
🔥 Source            →  🌫️ Plume              →  👥 Exposure          →  🚨 Action
candidate fire          modelled smoke            schools and hospitals    prioritised site and
clusters and strength   paths and arrival times   inside the corridor      authority responses
```

> With sufficiently covered real inputs, AERIS produces candidate fire-source clusters, modelled corridors, site rankings and a response plan. Missing input or wind coverage produces an explicit error; unavailable weather is never invented.

> 🚫 **Real production data only.** AERIS never publishes demo, sample, mock or fabricated data as live observations. If a live source is down, the API serves the last real result marked `stale`, or returns `404 no_data`. It never fills in a default.

Numerical tests and optional ML training use separately labelled mathematical/`BASELINE_SIMULATED` scenarios; these are never published as live observations or historical calibration.

## 🌐 Live

**Website:** https://d2iyso2niquge7.cloudfront.net

The SAM template configures the pipeline every 30 minutes, fires every 15 minutes, air quality every 30 minutes and wind hourly. The currently published deployment and live feeds have not been reverified for this readiness milestone; the URL above is the previously documented endpoint.

## 🧭 How it works

| Step | What AERIS does | Code |
|------|-----------------|------|
| 1. **Ingest** | Pulls VIIRS fire detections, PM2.5/PM10 station readings and a 48-hour wind and boundary-layer forecast on a schedule. Schools, hospitals and population are loaded once | `ingest/` |
| 2. **Detect sources** | Clusters nearby fires into candidate sources, with an FRP-weighted centre, an emission-strength proxy, heuristic confidence and type (stubble burning or other fire) | `models/source_detection/` |
| 3. **Forecast the corridor** | Advects puffs from each source with the real forecast wind, giving time bands (0–2 h, 2–4 h, 4–8 h, 8–24 h) and a centreline with ETAs | `models/plume/` |
| 4. **Rank exposure** | Intersects the corridor with schools, hospitals and the population grid. Scores each site by PM2.5 increase, ETA and vulnerability, and estimates the people exposed | `models/exposure/` |
| 5. **Plan actions** | A Strands agent on Amazon Bedrock reads the results through tools and writes a prioritised plan for each site and for the authorities. Every site in the plan is checked against the ranking | `agent/` |
| 6. **Serve and show** | An HTTP API serves every result with its age. A React + MapLibre dashboard shows source → corridor → sites → actions | `api/`, `web/` |

### Preserved archive and current replay

The saved source artifact contains **10 legacy source records**, generated `2026-10-08T14:52:16.603976Z`. The current detector replay of the separately preserved **227-fire** input produces **22 candidate clusters**, referenced to that input's capture time. These are distinct artifacts; original source input/parameter bindings are unknown.

The saved corridor contains obsolete concentration and risk floors. Its values are historical simulations, not the current Gaussian-puff calculation, observed PM2.5 or calibrated forecasts. The source/corridor notice in the dashboard identifies exact LF/CRLF byte variants and exposes timestamps, hashes and available lineage. Saved population/ranking/action artifacts have separate timestamps; they do not establish a single original run or confirmed exposure.

## 🏗️ Architecture configured in SAM

<img src="docs/assets/aeris-deployed-architecture.png" alt="AERIS deployed architecture" width="100%"/>

```
 EventBridge Scheduler ──► Fetch Lambdas (FIRMS 15 min · AQI 30 min · wind 60 min)
                                  │   API keys from Secrets Manager · failures → SQS DLQ
                                  ▼
                     S3  bronze/ (raw, 14-day expiry) · reference/ (sites, population)
                                  │
 EventBridge (30 min) or POST /run ──► Step Functions
        publish ─► detect ─► corridor ─► rank ─► agent (Strands on Bedrock, rules fallback)
                                  │
                                  ▼
                     S3  gold/ (contract JSON, last real result kept on failure)
                                  │
                     API Gateway HTTP API ─► API Lambda (stale flags, 404 no_data)
                                  │
                     CloudFront ─► private S3 web bucket (React + MapLibre)

 CloudWatch logs (7-day) · alarms → SNS email · AWS Budgets · all in CloudFormation/SAM
```

**AWS services:** Lambda (10 functions, Python 3.12, arm64), Step Functions, EventBridge Scheduler, S3, Secrets Manager, SQS, Amazon Bedrock, API Gateway, CloudFront, CloudWatch, SNS, AWS Budgets, IAM (one least-privilege role per function). Region: `ap-south-1` (Mumbai).

The full 8-layer target design is in [`docs/aeris_architecture.drawio`](docs/aeris_architecture.drawio); its "As deployed" page records the earlier deployment design; the current remote stack remains unverified.

## 📁 Repository layout

```
AERIS/
├── ingest/       # Fetchers: FIRMS, AQI, weather, sites, population; shared storage, secrets, HTTP
├── models/       # source_detection/ · plume/ (corridor) · exposure/ (ranking) · common/ (geo)
├── agent/        # Strands tools, Bedrock agent with model fallback, rules plan, prompts
├── pipeline/     # One Lambda handler per pipeline step + contract checks
├── api/          # HTTP API handler (read routes, /summary, /run)
├── web/          # React + Vite + TypeScript + MapLibre dashboard
├── infra/        # CloudFormation/SAM template, Lambda build targets
├── scripts/      # deploy, deploy_web, smoke_test, local_api, cost_check, teardown
├── data/live/    # Real snapshots captured from live sources (source + time stamped)
└── docs/         # Architecture, data contracts, API list, member tasks, reports, audit
```

## 🚀 Getting started

### Prerequisites
- Python 3.12 deployment target; installed Python 3.14.3 used for this local milestone. Node.js 20.19+ on the 20.x line, or 22.12+ (Vite requirement; local Node 24.16.0).
- Free API keys: [NASA FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/) and [OpenAQ](https://openaq.org/); optionally [data.gov.in](https://data.gov.in/)
- For deploying: AWS CLI v2, SAM CLI and an AWS account

### 1. Set up

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env    # then fill in FIRMS_MAP_KEY, OPENAQ_API_KEY
```

### 2. Run the dashboard on the real snapshots

```bash
./start.sh              # installs web deps if needed, serves http://127.0.0.1:5173
```

With `VITE_API_BASE_URL` empty, the UI reads preserved snapshots in `web/public/data/`, explicitly labelled stale and legacy where applicable. Verify separate metadata from the repository root with `python -m scripts.publish_model_provenance --check`. Set `VITE_API_BASE_URL` in `web/.env.local` to use an API instead. On Windows, the read-only demo can be started with `cd web; npm.cmd ci; npm.cmd run dev`; it requires no AWS credentials and does not regenerate snapshots.

### 3. Refresh the data and run the pipeline locally

The following refresh commands intentionally replace local working outputs and require live inputs. Keep the preserved submission captures separate; for a read-only demo use the dashboard commands above. A 48-hour plume run requires wind coverage for the entire requested path and time window:

```bash
python -m ingest.firms.handler          # needs FIRMS_MAP_KEY
python -m ingest.aqi.handler            # needs OPENAQ_API_KEY
python -m ingest.weather.handler        # Open-Meteo, no key
python -m models.source_detection.cluster --live --provenance-output data/live/sources.provenance.json
python -m models.plume.corridor --live --provenance-output data/live/corridor.provenance.json
python -m models.exposure.rank_sites --live
python -m agent.agent --live            # AGENT_MODEL_PROVIDER=bedrock to use Bedrock
```

Sites (`ingest.sites.handler`) and population (`ingest.population.handler`, a ~1 GB WorldPop download) are one-time pulls; their snapshots are already in `data/live/`.

### 4. Serve the API locally

```bash
python3 scripts/local_api.py            # http://localhost:8000, same handler as the Lambda
```

### 5. Test

```bash
.venv/bin/python -m pytest              # ingest, models, agent, pipeline, api
cd web && npm run build && npm run lint
```

### 6. Deploy to AWS

Store the keys in Secrets Manager as `aeris/FIRMS_MAP_KEY`, `aeris/OPENAQ_API_KEY` and `aeris/DATA_GOV_IN_KEY`, then:

```bash
ALERT_EMAIL=you@example.com scripts/deploy.sh   # stack, Lambdas, pipeline, API, CloudFront
scripts/deploy_web.sh                           # build the UI against the API and upload it
python3 scripts/smoke_test.py                   # run the pipeline, validate every route
scripts/cost_check.sh                           # idle-billable resources + month-to-date spend
scripts/teardown.sh                             # delete everything when done
```

Confirm the two subscription emails (budget and alarms) after the first deploy.

## 🔌 API

| Route | Returns |
|-------|---------|
| `GET /health` | Status and last run time |
| `GET /summary` | Headline numbers: sources, fires, ranked sites, earliest ETA, exposed population, plan summary |
| `GET /sources` · `/corridor` · `/sites` · `/actions` · `/fires` · `/wind` | The matching contract file |
| `GET /ranked-sites?limit=&type=school\|hospital` | Ranked sites (alias `/sites/ranked`) |
| `GET /stations` | Air-quality stations (alias `/aqi`) |
| `POST /run` · `GET /run/{run_id}` | Start or poll a pipeline run (one at a time) |

Every data response carries `generated_at`, `age_seconds` and `stale`. Formats: [`docs/data-contracts.md`](docs/data-contracts.md). Details: [`docs/api-list.md`](docs/api-list.md).

## 📡 Data sources

| Data | Source | Refresh |
|------|--------|---------|
| Active fires | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) VIIRS (SNPP, NOAA-20, NOAA-21), near real time | 15 min |
| Ground air quality | [OpenAQ v3](https://openaq.org/) (primary), CPCB via [data.gov.in](https://data.gov.in/) (backup) | 30 min |
| Wind and boundary-layer height | [Open-Meteo](https://open-meteo.com/) GFS, 0.25° grid, 48 h | 60 min |
| Schools and hospitals | [OpenStreetMap](https://www.openstreetmap.org/) via Overpass (3,132 sites in Delhi NCR) | One-time |
| Population | [WorldPop](https://www.worldpop.org/) 2020, 1 km (DOI 10.5258/SOTON/WP00647) | One-time |

Region of interest: Punjab, Haryana and Delhi NCR (bbox `73.5, 28.0, 77.5, 32.5`).

## ⚠️ Known limitations

- **The corridor is a fast heuristic, not a chemical transport model** (not WRF-Chem). Its spread, decay and scale constants are not yet calibrated against station history, and the exposed-population range is wide
- **The calibration engine is ready, but historical calibration is blocked.** Valid event histories, background measurements and held-out observations are still needed; the current snapshots do not establish historical forecast accuracy. See [`models/RELEASE_AUDIT.json`](models/RELEASE_AUDIT.json)
- **The optional ML surrogate is implemented locally and trained on `BASELINE_SIMULATED` physics outputs.** It has no real-observation validation and is not used by the production corridor pipeline, which remains physics-based. See [`models/training/README.md`](models/training/README.md)
- **The Bedrock agent is wired up; current live model access is unverified.** It tries Claude, then Amazon Nova, then a rules plan built from the same real data. Local tests stub AWS calls; they verify fallback behavior, not current Bedrock access or the factual grounding of live model prose. The rules plan is advisory and does not issue legal or medical orders. `actions.json` always names its `generator`
- **Dashboard scientific limits:** the observed PM2.5 layer shows occupied station cells without interpolation. Assumed intervention multipliers are explicitly illustrative and have no validated effect. Station AQI may be a PM2.5 sub-index with an unverified averaging period. Archived recommendation text is historical and requires review, not execution. See [current readiness evidence](docs/submission/READINESS.md).
- Not yet used: a SageMaker endpoint for the optional surrogate, and Sentinel-5P satellite data

## 🗺️ Roadmap

- Calibrate the corridor against OpenAQ/CPCB history, and publish the parameters and error
- Evaluate and deploy the optional ML surrogate on SageMaker and serve it from a serverless endpoint
- Confirm smoke with Sentinel-5P (NO₂, CO, aerosols), not only fires
- Hindi summaries and SMS/WhatsApp alerts to school and hospital contacts
- A history view: past forecasts against what stations measured

## 📚 Docs

| Doc | What's in it |
|-----|--------------|
| [`docs/data-contracts.md`](docs/data-contracts.md) | JSON formats every component codes against |
| [`docs/api-list.md`](docs/api-list.md) | External APIs, AERIS routes, AWS calls |
| [`docs/work-split.md`](docs/work-split.md) | Who owns what; per-member tasks in [`docs/members/`](docs/members/) |
| [`docs/aditya's_work/`](docs/aditya's_work/) | AWS build plan and completion report for each phase |
| [`docs/audit/`](docs/audit/) | Project audit: work left, data authenticity, running cost, improvements |
| [`models/README.md`](models/README.md) | Source detection, physics corridor, calibration readiness, optional ML surrogate and modelling evidence |
| [`docs/demo-script.md`](docs/demo-script.md) | 3-minute demo video script |
| [`docs/submission/`](docs/submission/) | Submission checklist and AWS Builder Center blog draft |

## 👥 Team

| Member | Role |
|--------|------|
| **Aditya** ([@aditbytes](https://github.com/aditbytes)) | All AWS infrastructure, pipeline, API, hosting, monitoring, integration |
| **Meenal Sinha** ([@MeenalSinha](https://github.com/MeenalSinha)) | Data ingestion and exposure ranking |
| **Pritam Singh** ([@pritamsingh019](https://github.com/pritamsingh019)) | Source detection and plume models |
| **Saba Saeed** ([@SabaSaiid](https://github.com/SabaSaiid)) | Action agent, map dashboard and demo |

## 🏆 Hackathon

Built for **Environmental Hacks — Bharat Builds Tour** (WeMakeDevs × AWS), **Track 01: Air**.
