# 1.3 S3 Buckets

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 3.

## Buckets
- `aeris-<account>-data` — prefixes `bronze/` (raw), `gold/` (contract-format outputs), `models/` (SageMaker artifacts)
- `aeris-<account>-web` — built UI, served via CloudFront (see Phase 3)

## Settings
- [ ] Block all public access on the data bucket
- [ ] Default encryption on
- [ ] Lifecycle rule: expire `bronze/` after 14 days
- [ ] `gold/` objects follow [`../../data-contracts.md`](../../data-contracts.md)

## Done when
A test upload to each prefix works from the CLI and public access checks fail as expected.
