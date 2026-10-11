# Hardcoded-data tally by documented contributor work

Date: 2026-10-10. Repository: D:/AERIS. Revision: 7cf0572049d69b550cbb42d7e74cf5472d521793.
Branch: feature/frontend-audit-heatmap.

This report reuses the completed audit. It maps its 352 current finding groups to documented responsibilities and recorded work. No new source scan, Git-introduction analysis, public-fork review or identity investigation was performed.

The mapping describes work areas, not proof that a person wrote, introduced or caused a finding. Names follow the work-brief headings; original Git labels remain unchanged in separate CSV comparison fields.

## Reconciled totals

Contributor rows are exclusive. Shared groups have their own row and count once in the project total. Affected files are distinct within each row but overlap between rows; their sum is not the project file count.

| Work area / bucket | Groups | Reviewed / residual | Literal occurrences | Affected files | Defects | Risks | Intentional | High defects | High risks |
|---|---|---|---|---|---|---|---|---|---|
| Aditya | 79 | 54 / 25 | 2,358 | 32 | 0 | 8 | 71 | 0 | 1 |
| Pritam | 41 | 23 / 18 | 4,338 | 24 | 0 | 7 | 34 | 0 | 2 |
| Meenal | 57 | 38 / 19 | 3,118 | 26 | 7 | 17 | 33 | 2 | 5 |
| Saba | 161 | 105 / 56 | 10,671 | 101 | 4 | 17 | 140 | 3 | 2 |
| Shared | 8 | 4 / 4 | 221 | 4 | 0 | 1 | 7 | 0 | 0 |
| Unassigned | 6 | 3 / 3 | 123 | 4 | 0 | 1 | 5 | 0 | 0 |
| Out of scope | 0 | 0 / 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Project total | 352 | 227 / 125 | 20,829 | 188 unique | 11 | 51 | 290 | 5 | 10 |

**Meenal documented work has the most confirmed defects (7) and High-severity potential risks (5). Saba documented work has 4 confirmed defects, including 3 High-severity defects.** These are responsibility-area counts, not conclusions about introduction, personal fault or contribution quality. Literal volume includes routine UI strings, configuration and tests; it is not a defect ranking.

### Shared participation, separately disclosed

Inclusive figures below add each applicable shared group in full. They overlap and must not be summed as a project total. Use the exclusive table and reconciliation rows as the project ledger.

| Contributor | Exclusive groups | Shared participation groups | Inclusive groups | Shared participation literals | Inclusive literals |
|---|---|---|---|---|---|
| Aditya | 79 | 8 | 87 | 221 | 2,579 |
| Pritam | 41 | 7 | 48 | 220 | 4,558 |
| Meenal | 57 | 3 | 60 | 34 | 3,152 |
| Saba | 161 | 3 | 164 | 34 | 10,705 |

## Method and supporting documentation

Inputs: [FINDINGS.csv](../FINDINGS.csv), [CONTRIBUTOR_ATTRIBUTION.csv](../CONTRIBUTOR_ATTRIBUTION.csv), [FILE_INVENTORY.csv](../FILE_INVENTORY.csv), [DATA_PROVENANCE.md](../DATA_PROVENANCE.md), [EXECUTIVE_SUMMARY.md](../EXECUTIVE_SUMMARY.md), [METHODOLOGY.md](../METHODOLOGY.md), [METRICS.json](../METRICS.json), [DATASET_INVENTORY.json](../DATASET_INVENTORY.json), [IGNORED_ARTIFACTS.json](../IGNORED_ARTIFACTS.json), [HISTORICAL_FINDINGS.csv](../HISTORICAL_FINDINGS.csv), and the existing literal-position inventory for original group granularity.

Broad assignments: [docs/work-split.md](../../../../work-split.md):9-16,39-71. The briefs are plans, not independently verified completion claims. Specific recorded work takes precedence over generic folders. Handoffs/imports alone do not make every finding shared.

