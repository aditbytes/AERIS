# Data Authenticity Audit: Is Everything Real?

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Checked on 2026-10-08 against `main` and the live site. Method: a keyword scan (mock, fake, sample, demo, fallback, random), a scan of every numeric literal in `web/src`, reading each hit in context, and comparing what the UI shows with the live API.

## Short answer

| Layer | Real? |
|-------|-------|
| Ingested data: fires, AQI, wind, sites, population | **Real.** NASA FIRMS, OpenAQ/data.gov.in, Open-Meteo GFS, OpenStreetMap and WorldPop 2020. No mock fetchers. A failed fetch raises and writes nothing |
| Storage and API | **Real.** Storage refuses objects without `generated_at`. The API returns `404 no_data`, never a default, and marks old data `stale` |
| Frontend data loading (`web/src/services/api.ts`) | **Real.** It reads the live API, or real snapshots in local mode, and throws on failure |
| Model and agent logic | **Real inputs, but uncalibrated constants and some invented defaults.** See "Backend" below |
| **Frontend screens** | **Not fully real.** 18 places show invented, stale or mislabelled values. 6 are on the main dashboard right now |

The Phase 3/4 cleanup removed the numbers in `MetricGrid`, `AgentWidget`, `AqiKpiCard`, `TopAffectedAreas` and the map telemetry. The items below were missed.

## Frontend: on the main dashboard now

