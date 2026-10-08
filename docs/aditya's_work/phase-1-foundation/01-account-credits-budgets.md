# 1.1 Account, Credits and Budgets

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 1.

## Tasks
- [ ] Create the AWS account (debit/RuPay works; ~₹2 verification charge)
- [ ] Verify student status on **AWS Builder Center** (required to compete, unlocks rewards)
- [ ] Redeem free-tier credits (up to $200); request the extra $25 only after those run out
- [ ] Monthly **Budget** with email alerts at 50%, 80%, 100%
- [ ] MFA on root; never use root afterwards
- [ ] Create an IAM Identity Center user or IAM admin user for daily use
- [ ] Install and configure: AWS CLI v2, SAM CLI (or CDK), Docker, optionally LocalStack

## Cost traps
SageMaker endpoints left running and NAT gateways. Avoid both unless needed.

## Done when
Budget alerts fire a test email, `aws sts get-caller-identity` works with the non-root identity.
