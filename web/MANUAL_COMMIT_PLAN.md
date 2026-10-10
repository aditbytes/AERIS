# AERIS frontend manual commit plan

Branch: `feature/frontend-audit-heatmap`. Target: `main`. All 80 intended paths are under `web/`: 52 modified tracked files and 28 new files. Each path belongs to exactly one group below. The repository owner performs every staging, commit, push and PR action; none was performed during this review.

## Review before any manual staging

Run from `D:\AERIS`:

```powershell
git branch --show-current
git status --short --untracked-files=all
git diff --stat
git diff --check
git diff -- web
git ls-files --others --exclude-standard
git diff --cached --name-only
```

The branch should be `feature/frontend-audit-heatmap`; the final command should have no output before you start staging. `git diff` and `--stat` omit untracked contents. Review those explicitly using the complete inventory in `FRONTEND_AUDIT.md`, for example:

```powershell
git ls-files --others --exclude-standard | ForEach-Object {
  Write-Output $_
  Get-Content -LiteralPath $_ -Encoding utf8
}
```

## Group boundaries and intermediate states

No file overlaps between groups, so this plan requires no selective hunk staging. Stage only the explicitly listed files for the chosen group when you perform the Git operations yourself. Each listed file includes its complete pending changes. Paths in the lists are relative to the repository root.

Keep group 2 together: nullable PBLH in `schemas.ts` breaks the earlier weather consumer; the compatible weather implementation requires API freshness, context status and the clock hook. Keep group 4 together: its regression file imports calculations, controls, corridor helpers and the actual SVG fallback; both maps consume the same observation/layer hooks. Separating these into partial helper commits would leave an incomplete feature. Group 13 owns the shared cross-view regression file once, after every imported implementation is available.

All 15 cumulative proposed commit states were materialized from HEAD plus their assigned files in ignored local copies. Application, Vite-config and browser TypeScript projects passed at every state: 45 project checks. No Git index or history was created or changed for this verification. The intermediate states were not separately production-built or browser-tested.

The validation commands below run against the complete pending working tree. Before group 13 is committed, its unstaged tests still exercise the implementation locally; that alone does not establish what an isolated commit includes. For an isolated group 1 with no tests yet, `npm.cmd --prefix web test -- --passWithNoTests` is only an infrastructure smoke check, not evidence of passing application tests. Browser scenarios arrive in group 14.

## 1. test(web): add unit and browser test infrastructure

Suggested commit message: `test(web): add unit and browser test infrastructure`.

Purpose: Add development-only unit, browser and accessibility test tools, browser type checking and ignored artifacts.

Dependencies: none. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (7):

```text
web/.gitignore
web/package.json
web/package-lock.json
web/vitest.config.ts
web/src/testSetup.ts
web/playwright.config.ts
web/tsconfig.browser.json
```

Validation from the repository root:

```powershell
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run lint
git diff --check
```

## 2. fix(web): validate scientific feeds and recover refresh failures

Suggested commit message: `fix(web): validate scientific feeds and recover refresh failures`.

Purpose: Validate all six feeds, retain successful results, cancel obsolete requests, revalidate changed bodies, preserve committed freshness, handle nullable wind heights and finite averages.

Dependencies: 1. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (9):

```text
web/src/types/schemas.ts
web/src/services/api.ts
web/src/services/dataContext.tsx
web/src/components/status/useClock.ts
web/src/components/views/WindWeatherView.tsx
web/src/components/views/WindWeatherView.css
web/src/__tests__/dataSchemas.test.ts
web/src/__tests__/dataApi.test.ts
web/src/__tests__/dataContext.test.tsx
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/dataSchemas.test.ts src/__tests__/dataApi.test.ts src/__tests__/dataContext.test.tsx
npm.cmd --prefix web run typecheck
git diff --check
```

## 3. fix(web): escape source popup content and enable keyboard markers

Suggested commit message: `fix(web): escape source popup content and enable keyboard markers`.

Purpose: Escape untrusted feed text, preserve source provenance and enable keyboard source-marker activation.

Dependencies: 1, 2. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (3):

```text
web/src/components/map/html.ts
web/src/components/map/thermalMarker.ts
web/src/components/map/thermalMarker.test.ts
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/components/map/thermalMarker.test.ts
npm.cmd --prefix web run typecheck
git diff --check
```

## 4. feat(web): render observed PM2.5 cells with reliable map lifecycle