| # | Where | What the user sees | Real value | Verdict |
|---|-------|--------------------|-----------|---------|
| F1 | [`Header.tsx:228`](../../web/src/components/layout/Header.tsx#L228) (alert bell, every page) | 3 alerts: "676 MW cluster in Sangrur, 36 fire pixels", "PBLH below 150 m tonight", "CAQM GRAP Stage IV Active", plus a badge of 3 | None of these come from data | **Fake**: written by hand, never change |
| F2 | [`SourceBreakdown.tsx:103`](../../web/src/components/analytics/SourceBreakdown.tsx#L103) | FRP tiers: High (100–200 MW) **15%**, Moderate **7%** | Both **0%** today. The bars add up to 122% | **Fake fallback is showing now**: `\|\| 70`, `\|\| 15`, `\|\| 7`, `\|\| 8` replace any real 0% |
| F3 | [`SourceBreakdown.tsx:134`](../../web/src/components/analytics/SourceBreakdown.tsx#L134) | Domestic **70%** / Transboundary **30%** | Unknown. `sources.json` has no `territory` field | **Fake**: always 70/30 |
| F4 | [`MetricGrid.tsx:168`](../../web/src/components/kpi/MetricGrid.tsx#L168), [`AgentWidget.tsx:59`](../../web/src/components/agent/AgentWidget.tsx#L59) | "90% Confidence Interval: 343,821 – 38,194,516" | It is a threshold sweep with ±25%, not a statistical interval. The high bound is 83× the estimate | **Mislabelled** |
| F5 | [`AqiForecast12h.tsx:63`](../../web/src/components/analytics/AqiForecast12h.tsx#L63) | "AQI Forecast (Next 12 Hours)" | AQI = station baseline + ΔPM2.5 × **1.35**. The 1.35 factor is invented; CPCB AQI is not linear in PM2.5 | **Unlabelled assumption** |
| F6 | Agent summary ([`agent/agent.py:94`](../../agent/agent.py#L94)) | "Active stubble burning cluster detected with 387 fires … corridor approaches NCR in ~0.5 hours … (90% CI …)" | 387 is all 10 sources added together, not one cluster. ETA is really 0.0 h (clamped up to 0.5). Not a CI | **Misreported** |

## Frontend: other screens

| # | Where | What the user sees | Real value | Verdict |
|---|-------|--------------------|-----------|---------|
| F7 | [`MapExplorerView.tsx:761`](../../web/src/components/map/MapExplorerView.tsx#L761) (layer panel) | "10 regional clusters • 215 fires (1,275 MW)", "6 domestic • 156 fires", "4 transboundary • 59 fires" | 10 sources, 387 fires, 2,095 MW | **Fake / stale** |
| F8 | [`MapExplorerView.tsx:819`](../../web/src/components/map/MapExplorerView.tsx#L819), [`:832`](../../web/src/components/map/MapExplorerView.tsx#L832) | "440+ educational institutions", "50+ healthcare facilities" | 3,132 sites; 1,806 ranked | **Fake / stale** |
| F9 | [`MapExplorerView.tsx:286`](../../web/src/components/map/MapExplorerView.tsx#L286), [`:320`](../../web/src/components/map/MapExplorerView.tsx#L320), [`thermalMarker.ts:38`](../../web/src/components/map/thermalMarker.ts#L38) | Every fire is labelled "Domestic (India)", district "Unassigned". The India and Transboundary filters show nothing. Transboundary text says "NW 315° winds" | `territory` and `district` are never produced | **Broken and hard-coded** |
| F10 | [`AnalyticsView.tsx:191`](../../web/src/components/views/AnalyticsView.tsx#L191) | "Model Corroboration Index **R² = 0.88**" | No validation has ever been run (no `calibrate.py`, no eval notebook) | **Fabricated statistic** |
| F11 | [`AnalyticsView.tsx:141`](../../web/src/components/views/AnalyticsView.tsx#L141), [`:205`](../../web/src/components/views/AnalyticsView.tsx#L205) | "250+ ground receptor sites", "250+ Facilities" | 1,806 ranked sites | **Stale text** |
| F12 | [`AnalyticsView.tsx:86`](../../web/src/components/views/AnalyticsView.tsx#L86) | District table: "Ludhiana Corridor", "Sangrur & Patiala", … | Grouped by latitude bands only | **Unlabelled approximation** |
| F13 | [`WindWeatherView.tsx:53`](../../web/src/components/views/WindWeatherView.tsx#L53), [`:73`](../../web/src/components/views/WindWeatherView.tsx#L73) | With no wind data: 2.8 m/s, 214°, PBLH 135 m, and an even wind rose | Should be an empty state | **Fake fallback** (only when data is missing) |
| F14 | [`WindWeatherView.tsx:441`](../../web/src/components/views/WindWeatherView.tsx#L441), [`:454`](../../web/src/components/views/WindWeatherView.tsx#L454) | "Dominant Inflow: WSW (214°) & NW (315°)", "Prevailing winter corridor direct to Delhi", "~262 km" | The wind rose beside it is computed; this caption is not. Straight-line Sangrur → Delhi is about 224 km | **Hard-coded** |
| F15 | [`PopulationRiskView.tsx:25`](../../web/src/components/views/PopulationRiskView.tsx#L25) | With no ranked sites: 570,938 (428,203 – 713,672) | Should be "—" | **Fake fallback**: the same numbers Phase 3 removed elsewhere |
| F16 | [`SettingsView.tsx:176`](../../web/src/components/views/SettingsView.tsx#L176), [`:198`](../../web/src/components/views/SettingsView.tsx#L198) | "38 Stations Active", "Deterministic High-Fidelity Snapshot", "100% Real Scientific Data" | 60 stations (59 with AQI); the site reads the live API; not 100% while F1–F15 remain | **Hard-coded / false** |
| F17 | [`ActionsModal.tsx:166`](../../web/src/components/agent/ActionsModal.tsx#L166) | "Directives automatically updated every 15 minutes" | Pipeline runs every 30 minutes | **Wrong** |
| F18 | [`FireSourcesView.tsx:158`](../../web/src/components/views/FireSourcesView.tsx#L158), [`PopulationRiskView.tsx:146`](../../web/src/components/views/PopulationRiskView.tsx#L146) | "VIIRS thermal quality flag > 80%"; "Plume arrival ETA < 2.5 hours" | The first counts AERIS source `confidence ≥ 0.8`, not a VIIRS flag. The second counts sites with `risk_score ≥ 0.85`, not an ETA | **Mislabelled** |

**Acceptable (labelled assumption):** the 35% / 55% "What if we act" reductions ([`WhatIfWeAct.tsx`](../../web/src/components/analytics/WhatIfWeAct.tsx), [`dataContext.tsx:198`](../../web/src/services/dataContext.tsx#L198)) carry an asterisk and a tooltip saying they are assumed scenarios. Keep the label visible in the video.

**Not shown, but delete:**
- [`PlumeHudCard.tsx`](../../web/src/components/map/PlumeHudCard.tsx) is never imported, yet holds fake values ("Expected AQI 280–520", "Confidence 82%", "NW → SE", "~2 hours"). Delete it so nobody wires it back in
- Saba's unmerged branch `saba-8oct2026-2nd-phase` adds a `?? 1278` MW fallback in the new KPI cards. Remove it before merging

## Backend: real inputs, invented constants

| # | Where | Issue | Effect |
|---|-------|-------|--------|
| B1 | [`models/plume/corridor.py`](../../models/plume/corridor.py) (lines ~104, ~173–175) | Constants with no calibration: ΔPM2.5 = `max(15.0, 160 × strength × decay)`, `risk = max(0.20, …)`, spread `3.2·√t`, decay 20 h. The comments say 2.5 and 18 h, so they disagree with the code | Every band gets at least +15 µg/m³ and risk 0.20, even for a 2-fire source. The 0.20 risk floor is why the exposed-population high bound jumps to 38 million |
| B2 | [`agent/agent.py:88`](../../agent/agent.py#L88), [`:118–119`](../../agent/agent.py#L118) | Rules plan defaults: ETA `2.0` / `1.0` h, ΔPM2.5 `25.0`, type `stubble_burning`, an invented sentence when there are no sources, ETA clamped to at least 0.5 h, a fixed "until 12:00 PM" | Only some trigger on today's data, but each one breaks the no-invented-values rule |
| B3 | [`models/exposure/rank_sites.py:235`](../../models/exposure/rank_sites.py#L235) | Range = threshold ±0.1 with ×0.75 / ×1.25 | Not a confidence interval; very sensitive to the B1 floor |
| B4 | `data/live/` | `aqi.json` and the derived files (`sources`, `corridor`, `ranked_sites`, `actions`) have no `source` field. `india-boundary.geojson` (a 2,326-point line) has no source, licence or date | Provenance rule not fully met |

**Fine as is:** configuration defaults (bounding boxes, timeouts, retries); site occupancy is left `null` when OSM has no tag (no invented 800 / 150 defaults); tests use small geometric inputs to check maths, which the rules allow.

## What to fix (owner)

1. **Saba:** remove F1–F3, F7–F18 and `PlumeHudCard.tsx`. Each one should show "—", an empty state, or a value computed from the API. Where a value must stay an assumption, label it on screen. Rebase the KPI branch without `?? 1278`
2. **Saba or Aditya:** in the rules plan, stop clamping ETA, say "already inside the corridor" when ETA is 0, use the top source's own fire count, and remove the defaults (B2)
3. **Meenal:** replace "90% CI" with "range", and compute the range in a way that does not depend on the 0.20 floor (F4, B3)
4. **Pritam:** calibrate or clearly mark the corridor constants as assumptions in `params.json`, remove the 15 µg/m³ and 0.20 floors, and add `territory` / `district` to `sources.json` if the UI is to keep those filters (B1, F3, F9)
5. **Aditya:** add `source` to every derived file, record where the boundary file came from (B4), then redeploy the web app and re-run the smoke test
