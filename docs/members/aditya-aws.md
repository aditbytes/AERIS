# Aditya — All AWS Work

> ⚠️ **No demo data.** AERIS uses **only real data** from live sources. Do not create, hand-write, mock or hard-code sample, demo, placeholder or fabricated data — not in code, not in the UI, not in tests, and not as a "fallback". If a live source is unavailable, return an error and show an error state. The only offline files allowed are **real snapshots** that the fetchers captured from live sources into `data/live/` (each stamped with its source and fetch time). Tests may use small captured real API responses, labelled as such.

You own **every AWS task** in AERIS. The other three build plain local code; you make it run on AWS and tie it together. Prize rules require using at least one AWS open-source tool **or** deploying on AWS. You do both: the Strands Agents SDK, plus a deployment on Lambda, S3, SageMaker, EventBridge and the rest.

Region: `ap-south-1` (Mumbai). Shared file formats: [`../data-contracts.md`](../data-contracts.md).

## Goal

A judge opens a CloudFront URL and sees the full chain on a map: a detected fire source, the forecast corridor, the ranked schools and hospitals, and the agent's action plan. All of it is produced by code running on AWS.

---

## 1. Account, credits and safety

- [ ] Create the AWS account (debit/RuPay works; verification charge is about ₹2)
- [ ] Verify student status on **AWS Builder Center** (needed to compete, unlocks rewards)
- [ ] Redeem free-tier credits (up to $200); request the extra $25 only once those run out
- [ ] **Budgets**: create a monthly budget with email alerts at 50%, 80% and 100%. SageMaker endpoints and NAT gateways are the usual cost traps, so do not use either unless needed
- [ ] Turn on MFA for the root user; never use root afterwards
- [ ] Create an IAM Identity Center user or an IAM admin user for yourself
- [ ] Install and configure: AWS CLI v2, SAM CLI (or CDK), Docker, optionally LocalStack

## 2. IAM and secrets

- [ ] One execution role per Lambda with least privilege (only its own S3 prefix, only needed actions)
- [ ] Role for SageMaker (S3 read/write, CloudWatch logs)
- [ ] Permission to invoke Bedrock models for the agent role
- [ ] **Secrets Manager** (or SSM Parameter Store, cheaper): `FIRMS_MAP_KEY`, `OPENAQ_API_KEY`, any weather key
- [ ] Teammates never get AWS credentials. They give you code; you deploy it
- [ ] Never commit keys. Check `.env` stays gitignored

## 3. Storage (S3)

- [ ] Bucket `aeris-<account>-data` with prefixes `bronze/` (raw), `gold/` (outputs in the contract formats), `models/` (SageMaker artifacts)
- [ ] Bucket `aeris-<account>-web` for the built UI
- [ ] Block public access on the data bucket; encryption on; lifecycle rule to expire `bronze/` after 14 days
- [ ] Write `ingest/common/storage.py` with one interface (`read_json(key)`, `write_json(key, obj)`) and two backends: **local files** (default, what teammates use) and **S3** (selected by env `AERIS_STORAGE=s3`). Meenal's and Pritam's code only call this interface

## 4. Ingestion on AWS

- [ ] Package each of Meenal's fetchers as a **Lambda** (Python 3.12). Set timeout and memory per function
- [ ] **EventBridge Scheduler** rules: FIRMS every 15 min, AQI every 30 min, weather every 60 min, sites and population once (manual run)
- [ ] Put secrets access in the Lambda roles; read keys at cold start, cache them
- [ ] **SQS dead-letter queue** (or Lambda failure destination) so failed fetches are visible
- [ ] Optional: a **Step Functions** state machine that runs fetch → detect → corridor → rank → agent in order, so one trigger produces a full refreshed result

## 5. Models on AWS

- [ ] Pritam's detection and corridor code runs as a **Lambda** (container image if dependencies like shapely/numpy exceed the zip limit)
- [ ] If Pritam delivers an ML model: run a **SageMaker training job** from `models/training/train.py`, store the artifact in `models/` on S3, then deploy it. Prefer a **Serverless Inference** or **Async** endpoint to avoid paying for idle instances. Delete endpoints when not demoing
- [ ] Fall back to the Lambda baseline if SageMaker is not ready; the API contract stays identical
- [ ] Meenal's exposure ranking runs as a Lambda after the corridor is written

## 6. Agent on AWS

- [ ] Enable **Amazon Bedrock** model access in a region where the chosen Claude model is available (check the console; this may mean calling Bedrock cross-region)
- [ ] Set env vars so Saba's agent uses the Bedrock provider instead of her local default
- [ ] Host the Strands agent as a **Lambda** (simplest) or on **Bedrock AgentCore Runtime**. Increase Lambda timeout (agents can take 30–60 s)
- [ ] Write the result to `gold/actions.json`
- [ ] Optional: **Bedrock Guardrails** for safe output

## 7. API and website

- [ ] **API Gateway** (HTTP API) with routes `GET /sources`, `GET /corridor`, `GET /sites`, `GET /actions`, `GET /summary`. Each Lambda just reads the matching `gold/` file. Enable CORS for the CloudFront origin
- [ ] Optional write route `POST /run` to trigger a fresh pipeline for the demo
- [ ] **CloudFront + S3** (origin access control) serving Saba's `web/dist`; set `API_BASE_URL` at build time
- [ ] Optional **Amazon Location Service** map tiles if Saba's map needs a hosted basemap; otherwise free OSM tiles are fine

## 8. Infrastructure as code

- [ ] Everything in `infra/template.yaml` (SAM) or CDK: buckets, Lambdas, roles, schedules, API, CloudFront
- [ ] `scripts/deploy.sh` (build, package, deploy) and `scripts/teardown.sh` (delete stacks to stop spend)
- [ ] `.env.example` listing every variable, with no secrets

## 9. Observability and testing

- [ ] CloudWatch log groups with a retention of 7 days; an alarm on Lambda errors
- [ ] End-to-end smoke test script: trigger the pipeline, fetch the four API routes, check each response against the contract
- [ ] If a live API (FIRMS, OpenAQ) is down, the API returns the last **real** successful result from `gold/` with its fetch time, and the UI shows it as stale. Never substitute invented data

## 10. Integration and review

- [ ] Review and merge PRs from the three teammates; resolve contract mismatches
- [ ] Run each teammate's code locally first, then deploy
- [ ] Keep `main` deployable at all times

## 11. Submission deliverables

- [ ] Public **AWS Builder Center blog**: problem, stack, what fought back (prize for the top 5 blogs); link it in the submission
- [ ] 3-minute demo video: Saba records the product; you add the "where AWS fits" part with an architecture diagram
- [ ] Final submission: deployed URL, repo (make it public if required), demo video, blog link
- [ ] Update the diagram in `docs/` to reflect what was actually deployed

## Suggested timeline

| Day | Tasks |
|-----|-------|
| 1 | Sections 1–3: account, credits, budgets, IAM, buckets, storage interface, IaC skeleton |
| 2 | Section 4: deploy ingestors and schedules with Meenal's first fetcher; first real data lands in `bronze/` |
| 3 | Sections 5–7: models, agent, API, CloudFront; point UI at live API |
| 4 | Sections 9–11: smoke test, stale-data handling, blog, video, submission, teardown plan |

## Definition of done

- Opening the CloudFront URL shows source, corridor, ranked sites and actions on one map
- Data refreshes on a schedule without manual steps
- Budget alerts are active and unused endpoints are deleted
- No secrets in git
