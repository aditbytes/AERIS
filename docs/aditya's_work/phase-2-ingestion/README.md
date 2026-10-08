# Phase 2 — Ingestion on AWS (Day 2)

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

**Outcome:** Meenal's fetchers run on a schedule in AWS; first real data lands in `bronze/`.

| Doc | Covers |
|-----|--------|
| [01](01-fetcher-lambdas.md) | Packaging fetchers as Lambdas |
| [02](02-eventbridge-schedules.md) | Schedules per source |
| [03](03-secrets-in-lambdas.md) | Reading keys at cold start |
| [04](04-failure-visibility.md) | DLQ / failure destinations |
| [05](05-step-functions-pipeline.md) | Optional orchestration |

**Exit criteria:** FIRMS data from a scheduled run is visible in `bronze/` without manual action.
