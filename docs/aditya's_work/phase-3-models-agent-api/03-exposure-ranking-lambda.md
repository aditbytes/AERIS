# 3.3 Exposure Ranking Lambda

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 5.

- [ ] Deploy Meenal's ranking as a Lambda triggered after the corridor is written
- [ ] Inputs: corridor, sites, population (all real)
- [ ] Output: ranked schools and hospitals in `gold/` per contract

**Done when:** ranking updates automatically whenever a new corridor lands.
