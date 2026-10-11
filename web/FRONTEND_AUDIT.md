# Frontend audit and observed PM2.5 heatmap

## Submission-readiness verification — October 10, 2026

This section records the submission-readiness verification baseline at HEAD `6944291`, followed by the approved commit sequence on `feature/submission-readiness`. The original audit and inventory below describe their earlier scope and are retained as historical evidence. The submitted scope is in [submission readiness](../docs/submission/READINESS.md) and the [exact change inventory](../docs/submission/CHANGE_INVENTORY.json), which separately counts local-only exclusions.

The browser now verifies exact-byte model provenance in snapshot mode, while API mode preserves server-computed metadata. All eight views disclose the ten-source archive, obsolete corridor floors, unknown original bindings and uncalibrated peak/risk semantics. Reported station AQI is separate from an official averaging-period-verified AQI claim. Usable hourly wind coverage is separate from successful grid requests. Advisory schedules retain their declared forecast-relative reference or explicitly unknown reference in UI and exports; they are not countdowns or operational instructions.

Browser testing reproduced a heatmap mount-order defect: the hook ran before map construction and missed the initial load event. The correction attaches after mount effects while retaining the original load guard and listener cleanup; the existing initial-load regression remains intact. Both heatmap legend and cell table now support keyboard focus and scrolling. Tests retain actual WebGL paint, visibility filtering, layer removal/restoration, XSS and missing/zero coverage.

Final actual checks: **179 Vitest tests passed in 15 files**, three TypeScript configurations passed, lint passed with the same seven warnings, production Vite build passed, and **30 Edge browser tests passed** with zero axe violations in the tested views/dialog/heatmap journeys. Node was 24.16.0 and final Edge was 155.0.4283.45. The broader Python suite passed **701 tests with two environment warnings** on Windows Python 3.14.3. Commands, exit codes, temporary evidence locations and limitations are recorded in [VERIFICATION.json](../docs/submission/VERIFICATION.json).

Original pre-commit validation kept build/browser output and caches outside the repository. The approved commit-group checks also ran normal npm commands, producing ignored local artifacts; none were staged. Browser tests intercept basemap assets and optional font CSS, use the system-font fallback and normal real atmospheric captures; they do not verify external asset availability. Preview-server cleanup needed explicit Windows process termination in this managed session, as recorded in the verification report. Scientific parameters and equations, captured snapshots, original hardcoded-data audit reports, the stash and CI workflows remain unchanged. Remote CI, live-feed behavior, Linux ARM64 packaging, AWS deployment and scientific calibration are not claimed verified.

## Original frontend audit

Audit dates: October 9–10, 2026. Actual branch: `feature/frontend-audit-heatmap`; starting HEAD: `f5e4689d59b410d3621bb65ac6f3f35b896faa4d`. The original implementation started with a clean working tree; the manual-commit review began with 78 pending paths and no staged files. All implementation changes are confined to `web/`.

## Scope and baseline

Reviewed the complete frontend source, styles, configuration, assets and six runtime snapshot paths, and traced their contracts through ingestion, pipeline validation and model documentation. The stack is React 19, TypeScript, Vite, Zod and MapLibre GL, with Lucide icons. There are eight state-selected views, no URL router, and no implemented identity, authorization or dispatch backend. Existing lazy view loading and the mapping framework were preserved.

The initial dependency installation, lint and production build passed. Lint already emitted warnings and the main bundle exceeded Vite's 500 kB warning threshold. No frontend unit or browser test suite existed. Browser checks reproduced accessibility defects and scientific layers disappearing during basemap changes.

