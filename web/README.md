# AERIS frontend

React, TypeScript, Vite, MapLibre GL and Zod power eight views: dashboard, map explorer, fire sources, wind/weather, population risk, analytics, actions workbench and settings. Navigation is local application state, rather than URL routes. There is no implemented authentication or authorization service; local preferences and checklist marks do not authenticate an officer or send an alert.

## Run and verify

From `web/`, with Node and npm installed:

```sh
npm ci
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

On Windows, use `npm.cmd` if PowerShell prevents the npm script shim from running. Browser tests use the installed Microsoft Edge by default and serve the production build on port 4173. Build before running them. Set `AERIS_BROWSER_CHANNEL=chrome` to use an installed Chrome instead. The suite does not download a browser. It tests desktop, mobile and tablet layouts, actual MapLibre WebGL rendering, keyboard journeys and automated axe WCAG checks. External basemap styles, tiles and glyphs are intercepted in tests for reproducibility; normal journeys load the repository's real snapshots. Adversarial test data stays in test files and request interception.

Vitest covers API validation, cancellation and retained-data recovery, UI defects, scientific aggregation, popup escaping, actual fallback geometry and map-layer lifecycle. Backend contracts can be checked separately from the repository root with `python -m pytest pipeline/tests/test_contracts.py`; the broader suite is `python -m pytest -ra -p no:cacheprovider`.

## Runtime data and reliability

The default runtime path reads six captured feeds under `public/data/`: sources, corridor, ranked facilities, actions, wind and AQI. Population availability and estimates come from ranked-facility metadata. Set `VITE_API_BASE_URL` to use the existing live API endpoints instead. See [data contracts](../docs/data-contracts.md) and [the audit](FRONTEND_AUDIT.md). A captured feed is never described as a current observation simply because it was downloaded recently.

Each response undergoes strict JSON/schema validation. Requests time out after 20 seconds; superseded and unmounted refreshes are cancelled. Independent feeds may succeed independently. On failure, the last valid dataset is retained and labelled; initial total failure offers retry. Freshness describes the displayed data and is recalculated against the current clock. Default stale budgets are 90 minutes, or three hours for wind, and are display policies rather than scientific validity thresholds. Unknown or implausible timestamps remain unknown.

## Observed PM2.5 heatmap

Both maps offer **Observed PM2.5 heatmap**, opacity, **Fit observed cells**, a numeric legend and an accessible cell-value table. MapLibre fills occupied 0.1-degree longitude/latitude cells. Each cell shows the arithmetic mean of its available station PM2.5 readings in **micrograms per cubic metre (µg/m³)**. The grid is fixed while panning; the table reports cells intersecting the viewport. Geographic cell area varies with latitude.

The production data path is `ingest/openaq.py` → the AQI JSON contract → `public/data/aqi.json` or the configured API → Zod → observation aggregation → MapLibre GeoJSON fill. Only finite nonnegative values with valid WGS84 coordinates, an explicit-offset observation timestamp, and source provenance participate. Zero is valid. At most one observation contributes per station ID: newest valid observation wins; equal-time duplicates retain the first record. Missing/invalid and duplicate counts are disclosed. No coordinates or readings are invented.

The captured AQI feed contains 60 station records, of which 59 qualify, occupying 28 cells. Their PM2.5 values span 1.1–235 µg/m³. Observation times span September 30 to October 7, 2026; all are stale on the October 9–10 audit dates. The UI reports observation times separately from file capture time and recomputes staleness as the clock advances.

These are **reported station measurements**, potentially taken at different times, aggregated for display. They are not an interpolated pollution field, grid-area concentration, personal exposure, health category or medically validated risk. The numeric color bands are display bins, not regulatory thresholds. No unsampled cell is filled. The source snapshot does not provide averaging intervals, coverage or quality flags sufficient to harmonize measurements. OpenAQ documents [PM2.5 units](https://docs.openaq.org/resources/parameters) and [latest-measurement timing limitations](https://docs.openaq.org/resources/latest).

## Scientific and operational limits

- Source candidates remain candidates. FRP, relative source strength and confidence do not prove causal attribution.
- Plume corridors, band peaks, ETA and facility/population rankings are model outputs with documented calibration limits. Band peaks are not uniform receptor concentrations. Time controls reveal cumulative forecast-relative bands; full centrelines and ETA markers remain visible as complete forecast context. Facility ETA remains relative: the ranked feed does not link its originating forecast, so absolute arrival is unavailable. File generation time is not a forecast origin.
- Station observations are separate from the model. There is no supported AQI forecast, historical validation statistic, clinical exposure estimate or measured intervention effectiveness. Unavailable data stays unavailable.
- Intervention percentages are explicit scenario assumptions. Local checklists record local planning marks; no dispatch, legal order or notification is sent.
- Facility capacities are not measured attendance or clinical occupancy. Population estimates depend on ranked-facility metadata and its availability flag.
- If WebGL is unavailable, the static WGS84 overview draws actual feed geometry and occupied cells, with explicit interaction limits and a disclosed first-12 facility limit. It does not draw a decorative substitute plume.
- Runtime basemaps, glyphs and fonts require their existing external services; their credits remain visible. No new paid mapping service, key or runtime dependency was introduced.

An exposure-concentration heatmap requires calibrated spatial receptor concentrations, compatible observation intervals/quality information, and adequate spatial/temporal coverage. The frontend cannot supply these missing scientific inputs. Implementation and verification details, remaining warnings and the complete changed-file inventory are recorded in [FRONTEND_AUDIT.md](FRONTEND_AUDIT.md).

The changes remain unstaged for owner review. [MANUAL_COMMIT_PLAN.md](MANUAL_COMMIT_PLAN.md) lists 15 ordered commit groups, exact files, dependencies and validation commands. The complete groups keep nullable wind contracts with their compatible consumer and keep the observation heatmap with its controls, map integrations and regression dependencies.