Suggested commit message: `feat(web): render observed PM2.5 cells with reliable map lifecycle`.

Purpose: Deliver occupied observed cells, accessible controls, actual fallback geometry, both map integrations, layer restoration, filter-before-limit markers and matching FRP legend boundaries.

Dependencies: 1, 2, 3. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (19):

```text
web/src/App.css
web/src/components/map/heatmap.ts
web/src/components/map/heatmap.test.tsx
web/src/components/map/HeatmapControls.tsx
web/src/components/map/HeatmapControls.css
web/src/components/map/mapData.ts
web/src/components/map/useObservationHeatmap.ts
web/src/components/map/useObservationHeatmap.test.tsx
web/src/components/map/useScientificLayers.ts
web/src/components/map/useScientificLayers.test.tsx
web/src/components/map/mapStyles.ts
web/src/components/map/SvgFallbackMap.tsx
web/src/components/map/MapContainer.tsx
web/src/components/map/MapContainer.css
web/src/components/map/MapExplorerView.tsx
web/src/components/map/MapExplorerView.css
web/src/components/map/MapExplorerView.test.tsx
web/src/components/map/PlumeHudCard.tsx
web/src/components/map/TimeControls.tsx
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/components/map/heatmap.test.tsx src/components/map/useObservationHeatmap.test.tsx src/components/map/useScientificLayers.test.tsx src/components/map/MapExplorerView.test.tsx
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run build
git diff --check
```

## 5. fix(web): preserve zero metrics and disclose observation and scenario limits

Suggested commit message: `fix(web): preserve zero metrics and disclose observation and scenario limits`.

Purpose: Preserve zero readings/counts, disclose missing population, use observation ages and label intervention assumptions.

Dependencies: 2. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (5):

```text
web/src/components/kpi/AqiKpiCard.tsx
web/src/components/kpi/MetricGrid.tsx
web/src/components/kpi/MetricGrid.css
web/src/components/analytics/WhatIfWeAct.tsx
web/src/components/analytics/WhatIfWeAct.css
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "scientific labels and missing/zero data"
npm.cmd --prefix web run typecheck
git diff --check
```

## 6. fix(web): report measured FRP shares and export safe source CSV

Suggested commit message: `fix(web): report measured FRP shares and export safe source CSV`.

Purpose: Use actual FRP shares/rankings and honest candidate/confidence labels, and introduce quoted formula-safe CSV exports with URL cleanup.

Dependencies: 2. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (5):

```text
web/src/components/analytics/SourceBreakdown.tsx
web/src/components/analytics/SourceBreakdown.css
web/src/components/views/FireSourcesView.tsx
web/src/components/views/FireSourcesView.css
web/src/components/views/csv.ts
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "FRP|safe, complete downloads|heuristic confidence"
npm.cmd --prefix web run typecheck
git diff --check
```

## 7. fix(web): expose all facilities and disclose forecast-relative arrival times

Suggested commit message: `fix(web): expose all facilities and disclose forecast-relative arrival times`.

Purpose: Expose the full facility list, correct nullable capacity/risk handling and keyboard map navigation, and leave absolute ETA unavailable without a linked forecast origin.

Dependencies: 2, 6. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (4):

```text
web/src/components/sites/TopAffectedAreas.tsx
web/src/components/sites/TopAffectedAreas.css
web/src/components/views/PopulationRiskView.tsx
web/src/components/views/PopulationRiskView.css
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "population|facilities|capacity|forecast origin|selected facility"
npm.cmd --prefix web run typecheck
git diff --check
```

## 8. fix(web): remove unsupported AQI forecasts and validation claims

Suggested commit message: `fix(web): remove unsupported AQI forecasts and validation claims`.

Purpose: Remove unsupported AQI conversions/skill statistics and disclose limits of modelled analytics.

Dependencies: 2, 6. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (3):

```text
web/src/components/analytics/AqiForecast12h.tsx
web/src/components/views/AnalyticsView.tsx
web/src/components/views/AnalyticsView.css
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "unsupported forecast|validation skill|demographic"
npm.cmd --prefix web run typecheck
git diff --check
```

## 9. fix(web): share snapshot-scoped local recommendation checklists

Suggested commit message: `fix(web): share snapshot-scoped local recommendation checklists`.

Purpose: Use shared snapshot/content checklist identity, storage fallback and accurate local marks without false legal orders or dispatch claims.

Dependencies: 2, 6. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (7):