| Area / journey | Audit and verification |
| --- | --- |
| Dashboard and shared navigation | Initial load, loading/error/retry, partial feed retention, all eight views, global search, sidebar expansion, data status, keyboard names, viewport overflow |
| Map explorer and dashboard map | Longitude/latitude, bounds, source/site/station markers, popup text, basemap replacement, forecast-relative bands, layer toggles, actual geometry fallback, observed cells, canvas visibility |
| Fire sources | Actual FRP totals/shares and zero values, territory availability, search/filtering, source-candidate and confidence labels, export |
| Wind/weather | Nullable PBLH, actual forecast timestamps and vectors, unavailable wind/rose states, model provenance |
| Population risk | Availability flag, real metadata estimates, zero values, capacity caveats, facility links, no fallback population |
| Analytics | No supported AQI forecast or historical skill statistic, observed data separated from model outputs, explicit unavailable states |
| Actions workbench and recommendations | Feed-derived advice, snapshot-relative deadlines, checklist identity/persistence, keyboard dialog, CSV quoting/formula protection, no dispatch claims |
| Settings | Actual data mode and freshness, local state clearing, reload, honest absence of authenticated officer and backend configuration controls |
| API/context/contracts | Strict parsing, body-aware cache, request timeout/cancellation, independent feed recovery, retained data, atomic freshness, UTC timestamps, invalid geometry/coordinate rejection |
| Shared styles/accessibility | Desktop 1440×1000, mobile 390×844, tablet 768×1024, visible focus, control labels, modal focus trap/restoration, text contrast and reduced-motion behavior |

## Confirmed defects and fixes

No critical defect was established. Severity reflects incorrect scientific/operational conclusions, loss of functionality, or accessibility impact. Findings were established through code inspection, regression tests, and browser reproduction where applicable; speculative concerns were not classified as confirmed defects.

| Severity | Confirmed problem | Implemented correction / regression |
| --- | --- | --- |
| High | Fabricated AQI forecast multipliers, `R² = 0.88`, wind/PBLH/rose values, population defaults and FRP percentages appeared as scientific results | Removed unsupported results; calculate supported summaries from real fields and show explicit unavailable states. Data and UI regressions cover empty and zero-valued inputs. |
| High | Invented legal orders, recent notifications, authenticated-officer and dispatch claims implied implemented operations | Use actual feed status and local planning checklist semantics. Marked actions send no alerts, legal orders or dispatch requests. |
| High | A changed invalid body with the same `generated_at` could reuse prior validation; snapshot capture and observation freshness were conflated | Cache exact serialized payloads, validate changed bodies, calculate displayed-feed freshness against the wall clock, and show actual station observation age separately. |
| High | API text interpolated into map popup HTML could become executable markup | Escape feed strings, keep marker attributes under DOM control, and verify adversarial text remains text in the real popup. |
| Medium | One failed feed hid all valid data; competing refreshes could replace state; request handling lacked bounded cancellation | Independent settled results, last-valid retention, per-feed failure labels/retry, 20-second timeouts, superseded/unmount abort, and StrictMode regression coverage. |
| Medium | Fast replacement responses could change global freshness before retained datasets were committed | Freshness now belongs to displayed dataset objects, including server-stale metadata. A pending-feed/minute-clock regression verifies old data stays stale until replacement commits. |
| Medium | Basemap style replacement erased corridor/ETA layers; duplicate initial style replacement raced scientific layers; map polling/listeners could outlive views | Preserve the constructor's initial style, use full replacement for intentional basemap switches, and rehydrate current scientific data on style load. Clean up listeners and remove disabled sources/layers. Tests cover actual workers and WebGL rendering as well as unit lifecycle behavior. |
| Medium | Expanded observation controls collapsed/clipped the dashboard map canvas in fixed-height cards | Allow the map row to grow and retain a 260 px canvas minimum; browser regression checks actual canvas size and painted observation pixels. Static fallback notes and geometry have a proper column layout. |
| Medium | Null PBLH, invalid coordinates/geometries/timestamps and zero values caused rejection, crashes or misleading missing-data states | Accept the documented nullable PBLH, preserve zero, reject finite/range/time/structural contract violations, and retain valid prior results on malformed refreshes. |
| Medium | Static fallback drew decorative geometry, and displayed marker subsets were not disclosed | Draw actual feed polygons/centrelines/cells with WGS84 projection; disclose first-12 fallback facilities and dashboard/explorer marker caps. Full facility tables remain available. |
| Medium | Facility pagination stopped at row 50; CSV escaping/storage/checklist identity were unreliable | Full-list pagination, correct nullable capacity formatting, quoted CSV with formula neutralization and URL cleanup, snapshot/content-scoped checklist IDs, safe storage fallback and accurate counts. |
| Medium | Clickable divs, nested interactive content, unnamed controls, modal focus and low contrast blocked accessible use | Native controls and semantic lists, explicit labels, Escape handling, modal focus trap/restoration, and audited contrast. No axe rule exclusions or weakened checks. |
| Low | Missing favicon, obsolete MapLibre 4 CSS alongside version 6, absent satellite glyph configuration, truncated AQI labels, overlapping map legend/credits and projection labels misleadingly promising a globe | Use the existing favicon, bundled version-matched map CSS and glyphs, wrap the AQI labels, reserve map attribution space, and label Mercator tilt as tilted satellite. Preserve mapping credits. |

