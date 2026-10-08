# Running Cost — Daily and Monthly

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Measured on 2026-10-08 with AWS Cost Explorer, CloudWatch Lambda metrics (last 24 h) and the AWS Budgets API. Estimates use AWS on-demand list prices and are marked **estimate**.

## Bottom line

| What | Per day | Per month | How sure |
|------|---------|-----------|----------|
| **AERIS today** (pipeline every 30 min, rules plan, free tier) | **~$0.05** | **~$1.50** | Estimate from measured usage |
| AERIS with no free tier | ~$0.17 | ~$5.20 | Estimate |
| **+ Bedrock agent on Claude Sonnet 4.6**, 48 runs/day | +~$3.96 | **+~$120** | Estimate |
| + Bedrock agent on Amazon Nova Pro | +~$0.96 | +~$29 | Estimate |
| + Bedrock agent on Amazon Nova Lite | +~$0.07 | +~$2.20 | Estimate |
| + Bedrock agent on Amazon Nova Micro | +~$0.04 | +~$1.30 | Estimate |
| **Actual bill so far** | — | **$0.00 net** | Measured: all usage was covered by credits |

## Measured facts

| Fact | Value |
|------|-------|
| AERIS spend in `ap-south-1` so far | Below $0.01 (Cost Explorer lags about 24 h, so 8 Oct is not in yet) |
| Account-wide usage, October and September | Fully covered by credits; net $0.00. Usage from resources outside the AERIS stack is tracked in the private account note, not here |
| Budget `aeris-monthly` | $50 limit, actual $0.00, forecast $18.90. **It includes credits**, so it reads $0 while credits last and alerts will not fire on credit burn |
| Idle-billable resources in `ap-south-1` | None: no SageMaker endpoint, NAT gateway, running EC2 or unattached Elastic IP |

## AERIS: what the money goes to (estimate, 48 pipeline runs/day)

Lambda usage, measured over the last 24 h (average duration per run), scaled to the full schedule:

| Function | Memory | Runs/day | Avg duration | GB-seconds/day |
|----------|--------|----------|--------------|----------------|
| Rank | 2048 MB | 48 | 39.2 s | ~3,760 |
| Agent | 1024 MB | 48 | 75.7 s (mostly waiting on failing Bedrock models) | ~3,640 |
| AQI fetch | 256 MB | 48 | 105.6 s | ~1,270 |
| FIRMS fetch | 256 MB | 96 | 5.9 s | ~140 |
| Publish / Detect / Corridor | 512 / 512 / 1024 MB | 48 each | 2.3 / 1.4 / 0.8 s | ~130 |
| Weather fetch | 512 MB | 24 | 3.4 s | ~40 |
| API | 512 MB | ~170 | 0.15 s | ~13 |
| **Total** | | | | **~9,000/day ≈ 273,000/month** |

| Service | Monthly | Note |
|---------|---------|------|
| Lambda | $0 (≈$3.60 without free tier) | 273k GB-s is under the 400k GB-s monthly free tier. Rank + Agent are 82% of it |
| Secrets Manager | $1.20 | 3 secrets × $0.40 (free for each secret's first 30 days) |
| Step Functions | ~$0.16 | ~10k state transitions; 4k free |
| S3 | ~$0.13 | ~1.2 GB (wind is 3 MB/hour, kept 14 days) plus requests |
| CloudWatch logs + 3 alarms | ~$0 | Inside free tier (5 GB logs, 10 alarms) |
| API Gateway, CloudFront, EventBridge, SNS, SQS | ~$0 | Free tier at hackathon traffic |
| **Total** | **~$1.50** | |

## Bedrock agent cost (estimate)

The agent's tool results on real data are about 2,400 tokens (measured from the tool outputs). With the system prompt, tool schemas and 2–3 turns, assume about **15,000 input + 2,500 output tokens per run**.

| Model | Price per 1M tokens (in / out) | Per run | 48 runs/day | Per month |
|-------|-------------------------------|---------|-------------|-----------|
| Claude Sonnet 4.6 | $3 / $15 | $0.083 | $3.96 | **~$120** |
| Amazon Nova Pro | ~$0.80 / $3.20 | $0.020 | $0.96 | ~$29 |
| Amazon Nova Lite | ~$0.06 / $0.24 | $0.0015 | $0.07 | ~$2.20 |
| Amazon Nova Micro | ~$0.035 / $0.14 | $0.0009 | $0.04 | ~$1.30 |

Claude prices are Anthropic's list prices; Bedrock's `global.` profile pricing should be checked on the Bedrock pricing page. Nova prices are approximate us-region list prices; `apac.` profiles may differ slightly.

**Cheaper ways to keep Claude:**
- Run the agent only when `ranked_sites.json` changes (hash the inputs), or every 3 hours: 8 runs/day ≈ **$20/month** on Sonnet 4.6
- Use Nova Lite for scheduled runs and Claude only for on-demand runs during the demo

**Cost check coverage:** `scripts/cost_check.sh` only looks at `ap-south-1`. Make it loop over every enabled region so spend elsewhere on the account shows up.
