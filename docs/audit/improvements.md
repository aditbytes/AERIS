# Improvements — Prioritised

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

From the 2026-10-08 audit. **P0** = before recording or judging. **P1** = this week. **P2** = after the hackathon.

## P0: honesty and correctness (before the video)

| # | Improvement | Owner | Effort |
|---|-------------|-------|--------|
| 1 | Remove the 18 fake, stale or mislabelled UI values ([`data-authenticity.md`](data-authenticity.md)). Show "—" or an empty state, or compute the value from the API. Delete `PlumeHudCard.tsx` | Saba | 2–3 h |
| 2 | Make the alert bell real: list stale feeds, new sources and pipeline failures from the API, or remove it | Saba | 1 h |
| 3 | Fix the exposed-population range (high bound 38.2M vs estimate 458k). Call it a "range", not "90% CI" | Meenal | 1–2 h |
| 4 | Rules plan wording: when ETA is 0 say "already inside the corridor", use the top source's own fire count, remove the invented defaults | Saba | 1 h |
| 5 | Get Bedrock writing plans (payment method or Nova quota) so `generator` starts with `bedrock:` | Aditya | 30 min + AWS wait |
| 6 | Update the demo-script numbers from the live dashboard | Saba | 30 min |

## P1: cost and speed

| # | Improvement | Saves | Owner |
|---|-------------|-------|-------|
| 7 | Run the Bedrock agent only when `ranked_sites.json` changes (hash the inputs), or every 3 h | About $100/month on Claude (48 → 8 runs/day) | Aditya |
| 8 | Nova Lite for scheduled runs, Claude only for on-demand runs | Most of the LLM bill | Aditya |
| 9 | Vectorise the ranking point-in-polygon (`shapely.contains_xy` or `STRtree`) and drop memory from 2048 to 512 MB | 39 s → a few seconds; about 40% of Lambda GB-s | Meenal |
| 10 | Find out why the AQI fetch takes 105 s (sequential calls, retries) and run it in parallel | About 15% of Lambda GB-s | Meenal |
| 11 | `cost_check.sh`: loop over every enabled region | Spend outside `ap-south-1` becomes visible | Aditya |
| 12 | Add a second budget with credits excluded, so credit burn is visible | Visibility | Aditya |
| 13 | Check that PR #13's scikit-learn and SciPy fit the 250 MB Lambda limit. If not, write a small NumPy DBSCAN or use a container image | Avoids a failed deploy | Pritam + Aditya |

## P1: model quality

| # | Improvement | Owner |
|---|-------------|-------|
| 14 | Calibrate the corridor against OpenAQ history, or write the current constants into `params.json` labelled "assumed, uncalibrated". Remove the 15 µg/m³ and 0.20 risk floors | Pritam |
| 15 | Convert PM2.5 to AQI with the CPCB breakpoints instead of the invented ×1.35 | Saba |
| 16 | Add `territory` (India / Pakistan from a point-in-polygon check on the boundary) and `district` to `sources.json`, or remove those filters from the UI | Pritam + Saba |
| 17 | Show the forecast's uncertainty on the map (the corridor is a heuristic, not WRF-Chem) | Saba |

## P1: engineering hygiene

| # | Improvement | Owner |
|---|-------------|-------|
| 18 | **GitHub Actions CI** on every PR: `pytest`, `npm run build`, `oxlint`, contract checks. No PR has any checks today | Aditya |
| 19 | Tests for `rank_sites` (none exist) and a few vitest UI tests (none exist) | Meenal, Saba |
| 20 | Rebase or close `saba-8oct2026-2nd-phase` (3 conflicts); merge or close Meenal's leftover docs commit; delete merged remote branches | Saba, Meenal, Aditya |
| 21 | Add `source` to every derived `gold/` file; record where `india-boundary.geojson` came from and its licence | Aditya, Saba |
| 22 | Update the README: "Getting Started" still says "Coming soon" and every folder is marked "(planned)" | Aditya |
| 23 | Code-split the 1.44 MB JS bundle (lazy-load MapLibre and the heavy views); fix the 3 lint warnings | Saba |

## P2: product ideas after the hackathon

| # | Idea |
|---|------|
| 24 | Hindi (and Punjabi) summaries and SMS/WhatsApp alerts to school and hospital contacts (Amazon SNS / Pinpoint) |
| 25 | ML surrogate trained on SageMaker, served from a Serverless Inference endpoint, compared against the baseline |
| 26 | Sentinel-5P satellite data (NO₂, CO, aerosols) to confirm the smoke, not only the fires |
| 27 | A history page: past corridors against what the stations actually measured, to build trust in the forecast |
| 28 | Bedrock Guardrails on the agent output |
| 29 | Per-district dashboards for district collectors, with GRAP stage pulled from an official source rather than written by hand |