```text
web/src/components/agent/actionChecklist.ts
web/src/components/agent/AgentWidget.tsx
web/src/components/agent/AgentWidget.css
web/src/components/analytics/RecommendedActions.tsx
web/src/components/analytics/RecommendedActions.css
web/src/components/views/ActionsWorkbenchView.tsx
web/src/components/views/ActionsWorkbenchView.css
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "checklist|boolean checklist|fabricated default marks"
npm.cmd --prefix web run typecheck
git diff --check
```

## 10. fix(web): make recommendation dialogs keyboard accessible

Suggested commit message: `fix(web): make recommendation dialogs keyboard accessible`.

Purpose: Provide dialog semantics, inert background, focus trapping/restoration, Escape support and accurate advisory downloads.

Dependencies: 6, 9. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (2):

```text
web/src/components/agent/ActionsModal.tsx
web/src/components/agent/ActionsModal.css
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "modal"
npm.cmd --prefix web run typecheck
git diff --check
```

## 11. fix(web): make navigation and data status accessible and accurate

Suggested commit message: `fix(web): make navigation and data status accessible and accurate`.

Purpose: Use real search and six-feed status with committed stale metadata, accessible navigation/global contrast, accurate configuration labels and visible mapping credits.

Dependencies: 2, 4, 9. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (8):

```text
web/index.html
web/src/index.css
web/src/components/layout/Header.tsx
web/src/components/layout/Header.css
web/src/components/layout/Sidebar.tsx
web/src/components/layout/Sidebar.css
web/src/components/views/SettingsView.tsx
web/src/components/views/SettingsView.css
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/__tests__/uiRegression.test.tsx -t "search|feed status|corridor status|reload|six feed"
npm.cmd --prefix web run typecheck
git diff --check
```

## 12. fix(web): retain usable views and offer feed and render recovery

Suggested commit message: `fix(web): retain usable views and offer feed and render recovery`.

Purpose: Keep valid/retained feeds usable after partial failure, offer retry, and allow navigation away from failed views.

Dependencies: 2, 11. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (3):

```text
web/src/App.tsx
web/src/components/ErrorBoundary.tsx
web/src/components/ErrorBoundary.test.tsx
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test -- src/components/ErrorBoundary.test.tsx
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run build
git diff --check
```

## 13. test(web): cover scientific labels and dashboard interaction regressions

Suggested commit message: `test(web): cover scientific labels and dashboard interaction regressions`.

Purpose: Cover zero/missing values, corrected scientific labels, ETA/freshness, pagination, checklist/storage, safe exports, search and dialog keyboard interactions.

Dependencies: 2, 5, 6, 7, 8, 9, 10, 11. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (1):

```text
web/src/__tests__/uiRegression.test.tsx
```

Validation from the repository root:

```powershell
npm.cmd --prefix web test
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run lint
git diff --check
```

## 14. test(web): verify real map rendering and accessible browser journeys

Suggested commit message: `test(web): verify real map rendering and accessible browser journeys`.

Purpose: Check all eight views, responsive layouts, recovery, invalid input/XSS, keyboard and axe accessibility, actual WebGL paint/style restoration and fallback geometry.

Dependencies: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (1):

```text
web/tests/browser/dashboard.spec.ts
```

Validation from the repository root:

```powershell
npm.cmd --prefix web run build
npm.cmd --prefix web run test:e2e -- --reporter=list,json
git diff --check
```

## 15. docs(web): document frontend findings and observation heatmap limits

Suggested commit message: `docs(web): document frontend findings and observation heatmap limits`.

Purpose: Record verified findings/results, complete file inventory, scientific limits and the exact ordered manual commit plan.

Dependencies: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14. Intermediate state: coherent when the entire listed group follows its dependencies.

Exact files (3):

```text
web/README.md
web/FRONTEND_AUDIT.md
web/MANUAL_COMMIT_PLAN.md
```

Validation from the repository root:

```powershell
git diff --check
git diff -- web/README.md
Get-Content -LiteralPath web/FRONTEND_AUDIT.md -Encoding utf8
Get-Content -LiteralPath web/MANUAL_COMMIT_PLAN.md -Encoding utf8
git diff --check
```

Browser validation requires the configured installed Edge browser and free local port 4173. External basemap assets are controlled by the tests; a passing local browser suite does not verify live provider availability, remote CI or deployment. See the audit for executed results, warnings and scientific limitations.