| Contributor | Documented area | Supporting documents |
|---|---|---|
| Aditya | AWS, storage/secrets, Lambda packaging, API, pipeline, deployment and verification | [docs/members/aditya-aws.md](../../../../members/aditya-aws.md):25-86; [docs/aditya's_work/README.md](../../../../aditya's_work/README.md):18-28; [docs/audit/aditya-work-done.md](../../../../audit/aditya-work-done.md):28-58 |
| Pritam | Detection, plume/calibration, geo helpers, optional ML, sources/corridor and model tests | [docs/members/pritam-models.md](../../../../members/pritam-models.md):11-26,38-103; [models/README.md](../../../../../models/README.md):224-239; [docs/data-contracts.md](../../../../data-contracts.md):67-101 |
| Meenal | Raw ingestion, HTTP/time helpers, snapshot README, population and exposure/ranking | [docs/members/meenal-data-exposure.md](../../../../members/meenal-data-exposure.md):7-31,44-109; [docs/data-contracts.md](../../../../data-contracts.md):14-64,103 |
| Saba | Local action agent/tools/prompts, agent review output, UI/observed heatmap, browser assets and tests | [docs/members/saba-agent-ui.md](../../../../members/saba-agent-ui.md):7-32,38-81,97-102; [docs/data-contracts.md](../../../../data-contracts.md):130 |

Every original ID appears once in FINDING_TO_WORK_MAPPING.csv. File/line, category, severity, status, reachability, provenance, counts and Git evidence are preserved. Evidence documents use repository-relative paths and exact line spans.

High mapping confidence means an explicit folder/output/feature assignment or named implementation. Medium means a functional packaging association or an inseparable mixed/residual scope overlap. Unassigned means documentation does not establish an owner. This confidence applies only to work mapping; it does not strengthen scientific evidence or residual semantic coverage.

No finding was split, merged, reclassified or dropped. No owner was inferred from a branch, author name or blame. Automated residual groups remain residual groups, not individually verified scientific declarations.

## Categories, severity and reachability

| Bucket | A: Operational and scientific data | B: Synthetic, mock and demonstration data | C: Scientific assumptions and business logic | D: Defaults and configuration | E: UI and static reference data | F: Sensitive-configuration risks |
|---|---|---|---|---|---|---|
| Aditya | 0 | 17 | 2 | 55 | 5 | 0 |
| Pritam | 3 | 12 | 22 | 2 | 2 | 0 |
| Meenal | 9 | 14 | 8 | 23 | 2 | 1 |
| Saba | 4 | 16 | 10 | 56 | 75 | 0 |
| Shared | 0 | 2 | 1 | 5 | 0 | 0 |
| Unassigned | 1 | 0 | 0 | 5 | 0 | 0 |
| Out of scope | 0 | 0 | 0 | 0 | 0 | 0 |
| Project total | 17 | 61 | 43 | 146 | 84 | 1 |

| Bucket | Critical | High | Medium | Low | Informational |
|---|---|---|---|---|---|
| Aditya | 0 | 1 | 5 | 3 | 70 |
| Pritam | 0 | 2 | 5 | 0 | 34 |
| Meenal | 0 | 7 | 16 | 1 | 33 |
| Saba | 0 | 5 | 10 | 12 | 134 |
| Shared | 0 | 0 | 1 | 0 | 7 |
| Unassigned | 0 | 0 | 1 | 0 | 5 |
| Out of scope | 0 | 0 | 0 | 0 | 0 |
| Project total | 0 | 15 | 38 | 16 | 283 |

| Bucket | Runtime | Test-only | Development-only | Artifact-only | Unknown |
|---|---|---|---|---|---|
| Aditya | 35 | 17 | 25 | 2 | 0 |
| Pritam | 17 | 9 | 14 | 1 | 0 |
| Meenal | 39 | 13 | 4 | 1 | 0 |
| Saba | 137 | 15 | 7 | 2 | 0 |
| Shared | 4 | 3 | 1 | 0 | 0 |
| Unassigned | 3 | 0 | 3 | 0 | 0 |
| Out of scope | 0 | 0 | 0 | 0 | 0 |
| Project total | 235 | 57 | 54 | 6 | 0 |

These are unchanged audit labels. Runtime means reachable in normal application configuration, not verified AWS execution. Some residual groups describe mixed files; this tally preserves original labels rather than repeating reachability analysis. Test/development values are not fabricated production data merely because they contain literals.

## Declarations, datasets and selected hardcoding measures

Distinct individual declarations were not enumerated in the existing audit; that totals CSV field is blank with a note. The 227 reviewed groups mix declarations, datasets and policies. The 125 residual groups collect remaining source literals by file. Neither count is an individual-declaration total.

