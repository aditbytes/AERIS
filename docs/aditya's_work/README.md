# Aditya's Work — Index

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Everything Aditya owns in AERIS: **all AWS tasks**. Source of truth: [`../members/aditya-aws.md`](../members/aditya-aws.md). File formats: [`../data-contracts.md`](../data-contracts.md). Region: `ap-south-1` (Mumbai).

**Goal:** a judge opens a CloudFront URL and sees the fire source, forecast corridor, ranked schools/hospitals and the agent's action plan on one map — all produced by code running on AWS.

## Phases

| Phase | Day | Theme | Docs | Report |
|-------|-----|-------|------|--------|
| 1 | 1 | Foundation: account, IAM, storage, IaC | [phase-1-foundation](phase-1-foundation/) | [COMPLETION](phase-1-foundation/COMPLETION.md) |
| 2 | 2 | Ingestion on AWS: Lambdas, schedules, failures | [phase-2-ingestion](phase-2-ingestion/) | [COMPLETION](phase-2-ingestion/COMPLETION.md) |
| 3 | 3 | Models, agent, API and website | [phase-3-models-agent-api](phase-3-models-agent-api/) | [COMPLETION](phase-3-models-agent-api/COMPLETION.md) |
| 4 | 4 | Hardening, integration, submission, teardown | [phase-4-hardening-submission](phase-4-hardening-submission/) | [COMPLETION](phase-4-hardening-submission/COMPLETION.md) |

## Scripts

| Script | Does |
|--------|------|
| `scripts/deploy.sh` | Build and deploy the whole stack (needs `ALERT_EMAIL`) |
| `scripts/deploy_web.sh` | Build `web/` against the API, upload it, invalidate CloudFront |
| `scripts/smoke_test.py` | Trigger a run and validate every API route against the contracts |
| `scripts/local_api.py` | Serve the API Lambda locally over `data/live/` |
| `scripts/load_reference.py` | Upload a real one-time snapshot (population) to `reference/` |
| `scripts/cost_check.sh` | Read-only check for idle-billable resources and month-to-date spend |
| `scripts/teardown.sh` | Empty the buckets and delete the stack |

## Phase 1 — Foundation
1. [Account, credits and budgets](phase-1-foundation/01-account-credits-budgets.md)
2. [IAM roles and secrets](phase-1-foundation/02-iam-and-secrets.md)
3. [S3 buckets](phase-1-foundation/03-s3-buckets.md)
4. [Storage interface (local + S3)](phase-1-foundation/04-storage-interface.md)
5. [IaC skeleton and tooling](phase-1-foundation/05-iac-skeleton.md)

## Phase 2 — Ingestion
1. [Fetcher Lambdas](phase-2-ingestion/01-fetcher-lambdas.md)
2. [EventBridge schedules](phase-2-ingestion/02-eventbridge-schedules.md)
3. [Secrets access in Lambdas](phase-2-ingestion/03-secrets-in-lambdas.md)
4. [Failure visibility (DLQ)](phase-2-ingestion/04-failure-visibility.md)
5. [Step Functions pipeline (optional)](phase-2-ingestion/05-step-functions-pipeline.md)

## Phase 3 — Models, agent, API, web
1. [Detection and corridor Lambda](phase-3-models-agent-api/01-detection-corridor-lambda.md)
2. [SageMaker training and endpoint](phase-3-models-agent-api/02-sagemaker.md)
3. [Exposure ranking Lambda](phase-3-models-agent-api/03-exposure-ranking-lambda.md)
4. [Bedrock and the Strands agent](phase-3-models-agent-api/04-bedrock-strands-agent.md)
5. [API Gateway routes](phase-3-models-agent-api/05-api-gateway.md)
6. [CloudFront and S3 website](phase-3-models-agent-api/06-cloudfront-website.md)

## Phase 4 — Hardening and submission
1. [Observability](phase-4-hardening-submission/01-observability.md)
2. [Smoke test](phase-4-hardening-submission/02-smoke-test.md)
3. [Stale-data handling](phase-4-hardening-submission/03-stale-data-handling.md)
4. [Integration and PR review](phase-4-hardening-submission/04-integration-and-review.md)
5. [Submission deliverables](phase-4-hardening-submission/05-submission-deliverables.md)
6. [Teardown and cost control](phase-4-hardening-submission/06-teardown-and-cost.md)

## Definition of done
- CloudFront URL shows source, corridor, ranked sites and actions on one map
- Data refreshes on a schedule with no manual steps
- Budget alerts active; unused endpoints deleted
- No secrets in git
