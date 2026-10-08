# Phase 2 — Completion Report

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Date: 2026-10-08 · PR: [#5](https://github.com/aditbytes/AERIS/pull/5) (merged) plus the `aditya_8oct_phases_2_to_4` follow-up · Stack: `aeris-foundation`, region `ap-south-1`

## Status: done — scheduled real data has been landing in `bronze/` all day

| Exit criterion | Status |
|----------------|--------|
| FIRMS data from a scheduled run is in `bronze/` with no manual action | Done — FIRMS has run every 15 min since 03:37Z |
| Each fetcher, invoked by hand, writes a real source-stamped object | Done for FIRMS, AQI, weather and sites |
| A day of schedules gives continuous objects with no gaps | Done — counts match the cadence (see below) |
| Rotating a secret needs no code change or redeploy | Done — keys are read from Secrets Manager at cold start |
| A forced failure lands in the DLQ | Done — a real failure on the first deploy put 2 messages in the DLQ |
| Step Functions pipeline (optional) | Moved to Phase 3, where the detect/corridor/rank/agent Lambdas now exist |

## What was done

### 1. Fetcher Lambdas (`infra/template.yaml`)
Python 3.12 on arm64, built with a SAM makefile (`infra/lambda/Makefile`). `scripts/deploy.sh` copies `ingest/` (without tests) next to the Makefile, then runs `sam build` and `sam deploy`.

| Function | Handler | Memory | Timeout | Trigger |
|----------|---------|--------|---------|---------|
| `FirmsFunction` | `ingest.firms.handler` | 256 MB | 120 s | `rate(15 minutes)`, input `{"day_range": 2}` |
| `AqiFunction` | `ingest.aqi.handler` | 256 MB | 300 s | `rate(30 minutes)` |
| `WeatherFunction` | `ingest.weather.handler` | 512 MB | 300 s | `rate(60 minutes)` |
| `SitesFunction` | `ingest.sites.handler` | 256 MB | 300 s | manual (one-time) |
| Population | `scripts/load_reference.py population` | — | — | manual (one-time, see below) |

- Each run writes `bronze/<source>/<UTC stamp>.json` and refreshes `bronze/<source>/latest.json` (`storage.write_bronze`)
- An empty or failed fetch **raises**, so nothing is written and the previous `latest` stays as it was
- FIRMS uses a 2-day window. With a 1-day window, `latest` came back empty right after the UTC date changed, before that day's first satellite pass

### 2. Schedules — evidence (bucket listing at 14:37Z on 2026-10-08)

| Source | Cadence | Objects in `bronze/` | Expected for ~11 h |
|--------|---------|----------------------|--------------------|
| fires | 15 min | 48 | ~44–48 |
| aqi | 30 min | 27 | ~22–27 |
| wind | 60 min | 13 | ~11–13 |

Every fire file is about 85–98 KB (227+ real VIIRS detections), and every wind file is about 3 MB.

### 3. Secrets
- `aeris/FIRMS_MAP_KEY`, `aeris/OPENAQ_API_KEY` and `aeris/DATA_GOV_IN_KEY` are stored in Secrets Manager
- **Per-function roles:** FIRMS can read only its own key; AQI can read only the OpenAQ and data.gov.in keys; weather and sites can read no secrets
- `ingest/common/secrets.py` reads each key once per cold start and caches it in module scope (`lru_cache`). Locally it uses `.env` values instead
- No key is in the template or in env vars. Upstream error messages are scrubbed of keys before they are logged (`ingest/common/http.py`)

### 4. Failure visibility
- One SQS DLQ (`FetchDlq`, 14-day retention) on every fetcher, with `MaximumRetryAttempts: 1`
- **Proof:** on the first deploy, before the S3 backend was switched on, FIRMS failed with `Read-only file system: '/var/task/data'`. Both async attempts landed in the DLQ (2 messages, kept as evidence)
- The DLQ depth alarm is part of Phase 4 observability

### 5. Follow-up in this phase: one-time datasets now live in `reference/`
`bronze/` expires after 14 days, so the one-time sites and population pulls would vanish in the middle of judging.

- New `storage.write_reference()` writes to `reference/<name>/`, a prefix with **no lifecycle rule**
- `SitesFunction` now writes `reference/sites/`. Its role may write `reference/*`
- Population needs rasterio and a ~1 GB WorldPop GeoTIFF, which is too heavy for Lambda. `scripts/load_reference.py population` uploads the real WorldPop 2020 snapshot from `data/live/` unchanged. It refuses a file that is empty or has no `source`
- **Done:** `reference/population/latest.json` holds 222,792 cells (WorldPop 2020, DOI 10.5258/SOTON/WP00647)

## Still manual (Aditya)
- [ ] Deploy the follow-up: `ALERT_EMAIL=adit87ya54@gmail.com scripts/deploy.sh` (the agent's AWS deploy was blocked by a permission check, so it was not run)
- [ ] Then run the one-time sites pull into `reference/`:
  ```bash
  aws lambda invoke --function-name $(aws cloudformation describe-stack-resource --stack-name aeris-foundation --logical-resource-id SitesFunction --query StackResourceDetail.PhysicalResourceId --output text) /dev/stdout
  ```
- [ ] Phase 1 leftovers still open: confirm the budget email, turn on root MFA and delete the root key

## What changed for everyone else
- Nothing for local work: teammates still use `data/live/` through `storage`
- Pipeline code on AWS reads sites and population from `reference/<name>/latest`, and live feeds from `bronze/<name>/latest`