Distinct named datasets are supported for ten canonical data/live files plus one ignored simulated ML dataset. This scope does not exhaust generated fixtures or model/report artifacts. Seven byte-identical browser copies and 49 Lambda staging copies add no unique observations or source literals. Metadata, evaluation reports and pickle are separate artifacts, not more observation datasets.

| Bucket | Canonical live datasets | Ignored simulated datasets | Distinct dataset files in measured scope |
|---|---|---|---|
| Aditya | 0 | 0 | 0 |
| Pritam | 2 | 1 | 3 |
| Meenal | 6 | 0 | 6 |
| Saba | 1 | 0 | 1 |
| Shared | 0 | 0 | 0 |
| Unassigned | 1 | 0 | 1 |
| Out of scope | 0 | 0 | 0 |
| Project total | 10 | 1 | 11 |

Meenal canonical files: fires.json, aqi.json, wind.json, sites.geojson, population.json and ranked_sites.json. Pritam: sources.json and corridor.geojson plus the ignored simulated dataset. Saba: actions.json. The canonical india-boundary.geojson remains unassigned. A capture timestamp does not establish observation recency, calibration or reference licensing.

Selected row-field sums below reproduce the audit lower bounds. They are not disjoint quantities to add together. Records mix population cells, forecasts, derived outputs, simulated labels, fixtures and reference lists; they are not independent pollution observations. Coordinates include ring closures. Zero means not separately quantified, not proof of absence. Mapping CSV preserves unmeasured_count_fields.

| Bucket | Constants | Heterogeneous records | Coordinates | Endpoints | Thresholds | Mock families | Synthetic dataset/fixture families | Static output fields |
|---|---|---|---|---|---|---|---|---|
| Aditya | 258 | 7 | 0 | 16 | 40 | 2 | 2 | 6 |
| Pritam | 79 | 11,302 | 861 | 0 | 57 | 0 | 6 | 104 |
| Meenal | 50 | 242,177 | 226,981 | 6 | 19 | 9 | 3 | 1,337 |
| Saba | 146 | 172 | 28 | 17 | 47 | 0 | 10 | 3 |
| Shared | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Unassigned | 17 | 1 | 2,326 | 0 | 0 | 0 | 0 | 1 |
| Out of scope | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Project total | 585 | 253,659 | 230,196 | 39 | 163 | 11 | 21 | 1,452 |

## Findings within each documented work area

### Aditya

Specific Bedrock, storage/secrets and pipeline work records override generic agent/ingest assignments. New Lambda staging/pruning/dependency/size tools and tests map to AWS packaging with Medium confidence if the filename is not explicitly assigned.

79 exclusive groups: 54 reviewed / 25 residual; 2,358 literals in 32 affected files. Status: 0 defects / 8 risks / 71 intentional. Reachability: 35 runtime / 17 test / 25 development / 2 artifact.

Confirmed defects and all High-severity risks (existing classifications):

| ID | Severity / status | Audited location | Existing description |
|---|---|---|---|
| SCI-039 | High / risk | agent/bedrock_agent.py:95 | Bedrock validation checks site IDs and nonempty text but does not verify numerical grounding |

### Pritam

Includes current model modules, geo helpers, optional ML and legacy detection/plume output deliverables. The brief permits isolated mathematical cases and BASELINE_SIMULATED training outside production. Deliverable ownership is not proof that Pritam introduced legacy formulae.

41 exclusive groups: 23 reviewed / 18 residual; 4,338 literals in 24 affected files. Status: 0 defects / 7 risks / 34 intentional. Reachability: 17 runtime / 9 test / 14 development / 1 artifact.

Confirmed defects and all High-severity risks (existing classifications):

| ID | Severity / status | Audited location | Existing description |
|---|---|---|---|
| SCI-055 | High / risk | data/live/sources.json:1 | Ten archived sources were generated by the removed legacy detector; the current baseline produces 22 |
| SCI-056 | High / risk | data/live/corridor.geojson:1 | 50 archived corridor features retain the removed legacy PM2.5 and risk floors |

### Meenal

Includes fetchers/handlers, HTTP/time helpers, five inputs, snapshot README and exposure/ranking. Explicit storage and AWS secrets exceptions map to Aditya. Consuming a plume does not transfer exposure-formula responsibility to Pritam.

