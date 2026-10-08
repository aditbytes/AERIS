# AERIS Project Audit (2026-10-08)

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Audit taken on **2026-10-08 at about 21:50 IST** against `main` (`dfb0b16`), every open branch and PR, the live AWS stack (`aeris-foundation`, `ap-south-1`) and AWS Cost Explorer.

## Files in this folder

| File | What it answers |
|------|-----------------|
| [`work-left.md`](work-left.md) | How much work is left, for Aditya and for each member, item by item |
| [`data-authenticity.md`](data-authenticity.md) | Is there mock, fake or hard-coded data? Is every number on the frontend real? |
| [`running-cost.md`](running-cost.md) | Daily and monthly running cost, measured and estimated |
| [`aditya-work-done.md`](aditya-work-done.md) | Everything Aditya built in this project |
| [`improvements.md`](improvements.md) | What to fix and improve, in priority order |
| [`aeris-explained-hinglish.md`](aeris-explained-hinglish.md) | What the app does, in short, in Hinglish |
| [`whatsapp-team-update.md`](whatsapp-team-update.md) | Ready-to-paste WhatsApp message for the team |

## Headline answers

| Question | Answer |
|----------|--------|
| Is the app live? | **Yes.** Website returns 200, API `/health` is `ok`, and the pipeline ran at 16:14Z. The last 4 runs succeeded |
| Aditya's work left | **About 15%.** Mostly manual console steps and the submission (Bedrock billing, account checklist, blog, video segment, final form) |
| Meenal's work left | **About 15%.** Tests for exposure ranking, fix the exposed-population range, speed up ranking and the AQI fetcher |
| Pritam's work left | **About 75%.** Only source detection is done, in draft PR #13, not merged. Plume model, calibration, ML model and docs are not started |
| Saba's work left | **About 30%.** Demo video not recorded, fake numbers still in the UI, KPI branch not merged, no UI tests |
| Whole project | **About 70% done.** The AWS pipeline works end to end; the gaps are honesty fixes in the UI, the science (calibration), the agent's LLM and the video |
| Any fake / hard-coded data? | **Yes, in the frontend.** 18 places show invented, stale or mislabelled values; 6 of them are on the main dashboard right now. The ingested data (fires, AQI, wind, sites, population) is real. The model has unlabelled, uncalibrated constants. See [`data-authenticity.md`](data-authenticity.md) |
| Running cost of AERIS itself | **About $0.05/day, $1.50/month** today (free tier covers most). With Claude Sonnet 4.6 running every 30 min: **about $4/day, $120/month** |

## Live state at audit time

| Check | Result |
|-------|--------|
| Website (CloudFront) | 200 OK |
| `GET /summary` | 10 sources, 387 fires, 1,806 ranked sites, exposed population 458,428 (range 343,821 – 38,194,516) |
| Plan generator | `rules`. Bedrock is not writing plans yet (Claude: payment method; Nova: daily token quota) |
| Pipeline runs (last 9) | 7 succeeded, 2 failed at 21:08 and 21:13 IST during the agent timeout fix. `PipelineFailedAlarm` still shows ALARM and will clear |
| Fetch DLQ | 0 messages |
| Tests on `main` | 169 passed |
| Tests on Pritam's PR branch | 253 passed (adds 84) |
| Web build | Builds. 3 lint warnings, 1.44 MB JS bundle |

## Do these next (in order)

1. **Remove the fake UI values** listed in [`data-authenticity.md`](data-authenticity.md) and redeploy the web app (Saba codes it, Aditya reviews and deploys)
2. **Record the demo video** on the cleaned UI (Saba). Judges see only the video
3. **Fix Bedrock billing** so `generator` shows `bedrock:` (Aditya). Before that, cut the agent schedule, or Claude can cost about $120/month (see [`running-cost.md`](running-cost.md))
4. **Finish the account and alerting checklist** (Aditya). It is kept in a local, untracked note, not in this public repo
5. **Review PR #13** (Pritam): check the pipeline Lambda still fits in 250 MB with scikit-learn and SciPy
6. **Fix the exposed-population range** (Meenal, with Pritam's corridor floors) and add the missing `rank_sites` tests
7. Publish the blog, make the repo public if required, submit the form (Aditya)
