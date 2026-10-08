# Phase 1 — Completion Report

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Date: 2026-10-08 · PR: [#3](https://github.com/aditbytes/AERIS/pull/3) (merged) · Stack: `aeris-foundation`, region `ap-south-1`

## Status: code and AWS infrastructure done; four manual items remain

| Exit criterion | Status |
|----------------|--------|
| Budget alerts live | Stack deployed. **Confirm the AWS subscription email** sent to the alert address, or alerts never fire |
| Root locked with MFA | **Not done** — manual, console only |
| Buckets exist | Done — `aeris-772032166289-data`, `aeris-772032166289-web` |
| `storage.py` merged to `main` | Done — **announce to Meenal and Pritam** |
| Empty stack deploys | Done. `teardown.sh` has not been run yet, so "removes cleanly" is untested |

### Still manual (Aditya)
- [ ] Confirm the budget subscription email
- [ ] Turn on MFA for root, then **delete the root access key** (it was used once to bootstrap `aeris-admin`)
- [ ] Verify student status on AWS Builder Center; redeem the credits (doc 01)
- [ ] Install SAM CLI (not yet installed; Phase 2 packaging may need it) and optionally LocalStack. Docker is already installed
- [ ] Put `FIRMS_MAP_KEY`, `OPENAQ_API_KEY` (and any weather key) in Secrets Manager under `aeris/*` — not done yet
- [ ] Tell the team `storage.py` is ready

## What was done

### 1. Storage interface — `ingest/common/storage.py`
- One interface: `write_json(key, obj, geojson=False)` and `read_json(key, geojson=False)`
- `AERIS_STORAGE=local` (default) writes to `data/live/`; `AERIS_STORAGE=s3` uses `AERIS_S3_BUCKET` under `AERIS_S3_PREFIX` (default `gold/`)
- A key with `/` (e.g. `bronze/fires`) is used verbatim as the S3 path
- A missing key raises `FileNotFoundError`; no default payload is ever returned
- A dict without `generated_at` is refused; a missing `source` logs a warning
- Keys that are empty, absolute or contain `..` are rejected
- `boto3` is imported lazily, so the local backend works without it
- Tests: `ingest/tests/test_storage.py` (S3 path tested against an in-memory fake; the real S3 round-trip was also checked by hand)

### 2. Infrastructure — `infra/template.yaml` (plain CloudFormation, no SAM needed yet)
- **Data bucket:** public access fully blocked, AES256, `bronze/` expires after 14 days, incomplete multipart uploads aborted after 1 day
- **Web bucket:** private, encrypted (CloudFront comes in Phase 3)
- **Five roles, one per function:**

| Role | Allowed |
|------|---------|
| Fetcher | `PutObject` on `bronze/*`; read `aeris/*` secrets and SSM parameters |
| Model | read `bronze/*`, write `gold/*` |
| SageMaker | read/write `models/*`, list `models/` prefix, SageMaker logs |
| Agent | Bedrock `InvokeModel`, read `gold/*`, write `gold/actions.json` only |
| API | read `gold/*` |

  No role has `Action: "*"` or `Resource: "*"`. The Bedrock resources are wildcard-scoped to foundation models and inference profiles (`foundation-model/*`, `inference-profile/*`), because model IDs vary.
- **Monthly budget** (default $50) with email alerts at 50%, 80% and 100%

### 3. Scripts and config
- `scripts/deploy.sh` — validates the template and deploys the stack. Needs `ALERT_EMAIL`
- `scripts/teardown.sh` — empties both buckets, then deletes the stack
- `.env.example` — added `AERIS_S3_PREFIX`, `ALERT_EMAIL`, `MONTHLY_BUDGET_USD`, `AERIS_STACK`
- `requirements.txt` — added `boto3`
- `.gitignore` — excludes `docs/aditya's_work/aws_key/`, `rootkey.csv`, `*.pem`, `*accessKeys.csv`

### 4. AWS account
- IAM user `aeris-admin` with `AdministratorAccess`; its key CSV is in the gitignored `aws_key/` folder
- Verified: uploads to `bronze/`, `gold/` and `models/` work; all four public-access-block flags are `true`; an anonymous GET returns HTTP 403; `storage.py` read back 227 fires from S3. The test objects were deleted afterwards

## What changed for everyone else after Phase 1
- `write_json` now returns a **string** (a path or an `s3://` URI), not a `Path`. The five handlers only print it, so nothing broke
- Objects written through `storage` **must contain `generated_at`**. Today's fetchers already do
- With `AERIS_STORAGE=s3`, a plain key like `fires` lands at `gold/fires.json`. Raw fetch output meant for `bronze/` must pass a `bronze/...` key (Phase 2 work)
- Teammates keep using the local backend and never need AWS credentials. They call `storage.write_json` / `read_json` only, never `boto3`
- Full test suite: 113 passed, 4 skipped

## How to do the work manually

All commands run from the repo root. Load the `aeris-admin` key into your shell (the values are never printed):

```bash
export AWS_ACCESS_KEY_ID=$(sed -n 2p "docs/aditya's_work/aws_key/aeris-admin.csv" | cut -d, -f1 | tr -d '\r') AWS_SECRET_ACCESS_KEY=$(sed -n 2p "docs/aditya's_work/aws_key/aeris-admin.csv" | cut -d, -f2 | tr -d '\r') AWS_REGION=ap-south-1
```

Confirm you are not root (the ARN must end in `user/aeris-admin`):

```bash
aws sts get-caller-identity --query Arn --output text
```

**Deploy or update the stack:**

```bash
ALERT_EMAIL=you@example.com scripts/deploy.sh
```

**Tear it down** (stops spend; empties buckets first):

```bash
scripts/teardown.sh
```

**Store a secret** (type the value yourself; replace `<value>`):

```bash
aws secretsmanager create-secret --name aeris/FIRMS_MAP_KEY --secret-string "<value>"
```

**Use S3 from code:**

```bash
AERIS_STORAGE=s3 AERIS_S3_BUCKET=aeris-772032166289-data python3 -m ingest.firms.handler
```

This needs `boto3` in a virtual environment, because Homebrew Python blocks `pip install`:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

**Check public access is blocked:**

```bash
aws s3api get-public-access-block --bucket aeris-772032166289-data
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://aeris-772032166289-data.s3.ap-south-1.amazonaws.com/gold/fires.json
```

Expect all `true` and `403`.

**Cost watch:** the console showed about $4.23 this month before Phase 1, mostly EC2, VPC, S3 and Bedrock. Check for forgotten EC2 instances and NAT gateways, which are the two cost traps in doc 01.

## Security notes
- `aeris-admin` has full admin. Turn on MFA for it, and narrow its permissions once the stack is stable
- Never commit the `aws_key/` folder. It is now gitignored, but it sits inside the repo tree
- Teammates never get AWS credentials; they hand over code and Aditya deploys (doc 02)
