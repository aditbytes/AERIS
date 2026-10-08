# 1.2 IAM and Secrets

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 2.

## Roles (one per function, least privilege)
| Role | Allowed |
|------|---------|
| Each fetcher Lambda | Own `bronze/` prefix write, secret read |
| Model Lambdas | Read `bronze/`, write `gold/` |
| SageMaker | S3 read/write `models/`, CloudWatch logs |
| Agent | Bedrock `InvokeModel`, read `gold/`, write `gold/actions.json` |
| API Lambdas | Read-only on `gold/` |

## Secrets
- [ ] Store `FIRMS_MAP_KEY`, `OPENAQ_API_KEY`, any weather key in Secrets Manager (or cheaper SSM Parameter Store)
- [ ] Teammates never get AWS credentials — they hand over code, Aditya deploys
- [ ] Never commit keys; confirm `.env` is gitignored

## Done when
No role uses `*` resources or actions beyond what its function needs.
