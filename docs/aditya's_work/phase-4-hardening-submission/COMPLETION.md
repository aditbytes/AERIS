# Phase 4 — Completion Report

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Date: 2026-10-08 · Branch: `aditya_8oct_phase2_close` · Stack: `aeris-foundation`, region `ap-south-1`

## Status: built and verified locally — deploy, recording and submission are manual

| Exit criterion | Status |
|----------------|--------|
| Smoke test green | **Passes against the local API** (same Lambda handler on real snapshots). Run it again on AWS after deploy |
| A forced error triggers an alarm email | Alarms are in the template. After deploy, the 2 messages already in the DLQ will trip `FetchDlqDepthAlarm`, which is a ready-made test. **Confirm the SNS subscription email first** |
| A simulated outage gives a stale banner, not fake output | Done: API `stale` flags, a UI banner, and the hard-coded fallbacks removed. Checked in the browser |
| Integration and PR review | Done for the teammates' code on `main` (fixes listed in the Phase 3 report) |
| Submission sent | Blog draft, demo segment and diagram ready. Posting and submitting are manual |
| Nothing billable left running | `scripts/cost_check.sh` checks this. Teardown waits until judging is over |

## What was done

### 1. Observability (`infra/template.yaml`)
- Every Lambda (all 10) logs to `/aeris/<stack>/<Function>` with **7-day retention**. Lambda's `LoggingConfig` points each function at its own group. The old auto-created `/aws/lambda/aeris-foundation-*` groups never expire, so `teardown.sh` now deletes them
- **SNS topic `AlertTopic`** emails `AlertEmail`. Each alarm sends both ALARM and OK notices:

| Alarm | Fires when |
|-------|-----------|
| `LambdaErrorsAlarm` | Any Lambda in the account and region (all of them are AERIS) errors within 15 min |
| `FetchDlqDepthAlarm` | Any message is visible in the fetch DLQ |
| `PipelineFailedAlarm` | Any Step Functions run fails within 1 h |

### 2. Smoke test — `scripts/smoke_test.py`
- Calls `POST /run` and waits for the run to succeed (if a run is already going, it waits for that one). It then GETs every read route and validates each against `docs/data-contracts.md`, using the new `pipeline/contracts.py`
- Also checks:
  - every `site_id` in `actions` is a real ranked site
  - the `?type=&limit=` filters work
  - `/summary` and `/health` respond
  - CORS allows the CloudFront origin
  - the CloudFront page serves the app
- Exits 1 and lists every mismatch. Stale data is a **warning**, not a failure, because serving stale data is the intended behaviour
- **Verified:** run against `scripts/local_api.py` (the same API handler over HTTP on the real `data/live/` snapshots) together with the built UI. Result: `SMOKE TEST PASSED`, with one correct warning that the AQI snapshot was 20.1 h old
- The contract checks have their own tests: every real snapshot passes, and broken copies fail

### 3. Stale-data handling
- **API:** every data route returns the last real `gold/` result with `generated_at`, `age_seconds` and `stale`. The thresholds are about three missed refreshes:

| Data | Stale after |
|------|-------------|
| fires | 45 min |
| aqi, sources, corridor, ranked_sites, actions | 90 min |
| wind | 3 h |
| sites | never |

  If no real result exists, the route returns `404 no_data`, never a default.
- **Pipeline:** when an upstream source is down, a step raises before writing. `gold/` keeps the last real file, the run fails, and `PipelineFailedAlarm` emails
- **UI:** `web/src/services/api.ts` records freshness *before* zod parsing, because zod drops unknown keys. `StaleBanner` then names the stale feeds, their age and their generation time. Checked in the browser on the real 20-hour-old AQI snapshot
- **Removed invented numbers** from the UI (570,938 people, AQI 179/180/200, 494 sites, …); details in the Phase 3 report

### 4. Integration and review
- Ran each teammate's code locally on the real snapshots first. Full suite: **163 passed** (129 before this work)
- Contract fixes:
  - corridor wind direction, time alignment and timestamps (Pritam)
  - fixed "Top 50" count in the agent (Saba)
  - UI fallbacks (Saba)
- `main` stays deployable: this branch merges with no conflicts, and `sam validate --lint` and `sam build` pass

### 5. Submission deliverables (`docs/submission/`)
- **Blog draft:** [`aws-builder-blog.md`](../../submission/aws-builder-blog.md) covers the problem, the stack and six things that fought back
- **Demo video:** the AWS segment (2:00–2:40) of [`demo-script.md`](../../demo-script.md) now matches the deployed architecture. A warning says every number must be read from the live dashboard, because the script's old figures (494, 571K, …) are out of date
- **Diagram:** new "As deployed" page in `docs/aeris_architecture.drawio`, exported to `docs/assets/aeris-deployed-architecture.png`
- **Checklist:** [`docs/submission/README.md`](../../submission/README.md)

### 6. Teardown and cost
- `scripts/cost_check.sh` (read-only) flags SageMaker endpoints, NAT gateways, running EC2 instances and unattached Elastic IPs, then prints month-to-date cost by service. It exits 1 if it finds anything that bills while idle
- `scripts/teardown.sh` empties both buckets, deletes the stack (CloudFront takes about 15 min) and removes the old log groups
- No SageMaker endpoint was created, because Pritam delivered no ML model, and there is no NAT gateway
- **Idle cost** is mostly per-use: Lambda, Step Functions (48 runs a day) and Bedrock tokens. That is about $0.10–0.50 a day at hackathon traffic, plus a few cents of S3. CloudFront and API Gateway charge per request
- Phase 1 found about $4.23 of older spend, mostly EC2/VPC from before AERIS. Run `cost_check.sh` to confirm none of it is still running

## Manual steps (Aditya), in order
1. [ ] Deploy:
   ```bash
   ALERT_EMAIL=adit87ya54@gmail.com scripts/deploy.sh
   ```
   ```bash
   scripts/deploy_web.sh
   ```
2. [ ] Confirm **two** subscription emails: the AWS Budgets one (still pending from Phase 1) and the new SNS `AlertTopic` one
3. [ ] Enable Bedrock model access and check the model ID (Phase 3 report)
4. [ ] Invoke `SitesFunction` once (Phase 2 report)
5. [ ] Smoke test: `python3 scripts/smoke_test.py`. Expect `SMOKE TEST PASSED` and `agent generator: bedrock:…`
6. [ ] Alarm test: the DLQ already holds 2 messages, so expect a `FetchDlqDepthAlarm` email within about 5 min of deploy. Then purge the queue:
   ```bash
   aws sqs purge-queue --queue-url $(aws cloudformation describe-stacks --stack-name aeris-foundation --query "Stacks[0].Outputs[?OutputKey=='FetchDlqUrl'].OutputValue" --output text)
   ```
7. [ ] Record the video (Saba), publish the blog, submit the form ([checklist](../../submission/README.md))
8. [ ] Check spend: `scripts/cost_check.sh`
9. [ ] After judging (agree the date with the team): `scripts/teardown.sh`, then `scripts/cost_check.sh` again
10. [ ] Security leftovers from Phase 1: root MFA, delete the root access key, MFA on `aeris-admin`

## Why the AWS steps are manual
This session's permission check blocked the agent from running `sam deploy`, and later from read-only AWS CLI calls too. The one AWS write that went through was the population upload to `reference/` (Phase 2). Everything else was built and checked locally: unit tests, `sam validate --lint`, `sam build`, the web build, and a smoke test against a local API.