57 exclusive groups: 38 reviewed / 19 residual; 3,118 literals in 26 affected files. Status: 7 defects / 17 risks / 33 intentional. Reachability: 39 runtime / 13 test / 4 development / 1 artifact.

Confirmed defects and all High-severity risks (existing classifications):

| ID | Severity / status | Audited location | Existing description |
|---|---|---|---|
| SCI-002 | Medium / defect | ingest/firms/fetch_fires.py:77 | Unknown or malformed fire confidence becomes nominal; nominal/high retained |
| SCI-003 | High / defect | ingest/firms/fetch_fires.py:262 | All FIRMS source failures become a fresh empty observation capture |
| SCI-005 | High / defect | ingest/aqi/fetch_aqi.py:79 | Six CPCB sub-index bands contain decimal gaps that produce AQI 500, Severe |
| SCI-006 | High / risk | ingest/aqi/fetch_aqi.py:260 | Latest OpenAQ PM2.5 is converted to a CPCB 24-hour sub-index without an averaging-period check |
| SCI-010 | Medium / defect | ingest/aqi/handler.py:54 | AQI local CLI writes an empty freshly timestamped payload after both providers fail |
| SCI-017 | Medium / defect | ingest/population/handler.py:54 | Population CLI can replace a valid file with empty output after upstream/raster errors |
| SCI-019 | High / risk | ingest/common/http.py:50 | FIRMS path-contained key can enter DEBUG request logs despite secret-safe intent |
| SCI-033 | High / risk | models/exposure/rank_sites.py:196 | Facility PM2.5 increment is copied from a containing band's maximum rather than sampled at the receptor |
| SCI-052 | High / risk | data/live/wind.json:1 | 323 forecast grid points contain 15,504 hourly samples with unverified archived physical timing |
| SCI-057 | High / risk | data/live/ranked_sites.json:1 | All 444 facility rankings inherit the legacy 15 ug/m3 floor; exposed population estimate is 7,132,123. |
| SCI-060 | Medium / defect | data/live/README.md:3 | Blanket real-time/real-data claims obscure the directory's old derived model outputs |
| SCI-075 | Medium / defect | ingest/firms/handler.py:26 | Five ingestion handlers label host-local logging timestamps with a fixed UTC Z suffix |

### Saba

Includes frontend/configuration/tests, browser assets, local agent/tools/prompts and action outputs. Later fixes remain in this documented area regardless of author. The explicitly documented Bedrock wrapper/tests map to Aditya.

161 exclusive groups: 105 reviewed / 56 residual; 10,671 literals in 101 affected files. Status: 4 defects / 17 risks / 140 intentional. Reachability: 137 runtime / 15 test / 7 development / 2 artifact.

Confirmed defects and all High-severity risks (existing classifications):

| ID | Severity / status | Audited location | Existing description |
|---|---|---|---|
| WEB-010 | High / defect | web/src/components/kpi/AqiKpiCard.tsx:49 | A derived PM2.5-only sub-index is labelled observed AQI; averaging interval and official multi-pollutant index provenance are absent. |
| WEB-042 | Medium / defect | web/src/components/map/MapExplorerView.tsx:248 | Missing territory is silently labelled India in the fire-marker tooltip. |
| SCI-034 | High / defect | agent/agent.py:83 | Empty feeds still produce an active-threat summary and an invented two-hour arrival |
| SCI-035 | High / defect | agent/agent.py:122 | Missing site metrics become ETA 1 hour, PM2.5 +25 ug/m3, and a 0.5-hour minimum deadline. |
| SCI-036 | High / risk | agent/agent.py:155 | Three unconditional directives include GRAP Stage III, a 2-to-4-hour forecast window, and school restrictions until noon. |
| SCI-058 | High / risk | data/live/actions.json:1 | Eight cached site actions and three authority actions derive from the legacy forecast |

## Shared, unassigned and out-of-scope reconciliation

