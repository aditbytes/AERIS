# What Aditya Built in AERIS

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

**In one line:** you turned four people's local Python and React code into a live, scheduled, monitored AWS system with a public URL, and you wrote the plan, the contracts and the reports that held the team together.

**By the numbers:** 119 commits on `main` across 7 of your own merged PRs, 41 CloudFormation resources, 10 Lambda functions, 1 Step Functions pipeline, 14 API routes, 3 alarms, and a smoke test that passes against the live stack.

| | |
|---|---|
| Live website | https://d2iyso2niquge7.cloudfront.net |
| Live API | https://gw9ljy2d43.execute-api.ap-south-1.amazonaws.com |
| Stack | `aeris-foundation`, region `ap-south-1` |

---

## Day 0 (7 Oct): plan and team setup

- Wrote the README, logo and the 8-layer architecture diagram (`docs/aeris_architecture.drawio`)
- Split the work four ways ([`work-split.md`](../work-split.md)) and wrote a detailed task file for each member ([`docs/members/`](../members/))
- Wrote the shared [`data-contracts.md`](../data-contracts.md) (the JSON formats everyone codes against) and [`api-list.md`](../api-list.md)
- Set the **no-demo-data rule** and put it in every member file
- Scaffolded every folder (`ingest/`, `models/`, `agent/`, `api/`, `web/`, `infra/`, `scripts/`, `data/live/`)
- Wrote your own work as four phases with exit criteria ([`docs/aditya's_work/`](../aditya's_work/))

## Phase 1: foundation

- **One storage interface** (`ingest/common/storage.py`) with a local backend for teammates and an S3 backend for AWS. It refuses objects without `generated_at` and rejects unsafe keys. Teammates never touch `boto3`
- **CloudFormation stack:** a private, encrypted data bucket (`bronze/` expires after 14 days), a web bucket, five least-privilege IAM roles (no `*` actions), and a $50 monthly budget with 50/80/100% email alerts
- `deploy.sh` and `teardown.sh`; AWS keys kept out of git with `.gitignore`
- An IAM admin user instead of root

## Phase 2: ingestion on AWS

- Wrapped Meenal's fetchers as **4 Lambda functions** (FIRMS every 15 min, AQI every 30 min, weather hourly, sites once), built with SAM on arm64
- **Secrets Manager** for the three API keys, with a per-function policy: each function can read only its own key. Keys are cached per cold start and scrubbed from error logs
- Every fetch writes a timestamped object plus `latest` to `bronze/`; an empty fetch raises instead of overwriting good data
- An **SQS dead-letter queue** for failed fetches, proven with a real failure
- Found that one-time datasets would expire with `bronze/`, so added a `reference/` prefix with no expiry. Loaded 3,132 real OSM sites and 222,792 WorldPop population cells there
- Fixed FIRMS returning nothing after midnight UTC by using a 2-day window

## Phase 3: models, agent, API, website

- **Pipeline package** (`pipeline/steps.py`): publish → detect → corridor → rank → agent, each step its own Lambda, each reading real inputs and writing one `gold/` file
- **Step Functions state machine** running every 30 min, with retries; any failure keeps the last real result in `gold/`
- **Strands agent on Amazon Bedrock** (`agent/bedrock_agent.py`) wrapping Saba's five tools. Every `site_id` in the plan is validated against the ranked sites. Falls back Claude → Nova Pro → Nova Lite → Nova Micro → rules plan, with time budgets so the Lambda never times out. `actions.json` records which `generator` wrote it
- **HTTP API** with 14 routes, throttling, CORS limited to the site, `stale` / `age_seconds` on every response, `404 no_data` instead of defaults, and only one `POST /run` at a time
- **CloudFront** in front of a private S3 bucket (origin access control, HTTPS, HTTP/3), plus `deploy_web.sh` to build and upload the UI
- Tested every Bedrock model ID on the account and documented why each failed (payment method for Claude, daily token quota for Nova)

## Phase 4: hardening and submission

- Every Lambda logs to its own group with **7-day retention**; teardown deletes the old log groups
- **SNS email alarms** for Lambda errors, DLQ depth and failed pipeline runs
- **Smoke test** (`scripts/smoke_test.py`): starts a run, waits, checks every route against the contracts, checks filters, CORS and the website. **Passes on the live stack**
- **Contract checks** (`pipeline/contracts.py`) with their own tests
- **Stale-data handling** end to end: API flags, and a UI banner that names the stale feeds
- A local API server (`scripts/local_api.py`) so the UI can run against real snapshots
- A read-only `scripts/cost_check.sh`
- Blog draft, the "as deployed" architecture page and PNG, a submission checklist, and an updated AWS segment of the demo script
- A completion report for each phase

## Integration and review (fixing the team's code)

| Whose code | What you found | What you did |
|------------|----------------|--------------|
| Corridor (written by Saba for Pritam's part) | It forced every plume south-east towards Delhi whatever the real wind did, invented a breeze when wind was missing, and started 24 h in the past | Used the real wind sign and the matching forecast hour; raise when wind is missing; added timestamps; regenerated the snapshots |
| Saba's UI | Hard-coded 570,938 people, AQI 179/180/200, 494 sites, 215 fires, 676 MW, 18 km/h, 0.5 h ETA, and more | Replaced them with "—" or empty states (a few were missed; see [`data-authenticity.md`](data-authenticity.md)) |
| Saba's agent | A fixed "Top 50 schools" | Uses the real ranked-school count |
| Ranking | Crashed when `reference/sites` did not exist yet | Falls back to `bronze/sites` |

The test suite grew from 113 to **169 passing tests**.

## What is still yours to do

See [`work-left.md`](work-left.md#aditya-15-left-about-34-hours-mostly-manual). In short: Bedrock billing, the account checklist, review PR #13, get the fake UI values removed, publish the blog, record the AWS segment and submit.
