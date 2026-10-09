# Work Left — Per Member

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Measured on 2026-10-08 against each member's task file in [`docs/members/`](../members/), the code on `main`, open PRs and branches, and the live stack. Percentages are effort estimates, not checkbox counts.

## Summary

| Member | Area | Done | Left | Commits on `main` (no merges) | Biggest open item |
|--------|------|------|------|-------------------------------|-------------------|
| **Aditya** | All AWS, integration, docs | ~85% | ~15% | 119 | Bedrock billing, submission |
| **Meenal** | Ingestion + exposure ranking | ~85% | ~15% | 5 (+3 merges) | `rank_sites` tests, exposed-population range |
| **Saba** | Agent + map UI + demo video | ~70% | ~30% | 20 | Demo video; fake values in the UI |
| **Pritam** | Source detection + plume model | ~25% | ~75% | 0 (1 in open PR #13) | Plume model, calibration, ML model |
| **Project** | | **~70%** | **~30%** | | |

```
Aditya  █████████████████░░░  85%
Meenal  █████████████████░░░  85%
Saba    ██████████████░░░░░░  70%
Pritam  █████░░░░░░░░░░░░░░░  25%
```

---

## Aditya (~15% left, about 3–4 hours, mostly manual)

| # | Item | Why it matters | Status |
|---|------|----------------|--------|
| 1 | Fix the Bedrock payment method (Visa/Mastercard with international payments as default), then subscribe once from `aeris-admin` | `actions.json` still says `generator: rules`; the "Strands on Bedrock" story is not live | Open |
| 2 | Or request a Nova tokens-per-day quota increase (Service Quotas → Bedrock) | Nova works, but the new-account daily quota is used up | Open |
| 3 | **Before** Claude goes live: run the LLM less often | At 48 runs/day Claude Sonnet 4.6 costs about $120/month, over the $50 budget ([`running-cost.md`](running-cost.md)) | Open |
| 4 | Finish the account and alerting checklist (kept in a local, untracked note, not in this public repo) | Alarm emails and account hygiene | Open |
| 5 | Review PR #13 (Pritam) | Adds scikit-learn, which pulls in SciPy: about +150 MB on an 83 MB package, close to Lambda's 250 MB limit. Run `sam build` and check the size | Open |
| 6 | Rebase or close Saba's `saba-8oct2026-2nd-phase` | 3 merge conflicts with `main`, and it adds a `?? 1278` fallback | Open |
| 7 | Get the fake UI values removed and redeploy the web app ([`data-authenticity.md`](data-authenticity.md)) | Judges and the video must not show invented numbers | Open |
| 8 | Fix `scripts/cost_check.sh` to scan every region | It only checks `ap-south-1`, so spend in other regions stays invisible | Open |
| 9 | Builder Center student verification and credits | Phase 1 left it open | Unknown |
| 10 | Publish the blog (fill `<…>` values), record the AWS segment (2:00–2:40), make the repo public if required, submit the form | Submission | Open |
| 11 | SageMaker training job and endpoint | Only if Pritam delivers `train.py` / `inference.py` | Blocked |
| 12 | Teardown after judging, then `cost_check.sh` again | Stop spend | Later |

## Meenal (~15% left)

| # | Item | Status |
|---|------|--------|
| 1 | Tests for `models/exposure/rank_sites.py`. None exist, and the definition of done asks for them: a site inside a band outranks one outside; a hospital outranks a school at equal exposure | Open |
| 2 | Exposed-population range: the live high bound is **38,194,516** against an estimate of **458,428** (83×). Use a method that does not jump when the threshold drops to the corridor's 0.20 risk floor, and stop calling it a "90% CI" | Open |
| 3 | Speed up ranking: it takes **39 s at 2 GB per run** (Python point-in-polygon over 222,792 cells × 40 bands). Shapely's vectorised `contains_xy` or an `STRtree` should bring it to a few seconds and cut Lambda cost | Improvement |
| 4 | AQI fetcher averages **105 s per run**; check for sequential calls or retries that can be batched | Improvement |
| 5 | Add a top-level `source` to `aqi.json` | Open |
| 6 | Merge the one-line docs commit `8c9ecd0` still waiting on `feat/ingestion-snapshots` | Open |

**Done:** FIRMS, AQI, wind, sites and population fetchers, each with tests (124 ingest tests); real snapshots in `data/live/` with a README; exposure ranking code; `ingest/README.md`.

## Saba (~30% left)

| # | Item | Status |
|---|------|--------|
| 1 | **Record the 3-minute demo video** on the cleaned, deployed UI, then edit and subtitle it. Judges see only the video | Not started |
| 2 | Update the numbers in [`demo-script.md`](../demo-script.md) (it still says 55%, 314,000, 494, 571K); read every number from the live dashboard | Open |
| 3 | Remove the fake or mislabelled UI values: F1–F3 and F7–F18 in [`data-authenticity.md`](data-authenticity.md); delete `PlumeHudCard.tsx` | Open |
| 4 | Rebase `saba-8oct2026-2nd-phase` (KPI card redesign) on `main`: 3 conflicts, and remove `?? 1278` | Open |
| 5 | Rules plan wording: ETA clamp, total fires credited to one cluster, "90% CI" (B2 in the authenticity audit) | Open |
| 6 | UI tests: no vitest and no `test` script exist (task 9) | Not started |
| 7 | 3 lint warnings in `MapExplorerView.tsx`; the 1.44 MB JS bundle could be code-split | Improvement |
| 8 | Optional: `summary_hi` (Hindi summary) | Optional |

**Done:** Strands tools, system prompt, structured plan, rules plan, CLI, agent tests and reviewed run; dashboard with 8 views, MapLibre layers, time horizon control, legend, side panel and build.

## Pritam (~75% left)

| # | Task (from [`pritam-models.md`](../members/pritam-models.md)) | Status |
|---|------|--------|
| 1 | Source detection (DBSCAN, FRP-weighted centroid, strength, confidence, type) | **Done in draft PR #13**, 84 new tests pass (253 total), not merged |
| 2 | Plume corridor: Lagrangian puff model, centreline with ETA | **Not started.** The corridor running in production was written by Saba and fixed by Aditya (wind direction, time alignment) |
| 3 | Calibration (`calibrate.py`, `params.json`) | **Not started.** Today's corridor constants are uncalibrated (B1 in the authenticity audit) |
| 4 | Optional ML surrogate (`train.py`, `inference.py`, eval notebook) | **Not started.** Blocks the SageMaker part of the AWS story |
| 5 | `models/README.md`: assumptions, formulas, limits | **Not started** (the source-detection README is in the PR) |
| — | `territory` / `district` on sources, which the UI expects | Not in the contract yet; agree with Saba |

**Advice:** mark PR #13 ready and get it merged first. Then do Task 3 in its honest form (write the constants into `params.json` and label them "assumed, uncalibrated" if real history is not available in time), then Task 5. Skip Task 4 unless there is a day spare.
