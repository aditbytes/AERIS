# 4.2 Smoke Test

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 9.

Script that: triggers the pipeline, fetches the API routes, and validates each response against [`../../data-contracts.md`](../../data-contracts.md).

- [ ] Fails loudly on any contract mismatch
- [ ] Uses only live responses; no stubbed payloads
- [ ] Run before every submission-related deploy

**Done when:** the script passes against the deployed stack.
