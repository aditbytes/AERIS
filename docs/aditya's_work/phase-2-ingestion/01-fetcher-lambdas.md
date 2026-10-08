# 2.1 Fetcher Lambdas

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 4.

- [ ] Package each of Meenal's fetchers as a Lambda (Python 3.12): FIRMS, AQI (OpenAQ), weather, sites, population
- [ ] Set timeout and memory per function
- [ ] Output through the storage interface to `bronze/`
- [ ] Sites and population are one-time manual runs

Review each fetcher locally first; deploy only after it passes locally against the real API.

**Done when:** each function invoked manually writes a real, source-stamped object to S3.