The manual-commit review independently inspected the complete pending implementation and identified these additional defects:

| Severity | Confirmed problem | Correction and regression |
| --- | --- | --- |
| High | Facility cards treated ranked-file generation time as the ETA forecast origin. Actual captures differ by approximately 32 hours 5 minutes. | Display forecast-relative ETA and unavailable absolute arrival. The ranked feed does not link its originating forecast, so neither publication time nor an independently fetched corridor is assumed to provide that link. The regression changes publication time and verifies no fabricated absolute arrival. |
| Medium | Explorer capped the first 12 facilities before applying school/hospital visibility, hiding every later hospital when earlier schools were hidden (and vice versa). | Filter type visibility before the marker cap. Two regressions exercise actual component marker creation, toggling and unmount cleanup; both failed before the fix and pass afterward. |
| Medium | Settings and wind views ignored the server-stale metadata retained by context/Header; Settings also omitted corridor from its five-feed list. | Honor committed stale statuses and list all six feeds. UI regressions cover recently generated but server-marked stale data. |
| Medium | Source confidence was still described as a VIIRS quality flag, candidate clusters as major plumes and land use as agricultural. | Use captured thermal detections, source candidate clusters and explicitly uncalibrated heuristic confidence. A regression forbids the unsupported labels. |
| Low | Mean AQI could overflow when summing individually finite valid readings. | Use an incremental mean; the boundary regression preserves a finite mean without arbitrary schema bounds. No real measurement was changed. |
| Low | The FRP legend assigned exactly 200 MW to a different tier than the marker classifier. | Match the legend to ≥200, 50–<200 and <50 MW display tiers, with an actual marker-classifier/legend regression. |
| Medium | A heatmap toggle during a pending source load skipped synchronization because `isStyleLoaded()` waits for source/tile completion after one-time load events have fired. | Check initialized stylesheet availability with public `getStyle()` and retain load/style-load restoration. A deterministic pending-source regression failed before the fix; enable, opacity and horizon changes now apply without polling or a data-event feedback loop. |
| Low | Browser canvas screenshots included overlaid DOM marker colors, compromising pixel evidence. | Hide DOM markers solely during canvas measurement. A test-only overlay on the same disabled-heatmap canvas yields 4,096 apparent palette pixels in an ordinary screenshot versus zero in the corrected measurement; positive painting and removal assertions remain strict. |

Five added/corrected root regression cases failed before the corresponding corrections (40 passed, 5 failed); the two facility-filter cases also failed before their fix. Final executed results are recorded below. The tests use explicitly isolated cases, with no synthetic measurement path added to production.

## Heatmap meaning and provenance

The implemented feature is an **observed station PM2.5 heatmap**, fully connected to the real AQI runtime path, in both existing maps. It uses occupied **0.1° longitude/latitude cells**, each coloured by the **arithmetic mean of participating station PM2.5 readings, µg/m³**. It is a filled observation aggregation grid, without kernel smoothing, interpolation or invented samples. Geographic cell area varies by latitude.

Trace: `ingest/openaq.py` → AQI publication contract → `web/public/data/aqi.json` or `VITE_API_BASE_URL` `/aqi` → Zod → aggregation → MapLibre GeoJSON fill. The six captured frontend feeds are sources, corridor, ranked facilities, actions, AQI and wind. Population estimates and availability are ranked-facility metadata.

