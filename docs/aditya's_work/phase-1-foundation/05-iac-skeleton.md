# 1.5 IaC Skeleton and Tooling

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 8 (started here, finished in later phases).

## Tasks
- [ ] `infra/template.yaml` (SAM) or CDK app with buckets and roles from 1.2–1.3
- [ ] `scripts/deploy.sh` — build, package, deploy
- [ ] `scripts/teardown.sh` — delete stacks to stop spend (details in [Phase 4](../phase-4-hardening-submission/06-teardown-and-cost.md))
- [ ] `.env.example` listing every variable, no secrets

## Done when
`deploy.sh` creates the stack from scratch and `teardown.sh` removes it cleanly.
