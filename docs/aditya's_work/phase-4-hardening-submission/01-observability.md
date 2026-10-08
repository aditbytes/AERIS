# 4.1 Observability

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 9.

- [ ] CloudWatch log groups with 7-day retention
- [ ] Alarm on Lambda errors, plus DLQ depth
- [ ] Notifications to Aditya's email via SNS

**Done when:** a forced error triggers an alarm email.
