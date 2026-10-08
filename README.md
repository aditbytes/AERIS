<div align="center">

<img src="docs/assets/logo.svg" alt="AERIS" width="520"/>

**Source → Plume → Exposure → Action**<br>
*An engine that groups satellite fire detections, models smoke transport, and supports response planning.*

![Track](https://img.shields.io/badge/Track-Air-1e88e5?style=flat-square)
![Hackathon](https://img.shields.io/badge/Environmental%20Hacks-Bharat%20Builds%20Tour-ed7100?style=flat-square)
![AWS](https://img.shields.io/badge/AWS-SageMaker%20%C2%B7%20Lambda%20%C2%B7%20S3-232f3e?style=flat-square&logo=amazonaws)
![Strands](https://img.shields.io/badge/Strands-Agents-00838f?style=flat-square)
![Status](https://img.shields.io/badge/status-hackathon%20build-orange?style=flat-square)

[English](README.md) · [Architecture](docs/aeris_architecture.drawio)

</div>

## ⚡ Overview

**AERIS** (*Air Exposure & Risk Intelligence System*) combines satellite fire detections, ground air-quality readings, wind and weather, and the locations of schools and hospitals. It groups fires into **candidate source clusters**, estimates smoke transport with a simplified physics baseline, and connects modelled corridors to sites and response planning on a map. Source labels and risk scores are uncalibrated heuristics; the implementation does not establish causal attribution, observed forecast accuracy, or guaranteed exposure/arrival times. Current modelling evidence and limits are documented in [`models/README.md`](models/README.md).

```
Source Detection  →  Plume Prediction  →  Human Exposure  →  Intervention
   (who/where)        (where it moves)      (who gets hit)     (what to do)
```

> With sufficiently covered real inputs, AERIS produces candidate fire-source clusters, modelled corridors, site rankings and a response plan. Missing input or wind coverage produces an explicit error; unavailable weather is never invented.

## 🎬 Example scenario

> This is a proposed scenario, not measured performance or stored data. Production inputs are real captured feeds. Numerical tests and optional ML training use separately labelled mathematical/`BASELINE_SIMULATED` scenarios; these are never published as live observations or historical calibration.

| | |
|---|---|
| 🔥 | Detects a **stubble-burning cluster** upwind of Delhi |
| 🌫️ | Predicts the **plume will reach Delhi in ~2 hours** |
| 👥 | Identifies **~1.2M exposed people** |
| 🚨 | Recommends **which schools and hospitals to protect first**, and how |

## 🔭 Our Vision

Air pollution is treated as a reporting problem: sensors tell us it's bad *after* people are already breathing it. AERIS treats it as a **decision problem** — trace the source, forecast the plume, quantify exposure, and act early on the people who are most vulnerable. Small problem, solved end to end, beats a big one solved vaguely.

## 🧩 MVP

1. **Detect source** — NASA FIRMS fire/satellite data + air-quality data
2. **Forecast risk corridor** — wind + source location + historical observations
3. **Identify vulnerable locations** — schools and hospitals inside the corridor, ranked by exposure and ETA
4. **Generate action recommendations** — a Strands Agent turns the ranking into a prioritised plan
5. **Show everything on one map** — source → corridor → sites → actions

## 🏗️ Architecture

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

**AWS:** SageMaker · S3 · Lambda · EventBridge · Strands Agents SDK · API Gateway · CloudFront · Bedrock — region `ap-south-1`.

The full eight-layer target design (ingestion → lakehouse → AI engine → agent swarm → delivery → MLOps → security) is in [`docs/aeris_architecture.drawio`](docs/aeris_architecture.drawio). The MVP implements a thin vertical slice of it.

## 📁 Repository layout

```
AERIS/
├── docs/        # architecture diagram, assets
├── ingest/      # Lambda ingestors (FIRMS, AQI, weather, sites)   (planned)
├── models/      # source detection + plume corridor               (planned)
├── agent/       # Strands agent: action recommendations           (planned)
├── api/         # API Gateway / Lambda handlers                   (planned)
├── web/         # map UI                                          (planned)
└── infra/       # IaC (SAM/CDK)                                   (planned)
```

## 🚀 Getting Started

_Coming soon — local run (SAM CLI / LocalStack) and AWS deploy instructions._

## 📡 Data sources

- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — VIIRS/MODIS active fire
- Sentinel-5P TROPOMI — NO₂ / CO / SO₂ / AOD
- CPCB CAAQMS, SAFAR, [OpenAQ](https://openaq.org/) — ground AQI
- IMD, GFS, ERA5 — wind, boundary-layer height, rain
- OpenStreetMap, UDISE, NHA — schools and hospitals
- WorldPop / GHSL — population

## 🏆 Hackathon

Built for **Environmental Hacks — Bharat Builds Tour** (WeMakeDevs × AWS), **Track 01: Air**.

## 👤 Author

[@aditbytes](https://github.com/aditbytes)