Qualification requires a finite nonnegative value (including zero), valid WGS84 position, real explicit-offset timestamp not implausibly in the future, and source provenance. One reading contributes per station ID: newest valid observation wins; equal-time duplicates retain the first record. The incremental mean avoids overflow from summing individually finite nonnegative values. Rejected and duplicate counts are disclosed. Cells retain observation range, station count, sources, station names and stale count.

The unchanged captured AQI file has 60 records: **59 qualifying PM2.5 observations, 28 occupied cells, 1 excluded missing value**, range **1.1–235 µg/m³**. Observations span **2026-09-30T18:58:57Z to 2026-10-07T08:00:00Z**, while capture time is **2026-10-07T18:58:03.921942Z**. All 59 are stale on the audit dates. OpenAQ is the reported provenance. Units follow the ingestion contract and [OpenAQ parameter documentation](https://docs.openaq.org/resources/parameters); [OpenAQ latest measurements](https://docs.openaq.org/resources/latest) explains observation timing and coverage limitations.

Users can toggle the layer, set 20–100% opacity, fit actual observed bounds, inspect numeric legend bins and access a viewport-aware value table. Occupied cells remain fixed while panning. Loading, empty, malformed, failed/retained and stale inputs are explicit. Normal markers/corridors remain independent. Turning the layer off removes its layer and source; style changes restore populated scientific layers. The map keeps its existing South Asia bounds. A noninteractive fallback renders actual geometry with disclosed limits.

**Scientific limits:** mixed-time station means are not area concentrations, continuous receptor fields, health categories or personal exposure. Observation averaging intervals, coverage and quality flags are unavailable. Display stale budgets and colour bins are interface policies, not regulatory criteria. Source candidates and heuristic confidence do not confirm causal pollution attribution. Model band peaks are not uniform receptor concentrations. Time controls show cumulative bands; complete centrelines/ETA markers remain forecast context. Plume, facility and population outputs remain uncalibrated, and no validation skill is claimed.

An exposure-concentration heatmap remains unavailable because calibrated receptor fields, compatible measurement intervals/quality information and adequate spatial/temporal coverage are missing. No model equations, training data or captured observations were altered to imitate that capability.

## Verification

Frontend environment: Node **24.16.0**, npm **11.13.0**, Vite **8.3.3**, Vitest **5.0.3**, Playwright **1.64.0**, installed Edge **154.0.4258.62**. Tests run against the built app; browser basemap assets are intercepted solely to remove external-service availability from the checks. Normal atmospheric-data journeys use the six actual snapshots. Boundary/security cases use test-only interception; no production fixture path was added.

| Executed command | Result |
| --- | --- |
| `npm.cmd test -- --reporter=dot` | **119 passed**, 10 files, 3.05 seconds |
| `npm.cmd run typecheck` | Passed: application build type checking and separate browser test TypeScript project |
| `npm.cmd run lint` | Exit 0, **7 warnings**, no errors; no lint rules disabled |
| `npm.cmd run build` | Passed: Vite 8.3.3, 2,054 modules; large chunk warning remains |
| `npm.cmd run test:e2e -- --reporter=list,json --output=test-results/browser-release-review` | **26 passed**, 78.039 seconds; **0 skipped, 0 unexpected, 0 flaky**. Desktop/mobile runs include tablet journeys, actual canvas pixels and style restoration. **20 axe analyses, 0 violations**, with no rule exclusions. JSON report: `test-results/browser-release-review.json`. |
| `python -m pytest -ra -p no:cacheprovider --basetemp $backendQaBase` from repository root, with a fresh ignored workspace directory | **570 passed**, **2 warnings**, 20.83 seconds; includes pipeline contracts and all existing modeling/packaging tests |
| `git diff --check` | Passed; Git emitted Windows LF-to-CRLF checkout warnings |
| Added-file whitespace checks against `NUL` with `git diff --no-index --check` | All **28 untracked files** checked; no whitespace errors. Exit 1 is the expected added-file difference; whitespace errors set a separate failure status. |
| Cumulative commit-state TypeScript checks in isolated ignored copies | **15 states × 3 projects = 45 checks passed**, without staging or changing Git history. Intermediate states were not separately production-built or browser-tested. |

Browser evidence is retained locally under ignored `web/test-results/browser-release-review/`, with `web/test-results/browser-release-review.json`, screenshots for all eight views, enabled observed-heatmap canvas screenshots and actual-geometry fallback screenshots. Screenshots were captured from the running app and inspected. Basemap backgrounds in these checks are test-controlled; reported observations, corridor geometry and normal data feeds remain real. The pixel-contamination proof adds an explicitly test-only DOM overlay after the real observation layer is removed, without changing scientific sources or measurements.

Failures during this review were retained in the conclusions: the first full browser run had **25 passed / 1 mobile failure** at canvas painting; the next had **25 passed / 1 desktop failure** because the observation source never reached its worker. The latter established the pending-source lifecycle race through code inspection and a deterministic failing regression. The precise cause of the first transient pixel failure was not independently reproduced; it is not attributed conclusively to DOM obstruction. Targeted desktop/mobile WebGL checks then passed, followed by the full final **26-pass** run. No retries, skips, relaxed pixel thresholds or accessibility exclusions were introduced.

The first backend run had **454 passed / 116 setup errors / 1 warning**, because the sandbox could not access the existing system `pytest-of-LENOVO` directory. The successful rerun used a newly generated directory beneath ignored `web/test-results/`, without deleting an existing directory or modifying tests. An attempted isolated browser rerun also hit EPERM while cleaning the shared output folder; subsequent browser checks used separate output directories and retained backend artifacts.

Backend interpreter: `C:\Users\LENOVO\AppData\Local\Programs\Python\Python314\python.exe`, **Python 3.14.3**, pytest **9.0.3**. The previous temporary Python 3.12.10 environment no longer has runnable pytest installed, so this task does **not** claim Python 3.12 backend validation. Warnings concern the installed requests/urllib3/chardet/charset_normalizer combination and joblib's unavailable physical-core discovery command. Backend dependency manifests were not changed for this frontend task.

The final build's main chunk is **1,356.09 kB minified / 379.63 kB gzip**; MapLibre's separate worker is **508.31 kB**. Vite's warning remains visible. No performance gain is inferred from bundle splitting or changed numbers. Established lifecycle corrections remove unbounded polling and clean up subscriptions, markers, ResizeObservers and timers. Aggregation is memoized for actual 59-reading/28-cell data, with a minute stale clock; no general large-network scalability claim is made. Explicit basemap switches perform full style replacement for reliable layer rehydration, trading source reuse for correctness on this infrequent user action.

## Remaining limits and repository protection

- Browser coverage is installed Windows Edge with software WebGL, plus desktop/mobile/tablet viewports; it does not establish Safari, physical mobile GPU or full screen-reader compatibility. Automated axe checks supplement keyboard journeys and visual inspection; they do not certify every accessibility requirement.
- Basemap tile/style/font availability is external. Test interception establishes frontend scientific rendering without claiming live provider availability.
- No live API integration, remote CI, AWS build or deployment was executed or claimed for this frontend task.
- Lint warnings concern Fast Refresh helper exports, intended current-request cleanup and map-constructor fallback state handling. The Vite chunk-size, local Python environment and Playwright terminal-color warnings remain visible.
- Unsupported forecasting/validation/exposure/dispatch capabilities are disclosed in the product. Backend scientific inputs, rather than frontend approximation, are required to enable them.
- A SHA-256 check of **196 protected tracked files** found no changed bytes, including captured snapshots and files outside `web/`. Starting HEAD, branch and index were unchanged, with no staged files. Subsequent read-only checks found no changes outside `web/` or to public data. AQI remains byte-identical to `data/live/aqi.json`, SHA-256 `d94e8234ce56fec586fb09fba364732174a8649d4fbac314b3776dae0962b09c`. Existing Windows snapshot CRLF differs from Git's LF blobs; comparing Git blobs did not trigger any normalization or writes to snapshots. Two CSS files with accidental newline-only edits were returned to their original checkout form and have no pending change. No Git operation that stages, commits, pushes, merges, switches branches or changes a PR was performed.

Added dependencies are **development only**: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, and `@axe-core/playwright`. Existing runtime dependencies were preserved. Dependency installation reported zero vulnerabilities; no remote security certification is implied.

## Complete changed-file inventory

All files below have been reviewed in the final change set. Build, browser and dependency artifacts are ignored; none is staged.

**80 files total: 52 modified tracked files and 28 new untracked files.** [MANUAL_COMMIT_PLAN.md](MANUAL_COMMIT_PLAN.md) assigns every path once to 15 ordered groups, with exact files, purposes, dependencies and validation commands. No selective staging is needed. Contract/weather compatibility, complete map integration and shared cross-view tests are kept together where dependencies require it.

### Modified tracked files

52 files:

```text
web/.gitignore
web/README.md
web/index.html
web/package-lock.json
web/package.json
web/src/App.css
web/src/App.tsx
web/src/components/agent/ActionsModal.css
web/src/components/agent/ActionsModal.tsx
web/src/components/agent/AgentWidget.css
web/src/components/agent/AgentWidget.tsx
web/src/components/analytics/AqiForecast12h.tsx
web/src/components/analytics/RecommendedActions.css
web/src/components/analytics/RecommendedActions.tsx
web/src/components/analytics/SourceBreakdown.css
web/src/components/analytics/SourceBreakdown.tsx
web/src/components/analytics/WhatIfWeAct.css
web/src/components/analytics/WhatIfWeAct.tsx
web/src/components/kpi/AqiKpiCard.tsx
web/src/components/kpi/MetricGrid.css
web/src/components/kpi/MetricGrid.tsx
web/src/components/layout/Header.css
web/src/components/layout/Header.tsx
web/src/components/layout/Sidebar.css
web/src/components/layout/Sidebar.tsx
web/src/components/map/MapContainer.css
web/src/components/map/MapContainer.tsx
web/src/components/map/MapExplorerView.css
web/src/components/map/MapExplorerView.tsx
web/src/components/map/PlumeHudCard.tsx
web/src/components/map/SvgFallbackMap.tsx
web/src/components/map/TimeControls.tsx
web/src/components/map/mapStyles.ts
web/src/components/map/thermalMarker.ts
web/src/components/sites/TopAffectedAreas.css
web/src/components/sites/TopAffectedAreas.tsx
web/src/components/views/ActionsWorkbenchView.css
web/src/components/views/ActionsWorkbenchView.tsx
web/src/components/views/AnalyticsView.css
web/src/components/views/AnalyticsView.tsx
web/src/components/views/FireSourcesView.css
web/src/components/views/FireSourcesView.tsx
web/src/components/views/PopulationRiskView.css
web/src/components/views/PopulationRiskView.tsx
web/src/components/views/SettingsView.css
web/src/components/views/SettingsView.tsx
web/src/components/views/WindWeatherView.css
web/src/components/views/WindWeatherView.tsx
web/src/index.css
web/src/services/api.ts
web/src/services/dataContext.tsx
web/src/types/schemas.ts
```

### New untracked files

28 files:

```text
web/FRONTEND_AUDIT.md
web/MANUAL_COMMIT_PLAN.md
web/playwright.config.ts
web/src/__tests__/dataApi.test.ts
web/src/__tests__/dataContext.test.tsx
web/src/__tests__/dataSchemas.test.ts
web/src/__tests__/uiRegression.test.tsx
web/src/components/ErrorBoundary.test.tsx
web/src/components/ErrorBoundary.tsx
web/src/components/agent/actionChecklist.ts
web/src/components/map/HeatmapControls.css
web/src/components/map/HeatmapControls.tsx
web/src/components/map/MapExplorerView.test.tsx
web/src/components/map/heatmap.test.tsx
web/src/components/map/heatmap.ts
web/src/components/map/html.ts
web/src/components/map/mapData.ts
web/src/components/map/thermalMarker.test.ts
web/src/components/map/useObservationHeatmap.test.tsx
web/src/components/map/useObservationHeatmap.ts
web/src/components/map/useScientificLayers.test.tsx
web/src/components/map/useScientificLayers.ts
web/src/components/status/useClock.ts
web/src/components/views/csv.ts
web/src/testSetup.ts
web/tests/browser/dashboard.spec.ts
web/tsconfig.browser.json
web/vitest.config.ts
```
