# 2.2 EventBridge Schedules

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 4.

| Source | Cadence |
|--------|---------|
| FIRMS | every 15 min |
| AQI | every 30 min |
| Weather | every 60 min |
| Sites, population | once (manual) |

- [ ] One EventBridge Scheduler rule per source, targeting its Lambda
- [ ] Respect upstream API rate limits

**Done when:** a day of schedules produces continuous `bronze/` objects with no gaps.
