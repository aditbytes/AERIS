# Phase 3 — Models, Agent, API, Web (Day 3)

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

**Outcome:** the full chain runs on AWS and the UI reads from the live API.

| Doc | Covers |
|-----|--------|
| [01](01-detection-corridor-lambda.md) | Pritam's detection and corridor |
| [02](02-sagemaker.md) | Training job and inference endpoint |
| [03](03-exposure-ranking-lambda.md) | Meenal's ranking |
| [04](04-bedrock-strands-agent.md) | Saba's agent on Bedrock |
| [05](05-api-gateway.md) | HTTP API routes |
| [06](06-cloudfront-website.md) | CloudFront + S3 UI |

**Exit criteria:** CloudFront URL shows source, corridor, ranked sites and actions.
