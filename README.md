# AERIS 🌍

**AI that finds where pollution is coming from, predicts where it will move, and tells authorities what to do.**

> Hackathon: **Environmental Hacks — Bharat Builds Tour (WeMakeDevs × AWS)** · Track 01: **Air**

Most AQI projects stop at *"it's bad today"*. AERIS answers the harder questions:

```
Source Detection  →  Pollution Plume Prediction  →  Human Exposure  →  Intervention
   (who/where)            (where will it go)          (who gets hit)     (what to do)
```

## Demo scenario

1. 🔥 Detects a stubble-burning cluster in Punjab/Haryana
2. 🌫️ Predicts the plume will reach Delhi in ~2 hours
3. 👥 Estimates ~1.2M exposed people
4. 🚨 Recommends which schools and hospitals to protect first, with concrete actions

## MVP scope

| # | Capability | How |
|---|-----------|-----|
| 1 | **Detect source** | NASA FIRMS (VIIRS/MODIS) active fire + satellite/CPCB/OpenAQ air-quality data |
| 2 | **Forecast risk corridor** | Wind (IMD / GFS / ERA5) + source location + historical observations → plume corridor |
| 3 | **Identify vulnerable locations** | Schools + hospitals (OSM, UDISE, NHA) intersected with the corridor, ranked by exposure and ETA |
| 4 | **Generate action recommendations** | Strands Agent turns the ranked sites into a prioritised action plan |
| 5 | **Show everything on one map** | Source → corridor → sites → actions in a single map view |

The full target design (multi-model SageMaker stack, agent swarm, MLOps, security) is in [`docs/aeris_architecture.drawio`](docs/aeris_architecture.drawio). The MVP implements a thin vertical slice of it.

## Architecture (MVP slice)

```
 FIRMS / OpenAQ / CPCB / weather            EventBridge (schedule)
            │                                       │
            └──────────────► Lambda ingestors ◄─────┘
                                  │
                                 S3  (bronze → gold)
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
 Source detection         Plume corridor forecast     Vulnerable-site ranking
 (fire clusters)     (wind advection + SageMaker)   (schools/hospitals ∩ corridor)
        └─────────────────────────┼──────────────────────────┘
                                  ▼
                       Strands Agent (action plan)
                                  │
                       API Gateway / Lambda
                                  │
                         Map UI (CloudFront + S3)
```

### AWS services

SageMaker · S3 · Lambda · EventBridge · Strands Agents SDK · API Gateway · CloudFront · (Bedrock for the agent's LLM)

Deployed in `ap-south-1`. The hackathon requires at least one AWS open-source tool **or** deployment on AWS; AERIS uses both.

### Full reference architecture (target)

Eight layers: data sources → ingestion → lakehouse/feature stores → AI engine (source detection, plume prediction, exposure, intervention optimiser) → Strands agent swarm → delivery → MLOps → security. See the diagram in `docs/`.

## Repository layout

```
AERIS/
├── docs/                 # architecture diagram, design notes
├── ingest/               # Lambda ingestors (FIRMS, AQI, weather, sites)
├── models/               # source detection + plume corridor
├── agent/                # Strands agent: action recommendations
├── api/                  # API Gateway / Lambda handlers
├── web/                  # map UI
└── infra/                # IaC (SAM/CDK)
```

> Only `docs/` exists so far; the other folders are created as each piece lands.

## Getting started

_Coming soon — local run (SAM CLI / LocalStack) and AWS deploy instructions._

## Data sources

- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — VIIRS/MODIS active fire
- Sentinel-5P TROPOMI — NO₂ / CO / SO₂ / AOD
- CPCB CAAQMS, SAFAR, [OpenAQ](https://openaq.org/) — ground AQI
- IMD, GFS, ERA5 — wind, boundary-layer height, rain
- OpenStreetMap, UDISE, NHA — schools and hospitals
- WorldPop / GHSL — population

## Status

🚧 Hackathon build in progress.

## Team

Built by [@aditbytes](https://github.com/aditbytes).
