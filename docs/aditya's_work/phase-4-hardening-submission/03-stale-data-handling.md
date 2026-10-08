# 4.3 Stale-Data Handling

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 9.

If a live API (FIRMS, OpenAQ) is down:
- API returns the last **real** successful result from `gold/` with its fetch time
- UI shows it as **stale**
- If nothing real exists yet, return an error and show an error state
- Never substitute invented data

**Done when:** simulated upstream outage (blocked call) yields the stale banner, not fake output.
