# AERIS — Work Split

> ⚠️ **No demo data.** AERIS uses **only real data** from live sources. Do not create, hand-write, mock or hard-code sample, demo, placeholder or fabricated data — not in code, not in the UI, not in tests, and not as a "fallback". If a live source is unavailable, return an error and show an error state. The only offline files allowed are **real snapshots** that the fetchers captured from live sources into `data/live/` (each stamped with its source and fetch time). Tests may use small captured real API responses, labelled as such.

Nothing is implemented yet: only the README, architecture diagram and these docs exist. All of the work below is still open.

## Principle

**Aditya owns every piece of AWS work.** The other three build plain, locally-runnable code with no AWS account needed. Aditya wraps, deploys and wires it on AWS.

| Who | Role |
|-----|------|
| **Aditya** | All AWS: accounts, IAM, S3, Lambda, EventBridge, API Gateway, SageMaker, Bedrock, CloudFront, IaC, cost control, integration |
| **Meenal Sinha** | Data ingestion + exposure ranking |
| **Pritam Singh** | Source detection + plume corridor models |
| **Saba Saeed** | Strands action agent + map UI + demo |

Detailed per-person task files:
[Aditya](members/aditya-aws.md) · [Meenal](members/meenal-data-exposure.md) · [Pritam](members/pritam-models.md) · [Saba](members/saba-agent-ui.md) · [Data contracts](data-contracts.md) · [API list](api-list.md)

---

## Aditya — all AWS work

- [ ] AWS account, student verification (Builder Center), free-tier credits, budget alarm
- [ ] IAM roles / least-privilege policies, Secrets Manager (FIRMS key, OpenAQ key)
- [ ] S3 buckets (`bronze/`, `gold/`, web hosting), lifecycle rules
- [ ] Deploy Meenal's ingestors as **Lambda**; **EventBridge** schedules
- [ ] `storage` layer: swap local files → S3 (same interface the team codes against)
- [ ] **SageMaker**: training job + endpoint for Pritam's plume model (or Lambda fallback)
- [ ] **Bedrock** model access; host the Strands agent (Lambda / AgentCore)
- [ ] **API Gateway + Lambda** endpoints: `/sources`, `/corridor`, `/sites`, `/actions`
- [ ] **CloudFront + S3** hosting for Saba's web build
- [ ] IaC (SAM/CDK) in `infra/`, `scripts/deploy.sh`, region `ap-south-1`
- [ ] CloudWatch logs/alarms; end-to-end smoke test on AWS
- [ ] Publish blog on AWS Builder Center, link it in the submission
- [ ] Final submission (deployed URL, repo, demo video)

## Meenal Sinha — data + exposure (`ingest/`, `data/`, `models/exposure/`)

- [ ] NASA FIRMS active-fire fetcher → `fires.json`
- [ ] CPCB/OpenAQ air-quality fetcher → `aqi.json`
- [ ] Weather fetcher (wind speed/direction; GFS/ERA5/Open-Meteo) → `wind.json`
- [ ] Schools + hospitals loader (OSM Overpass / UDISE / NHA) → `sites.geojson`
- [ ] Population layer (WorldPop/GHSL) for exposed-people estimate
- [ ] `data/live/` real snapshots captured from the live sources, so everyone can work offline
- [ ] **Exposure ranking**: intersect corridor with sites, score by exposure, ETA, vulnerability → `ranked_sites.json`
- [ ] Exposed-population estimate (the "1.2M people" number)
- [ ] Unit tests

Each fetcher exposes `lambda_handler(event, context)` and takes its output writer as a parameter so Aditya can plug in S3.

## Pritam Singh — models (`models/source_detection/`, `models/plume/`, `models/training/`)

- [ ] Cluster fire detections into **sources** (location, intensity, time) → `sources.json`
- [ ] Wind-advection baseline: source + wind → **risk corridor** polygon with hourly ETA → `corridor.geojson`
- [ ] Use historical AQI/wind to calibrate the corridor (spread, decay)
- [ ] Optional ML model (e.g. gradient boosting / small neural net) trained on history; packaged as a SageMaker-compatible script (`train.py`, `inference.py`) for Aditya to deploy
- [ ] Evaluation notebook: forecast vs observed AQI
- [ ] Unit tests

Pure Python with a clear `predict_corridor(sources, wind) -> GeoJSON` function, runnable locally.

## Saba Saeed — agent + UI + demo (`agent/`, `web/`)

- [ ] **Strands Agent**: system prompt, tools (`query_plume`, `rank_sites`, `get_sources`) reading local JSON, output `actions.json` (prioritised actions per school/hospital, with reasons)
- [ ] Model provider configurable by env var (Aditya sets Bedrock)
- [ ] **Map UI** (React/Vite + MapLibre or Leaflet): layers for source → corridor → sites → actions, side panel with the plan, ETA / exposed-people counters
- [ ] UI reads from a configurable `API_BASE_URL`; falls back to the real snapshots in `data/live/`, never to invented data
- [ ] 3-minute **demo video** script + recording (Aditya adds the AWS section)
- [ ] Unit tests / basic UI check

---

## Interface contracts

Everyone codes against these files. Schemas go in `api/schemas/`; the first PR (Meenal) adds real snapshots in `data/live/` for all of them.

```
Meenal ─ fires / aqi / wind / sites ─► Pritam ─ sources + corridor ─► Meenal (exposure) ─ ranked_sites ─► Saba (agent) ─ actions ─► Saba (UI)
                                                                                                          ▲
                                                Aditya: runs all of the above on AWS and serves it via the API
```

## Suggested order

1. **Day 1:** agree the schemas; Meenal publishes real snapshots in `data/live/`; Aditya sets up the AWS account, S3 and IaC skeleton
2. **Day 2:** Pritam corridor baseline; Meenal exposure ranking; Saba UI on real snapshot data and agent prototype; Aditya deploys ingestors + EventBridge
3. **Day 3:** Aditya deploys models, agent and API; Saba points the UI at the live API
4. **Day 4:** end-to-end run, demo video, blog, submission

## Working agreement

- Branch per person (`meenal-data`, `pritam-models`, `saba-agent-ui`); open PRs into `main`
- Never commit secrets, API keys or AWS credentials (`.env` is gitignored; use `.env.example`)
- Change a shared schema only via PR, and tell the downstream owner
- Keep one end-to-end demo path working at all times: a working feature beats five that almost work
