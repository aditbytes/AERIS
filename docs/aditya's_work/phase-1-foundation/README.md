# Phase 1 — Foundation (Day 1)

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

**Outcome:** a safe, budgeted AWS account with IAM, buckets, a storage interface teammates can code against, and an IaC skeleton.

| Doc | Covers |
|-----|--------|
| [01](01-account-credits-budgets.md) | Account, Builder Center, credits, budgets, MFA, CLI tooling |
| [02](02-iam-and-secrets.md) | Least-privilege roles, Secrets Manager / SSM |
| [03](03-s3-buckets.md) | Data and web buckets, lifecycle, encryption |
| [04](04-storage-interface.md) | `ingest/common/storage.py` with local and S3 backends |
| [05](05-iac-skeleton.md) | SAM/CDK skeleton, `.env.example` |

**Exit criteria:** budget alerts live, root locked with MFA, buckets exist, `storage.py` merged to `main`, empty stack deploys.