| ID | Bucket | Documented participants | Audited location | Reason |
|---|---|---|---|---|
| BE08 | Shared | Aditya; Pritam | pipeline/steps.py:83 | Aditya documents the pipeline wrapper; Pritam documents corridor horizons and a pipeline regression. Keep the original mixed integration group once; other pipeline findings are not automatically shared. |
| PK06 | Shared | Aditya; Pritam; Meenal; Saba | requirements.txt:5 | The briefs explicitly require model, ingestion and agent dependency handoffs, with AWS packaging assigned to Aditya. This original manifest group is not split into new findings or assigned by Git author. |
| CI02 | Unassigned | Not established | .github/workflows/python312.yml:17 | The briefs assign application/model tests and AWS deployment but do not name general GitHub workflow administration or Windows diagnostic ownership. Author metadata does not fill that gap. |
| CI03 | Unassigned | Not established | .github/workflows/self-hosted-windows-diagnostic.yml:11 | The briefs assign application/model tests and AWS deployment but do not name general GitHub workflow administration or Windows diagnostic ownership. Author metadata does not fill that gap. |
| TS04 | Shared | Aditya; Pritam | pipeline/tests/test_steps.py:37 | Aditya documents the pipeline wrapper; Pritam documents corridor horizons and a pipeline regression. Keep the original mixed integration group once; other pipeline findings are not automatically shared. |
| TS06 | Shared | Aditya; Pritam | pipeline/tests/test_steps.py:117 | Aditya documents the pipeline wrapper; Pritam documents corridor horizons and a pipeline regression. Keep the original mixed integration group once; other pipeline findings are not automatically shared. |
| SCI-059 | Unassigned | Not established | data/live/india-boundary.geojson:1 | The named fetcher outputs exclude the boundary. Map presentation does not explicitly assign acquisition/licensing of this canonical reference. Original Git attribution is retained separately. |
| RES-001 | Shared | Aditya; Meenal; Saba | .env.example:28 | These briefs explicitly assign environment-example maintenance. The original residual group stays shared at documented file-contract scope; this does not establish who introduced its one literal. |
| RES-002 | Unassigned | Not established | .github/workflows/python312.yml:1 | The briefs assign application/model tests and AWS deployment but do not name general GitHub workflow administration or Windows diagnostic ownership. Author metadata does not fill that gap. |
| RES-003 | Unassigned | Not established | .github/workflows/self-hosted-windows-diagnostic.yml:4 | The briefs assign application/model tests and AWS deployment but do not name general GitHub workflow administration or Windows diagnostic ownership. Author metadata does not fill that gap. |
| RES-062 | Shared | Aditya; Pritam | pipeline/steps.py:43 | Aditya documents the pipeline wrapper; Pritam documents corridor horizons and a pipeline regression. Keep the original mixed integration group once; other pipeline findings are not automatically shared. |
| RES-064 | Shared | Aditya; Pritam | pipeline/tests/test_steps.py:16 | Aditya documents the pipeline wrapper; Pritam documents corridor horizons and a pipeline regression. Keep the original mixed integration group once; other pipeline findings are not automatically shared. |
| RES-065 | Shared | Aditya; Pritam; Meenal; Saba | requirements.txt:2 | The briefs explicitly require model, ingestion and agent dependency handoffs, with AWS packaging assigned to Aditya. This original manifest group is not split into new findings or assigned by Git author. |
| RES-077 | Unassigned | Not established | start.sh:5 | The documented script list and member folder scopes do not name start.sh or its owner. No branch/history inference is used. |

Shared: 8 groups / 221 literals. Unassigned: 6 groups / 123 literals. Out of scope: 0 groups. All remain in the 352-group ledger. General CI/root-launcher ownership is not documented; the boundary is in-scope reference data with an ownership gap, not silently excluded.

Environment/dependency residuals stay shared at documented file-contract scope with Medium confidence. This does not assert each participant touched every literal. More precise allocation would require another declaration/ownership investigation, which was not performed.

## Comparison with original Git-metadata attribution

| Name / original bucket | Original Git groups | Documented-work exclusive groups |
|---|---|---|
| Aditya | 41 | 79 |
| Pritam / original Pritam Singh | 52 | 41 |
| Meenal / original MeenalSinha | 36 | 57 |
| Saba / original Saba Saeed | 45 | 161 |
| Joint / shared | 3 | 8 |
| Unknown / unassigned | 175 | 6 |
| Out of scope | 0 | 0 |
| Project total | 352 | 352 |

Original figures use introduction-author metadata and leave many groups unattributed. This tally follows assignments/recorded work: previously unknown groups in named modules can be mapped without proving authorship. A person can fix or introduce code in another assigned area. Original author, introduction evidence and identity-verification fields remain separate and unchanged.

