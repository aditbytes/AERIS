# Phase 3 — Completion Report

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Date: 2026-10-08 · Branch: `aditya_8oct_phase2_close` · Stack: `aeris-foundation`, region `ap-south-1`

## Status: code, IaC and local verification done — **not yet deployed**

Everything below is committed, tested and built (`sam validate --lint` and `sam build` both pass). The deploy itself was **not run**: a permission check stopped the agent from applying CloudFormation changes. Run the two commands in "Deploy" below to go live.

| Exit criterion | Status |
|----------------|--------|
| A real FIRMS detection gives a corridor file that validates against the contract | Done locally on real snapshots; on AWS after deploy |
| SageMaker endpoint returns the baseline schema | **Skipped** — Pritam delivered no ML model (`models/training/train.py` does not exist). The Lambda baseline is the production path, as doc 3.2 allows |
| Ranking updates automatically whenever a new corridor lands | Done — the Step Functions run order is publish → detect → corridor → rank → agent |
| End-to-end run gives an action plan grounded only in real data | Done — Strands agent on Bedrock, with validation; rules plan as fallback |
| All API routes return contract-valid JSON | Done locally (16 API tests) |
| CloudFront URL loads the map with live API data | Template and `scripts/deploy_web.sh` ready; live after deploy |

## Deploy (Aditya)

```bash
ALERT_EMAIL=adit87ya54@gmail.com scripts/deploy.sh
```

```bash
scripts/deploy_web.sh
```

`deploy.sh` prints `ApiUrl`, `WebUrl` and `PipelineStateMachineArn`. Start the first run without waiting for the 30-minute schedule:

```bash
curl -s -X POST "$(aws cloudformation describe-stacks --stack-name aeris-foundation --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)/run"
```

## What was done

### 1. Pipeline Lambdas — `pipeline/steps.py`
One module, one handler per step. Each step reads real inputs through `storage` and writes one contract file to `gold/`.

| Step | Lambda | Reads | Writes | Memory / timeout |
|------|--------|-------|--------|------------------|
| publish | `PublishFunction` | `bronze/{fires,aqi,wind}/latest`, `reference/sites/latest` (falls back to `bronze/sites/latest`) | `gold/fires.json`, `aqi.json`, `wind.json`, `sites.geojson` | 512 MB / 120 s |
| detect | `DetectFunction` | `gold/fires.json` | `gold/sources.json` | 512 MB / 120 s |
| corridor | `CorridorFunction` | `gold/sources.json`, `gold/wind.json` | `gold/corridor.geojson` | 1024 MB / 180 s |
| rank | `RankFunction` | corridor, sites, `reference/population/latest` | `gold/ranked_sites.json` | 2048 MB / 300 s |
| agent | `AgentFunction` | sources, corridor, ranked_sites, sites | `gold/actions.json` | 1024 MB / 300 s |

- A zip package was enough (no container image needed): pipeline functions are 83 MB unpacked (numpy, shapely, pydantic) and the agent is 94 MB. Both are under the 250 MB limit
- An empty or missing input **raises**, so the previous `gold/` file is never overwritten with nothing
- **ModelRole** may write every `gold/` file *except* `actions.json`. Only **AgentRole** can write `actions.json`

### 2. Step Functions — `PipelineStateMachine`
- Standard workflow named `aeris-foundation-pipeline`, triggered by EventBridge Scheduler every 30 min and by `POST /run`
- Each task retries Lambda service errors three times with backoff. Any other error goes to a `Fail` state, and `gold/` keeps the last real result

### 3. Agent — Strands Agents SDK on Amazon Bedrock (`agent/bedrock_agent.py`)
- `Agent(model=BedrockModel(model_id=AGENT_MODEL_ID), tools=[…])` wraps Saba's five tools: `get_sources`, `query_corridor`, `get_ranked_sites`, `get_site` and `get_exposed_population`. It returns a structured plan in the `actions.json` shape
- **Validation:** every `site_id` must be a real ranked site, and the summary must not be empty. A plan that fails is rejected
- `agent.run()` uses Bedrock when `AGENT_MODEL_PROVIDER=bedrock`. If Bedrock or validation fails, it falls back to Saba's rules-based plan, built from the same real data. `actions.json` gains a `generator` field (`bedrock:<model>` or `rules`), so you can always tell which one ran
- The model ID is a stack parameter, `AgentModelId` (default `anthropic.claude-opus-5-5`). Override it with `AGENT_MODEL_ID=… scripts/deploy.sh`
- AgentRole may call `bedrock:InvokeModel` and `InvokeModelWithResponseStream`, on foundation models and inference profiles only

