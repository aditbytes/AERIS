# 2.4 Failure Visibility

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 4.

- [ ] SQS dead-letter queue or Lambda failure destination on every fetcher
- [ ] Failed fetch leaves existing data untouched (no overwrite with empty or fake results)
- [ ] Alarm on DLQ depth (wired in [Phase 4 observability](../phase-4-hardening-submission/01-observability.md))

**Done when:** forcing a failure (bad key in a test) lands a message in the DLQ.