Examples: web maps to Saba UI work; legacy sources/corridor map to Pritam named outputs despite original Saba metadata; storage/Bedrock map to specific Aditya records. Lambda packaging does not transfer every fetcher/exposure finding from Meenal to Aditya. General CI and boundary ownership remain unassigned even with author metadata.

## Corrected or removed historical behavior

The five existing HISTORICAL_FINDINGS.csv rows are a separate historical ledger, not five extra current groups. No source/history re-investigation was performed. The work-area mapping below describes responsibility; introduction/remediation labels are carried from that ledger without new identity/authorship claims.

| Historical ID | Documented area | Supporting document | Existing status | Original introduction / remediation metadata | Existing description |
|---|---|---|---|---|---|
| SCI-H001 | Meenal | docs/members/meenal-data-exposure.md:84-88 | remediated | Saba Saeed / MeenalSinha | Synthetic 5,840-cell population grid was described as real; city-distance density and sine/rural baseline invented values,0.05degree grid claimed cell_km1.0 |
| SCI-H002 | Pritam | docs/members/pritam-models.md:54-70 | code-remediated-artifact-persists | Saba Saeed / Pritam Singh | Legacy concentration floor15ug/m3, emission coefficient160, decay20h, riskfloor0.20/cap0.98 manufactured positive predictions regardless of field physics |
| SCI-H003 | Pritam | docs/members/pritam-models.md:54-70 | remediated | Saba Saeed / Aditya | Missing weather silently became fixed u=2m/s,v=-1.5m/s,PBLH400m orper-hour1/-1/350defaults |
| SCI-H004 | Pritam | docs/members/pritam-models.md:38-52 | code-remediated-artifact-persists | Saba Saeed / Pritam Singh | Legacyconfidencefloor0.65,FRPscale150,radiusfloor4km,andindustrial_fire labeloutsideagriculturalbbox |
| SCI-H005 | Meenal | docs/members/meenal-data-exposure.md:90-103 | remediated | MeenalSinha / MeenalSinha | Fixed±25%populationrange was propagated as90%confidenceinterval without statisticalevidence |

Separate historical area counts: Pritam 3 / Meenal 2 / Aditya 0 / Saba 0. They are not added to current totals and do not count who performed remediation. The removed generator maps to the population deliverable with Medium confidence; model/exposure module assignments are explicit. These five rows do not quantify every past fix.

Surviving legacy sources/corridor remain current dataset risks (SCI-055/SCI-056); replaced model formulae are historical. The obsolete confidence-interval wording in a retained agent review file remains a test-artifact finding. Current finding status and historical remediation status are kept separate.

## Validation and preservation

Checks: 352 unique IDs join the original attribution ledger one-to-one; A17/B61/C43/D146/E84/F1; severity 0 Critical/15 High/38 Medium/16 Low/283 Informational; 11 defects/51 risks/290 intentional; 235 runtime/57 test/54 development/6 artifact; 227 reviewed/125 residual; 20,829 literals; 188 distinct affected files. All eight selected measurable sums match METRICS.json. Document line references resolve.

The destination was confirmed absent before creation. Only CONTRIBUTOR_WORK_TALLY.md, CONTRIBUTOR_TOTALS.csv, FINDING_TO_WORK_MAPPING.csv and UNASSIGNED_AND_SHARED.csv were created. Totals CSV has one exclusive row per contributor plus three reconciliation rows. Inclusive participation columns overlap and are not additive.

SHA-256 preservation checks: all 394 pre-existing protected files unchanged (346 original census paths, three ignored ML artifacts, 41 original audit files and four pre-existing partial forensic-report files). This includes all 19 data/live and web/public/data files. Application/configuration, snapshots and existing audit/partial reports were preserved.

HEAD, branch, index hash and working-tree status are unchanged. No staging, commit, push, branch switch or PR operation occurred. Git diff --check and report CSV/schema/reconciliation/whitespace checks passed. Report-only validation does not establish application tests, remote CI or AWS deployment results.

Limits: documents can be broad/dated; responsibility mapping does not verify real identities, introduction, external provenance, calibration or cloud operation. The original lower-bound counts and residual limitations remain. Unassigned findings and Medium-confidence overlaps are retained rather than forced into one owner.