### 4. API — `api/handlers/app.py` behind an HTTP API
| Route | Reads |
|-------|-------|
| `GET /health` | last run time from `actions.json` |
| `GET /sources`, `/corridor`, `/sites`, `/actions`, `/fires`, `/wind` | the matching `gold/` file |
| `GET /ranked-sites` and `/sites/ranked` (alias used by the UI) | `ranked_sites.json`, filtered by `?limit=` and `?type=school\|hospital` |
| `GET /stations` and `/aqi` (alias used by the UI) | `aqi.json` |
| `GET /summary` | headline numbers from sources, ranked_sites and actions |
| `POST /run`, `GET /run/{run_id}` | start or poll the state machine. Only one run at a time (`409` while one is running) |

- Every data response carries `stale` and `age_seconds` (see Phase 4). A missing file returns `404 no_data`, never a default
- **CORS:** allowed only for the CloudFront origin and `http://localhost:5173`
- **Throttling:** 20 req/s with bursts of 50 by default; `POST /run` is limited to 1 req/s
- `Cache-Control: max-age=60`

### 5. Website — CloudFront in front of a private S3 bucket
- Origin access control (signed with sigv4). The bucket policy allows only this distribution. HTTPS redirect, compression, HTTP/2 and HTTP/3
- `PriceClass_200`, which includes India edge locations. Single-page-app fallback to `index.html`
- `scripts/deploy_web.sh` builds `web/` with `VITE_API_BASE_URL` set to the API URL. It uploads hashed assets with a one-year cache, `index.html` with `no-cache` and `data/` with 5 minutes, then invalidates `/*`
- Basemap: the UI already uses free tiles, so Amazon Location Service is not needed

## Review fixes made during integration (teammates please note)
- **Pritam — corridor direction (important):** `find_nearest_wind` used `abs(u)` and `-abs(v)`, which forced every plume south-east toward Delhi whatever the real wind did. It also invented a 2.0/−1.5 m/s breeze when `wind.json` was empty, and started at the first forecast hour, which is 24 h in the past. It now uses the real wind sign, the forecast hour that matches each time step, and raises if no wind exists. With the real 7 Oct wind, plumes drift 50–80 km, mostly west; they no longer all head to Delhi. The derived snapshots in `data/live/` and `web/public/data/` were regenerated from the same real inputs
- **Pritam — `corridor.geojson`** now carries `generated_at`, `forecast_start` and `wind_generated_at`. The S3 storage layer refuses objects without `generated_at`
- **Saba — invented numbers in the UI removed:** 570,938 people, 428,203 / 713,672 CI, 571K, AQI 179/180/200, 494 sites, 215 fires, 676 MW, 10 sources, 8 actions, 18 km/h and a 0.5 h ETA were all hard-coded fallbacks. Each now shows "—" or an empty state. The 35% / 55% "what if" multipliers stay, because they are labelled as assumed scenarios
- **Saba — agent:** "Top 50 schools" was a fixed number; it now cites the real ranked-school count

## What changed for everyone else
- New top-level package `pipeline/` (Aditya). Run the whole chain locally on real snapshots: `.venv/bin/python -m pytest pipeline`
- Agent output has a new field, `generator`. The web zod schema ignores unknown keys, so nothing breaks
- Full test suite: **153 passed** (was 129)

## Still manual (Aditya)
- [ ] Run `scripts/deploy.sh`, then `scripts/deploy_web.sh` (above)
- [ ] **Bedrock model access:** in the Bedrock console (ap-south-1) → Model access, enable the Anthropic model and submit the one-time use-case form. Then check which ID works there:
  ```bash
  aws bedrock list-inference-profiles --region ap-south-1 --query "inferenceProfileSummaries[?contains(inferenceProfileId,'anthropic')].inferenceProfileId"
  ```
  If the default `anthropic.claude-opus-5-5` is not invocable on demand in ap-south-1, redeploy with an inference-profile ID from that list: `AGENT_MODEL_ID=<id> ALERT_EMAIL=… scripts/deploy.sh`. Until then the plan is built by the rules generator, and `generator: "rules"` says so
- [ ] Invoke `SitesFunction` once so `reference/sites/` exists (Phase 2 report). Until then, publish uses `bronze/sites/latest`, which expires on 2026-10-22
- [ ] Optional: Bedrock Guardrails (not added; the plan is already restricted to validated site IDs)
