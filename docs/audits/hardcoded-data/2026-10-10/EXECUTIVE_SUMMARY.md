# Complete repository hardcoded data and provenance audit

Audit date: 2026-10-10. Repository: `D:\AERIS`. Branch:
`feature/frontend-audit-heatmap`. Revision:
`7cf0572049d69b550cbb42d7e74cf5472d521793`.

The audit identifies **352 current finding groups: 227 manually reviewed
semantic declarations, datasets, or policies and 125 explicitly labelled residual
source-file groups**. The reproducible source scan records **20,829 literal
occurrences**. These quantities are different measures: neither every token nor
every residual group is a scientific dataset or defect.

**11 confirmed defects, 51 potential risks, and 290 intentional groups** were
classified. Severity is **0 Critical, 15 High, 38 Medium, 16 Low, and 283
Informational**. High findings were manually cross-checked against source and
captured metadata; controlled probes verified the principal numerical and fallback
behaviors. This audit makes no fixes to application code or data.

## Amount and scope

The inventory covers **349 existing first-party/evidence files**: 297 tracked
files, 49 ignored generated Lambda staging copies, and 3 specifically inspected
ignored optional-ML artifacts. Primary source has **193 files, 1,123,909 bytes,
and 29,279 physical lines**. Separate census kinds are 64 documentation files,
39 assets/reports, and one generated dependency lock. The new audit files do not
inflate these figures. All 346 original census files and the three ML artifacts
are protected by recorded SHA-256 values.

| Primary category | All groups | Manually reviewed | Files | Associated lines | Source literal occurrences |
|---|---:|---:|---:|---:|---:|
| A: Operational/scientific data | 17 | 17 | 17 | 1,323,142 | 29 |
| B: Synthetic/mock/demo | 61 | 38 | 37 | 6,359 | 6,865 |
| C: Scientific assumptions/business logic | 43 | 29 | 28 | 2,796 | 2,333 |
| D: Defaults/configuration | 146 | 87 | 78 | 5,857 | 3,406 |
| E: UI/static reference | 84 | 55 | 71 | 12,342 | 8,184 |
| F: Sensitive configuration | 1 | 1 | 1 | 38 | 12 |

Each finding has one primary category. Files and associated lines can occur in
multiple categories and must not be added as unique project totals. Associated
lines are reviewed spans, not lines composed entirely of hardcoded values.

Selected separately measured declarations/entries comprise **585 constants,
253,659 heterogeneous records/reference entries, 230,196 coordinate positions,
39 endpoints, 163 thresholds, 11 mock-response families, 21 synthetic-dataset or
fixture families, and 1,452 static output fields**. These are conservative counts
under the row-level rules, not disjoint quantities to sum. The record total
includes real dataset rows, synthetic point labels, fixtures, and reference lists;
it is not a count of independent pollution observations. Unmeasured row fields
are identified in FINDINGS.csv.

Ten unique `data/live` JSON/GeoJSON files occupy **23,307,913 bytes and 1,322,321
lines**, with **810,968 JSON scalar entries and 230,164 coordinate positions**.
They include 227 thermal detections; 60 station records with 59 PM2.5 readings;
323 forecast grid points and 15,504 hourly records; 3,132 facilities; 222,792
population cells; 10 legacy sources; 50 legacy corridor features; 444 rankings;
11 recommendations; and one boundary with 2,326 positions. These record types
must not be conflated. Seven byte-identical browser copies add 3,617,359 bytes
but no independent data. The 49 staging copies add 250,790 bytes but no source
literal occurrences. ML dataset/metadata/pickle occupy 6,397,544 / 90,706 /
792,417 bytes; the pickle was never loaded.

## Reachability and defined percentages

| Reachability | All groups | Manually reviewed |
|---|---:|---:|
| Runtime | 235 | 150 |
| Test-only | 57 | 34 |
| Development-only | 54 | 37 |
| Artifact-only | 6 | 6 |
| Unknown | 0 | 0 |

Runtime means reachable in shipped code or normal configuration, not verified
execution on AWS. Only two category-B runtime findings concern unsupported rules
agent fallbacks. Frontend test fixtures are not imported by production source.
Training-generated scenarios are separate from the physics corridor runtime.

Defined measures:

- Source files containing reviewed or residual finding groups: **165/193 = 85.49%**.
  This includes normal UI/configuration literals and does not mean 85.49% defective code.
- Manually reviewed declaration/dataset/policy groups reachable at runtime:
  **150/227 = 66.08%**. Families can contain several constants.
- All groups reachable at runtime, including residual file groups:
  **235/352 = 66.76%**. This is not a percentage of data volume or scientific validity.

## Ten practical priorities

1. **Invented agent threat and timing (SCI-034/035).** Empty feeds assert an
   approaching smoke threat with a two-hour ETA; missing site metrics produce
   one-hour ETA and +25 ug/m3. Require actual inputs and explicit unavailable states.
2. **Unconditional recommendations and weak LLM grounding (SCI-036/039).**
   GRAP Stage III, school deadlines, and other advice are produced without their
   required decision evidence. Validate metrics/policy conditions and retain human review.
3. **AQI breakpoint gaps (SCI-005).** Controlled PM2.5 values 30.05, 60.05,
   90.05, 120.05, and 250.05 all return AQI 500/Severe. Correct numeric interval
   handling in a separate authorized change and add boundary regressions.
4. **Derived index labelled observed (WEB-010/SCI-006).** All 59 populated
   AQI records reproduce the project's latest-PM2.5 conversion. An official
   24-hour, multi-pollutant AQI is not established. Preserve interval/unit provenance
   and disclose the subindex calculation.
5. **Failure published as fresh empty FIRMS data (SCI-003).** Total upstream
   failure returns an empty, freshly timestamped capture and the handler attempts
   publication. Distinguish fetch failure from a successful empty observation feed.
6. **Legacy operational-looking artifacts (SCI-055/056/057/058).** Current
   source/plume engines differ from the archived outputs. All 40 bands match the
   removed floor formulas; all 444 facility increments are 15 ug/m3. The models
   documentation discloses older outputs, so this is a version/validity risk, not
   proof of fabricated raw observations. Bind inputs, algorithm, forecast start,
   parameters, and versions before publishing new operational claims.
7. **Band peak used as facility concentration (SCI-033).** Ranking combines
   an earliest band start, maximum band peak, and first source independently.
   Evaluate and validate receptor-time concentrations or disclose this proxy.
8. **Conditional credential logging (SCI-019).** DEBUG URL logging strips the
   query but retains a path credential; FIRMS keys live in paths. A dummy probe
   confirms the behavior. No usable secret or actual leak was found. Scrub paths
   before logging; investigate/rotate only when disclosure is established.
9. **Weather identity and physical time uncertainty (SCI-052 and weather rows).**
   Archived half-hour labels lack original-response authentication, and a GFS source
   label exceeds the current request's explicit model selection. Preserve precise
   model/time provenance and exclude uncertain archives from calibration.
10. **Reference/provenance and validation limits.** Population remains a 2020
    reference, boundary provenance/license is unknown, OpenAQ provider metadata is
    lost, and no eligible independent calibration history exists. Threshold ranges
    are not confidence intervals; synthetic teacher agreement is not real forecast skill.

Other confirmed defects include unknown fire confidence becoming nominal, empty
CLI publications, the incorrect fetcher-only README claim, unknown territory
shown as India, and local-time log labels carrying a fixed Z. FINDINGS.csv records
all rows and recommendations without implementing them.

## Attribution and forks

Attribution refers to Git author metadata and declaration/file introduction;
external observation authorship and personal identity are not verified. Introduction,
reviewed modification, and most recent file edit are separate evidence fields.

| Introduction author/group | Current finding groups |
|---|---:|
| Pritam Singh | 52 |
| Saba Saeed | 45 |
| Aditya | 41 |
| MeenalSinha | 36 |
| Joint Aditya / MeenalSinha / Pritam Singh | 1 |
| Joint Aditya / MeenalSinha | 1 |
| Joint Aditya / Pritam Singh | 1 |
| Unknown/unattributed | 175 |

The 175 unknown rows comprise 125 residual groups and 50 manually reviewed groups
without reliable introduction evidence. Per-person incidence including joint rows
is Pritam 54, Saba 45, Aditya 44, and MeenalSinha 38; those incidence counts overlap.
These are not culpability rankings. The five separately reported historical findings
have introduction metadata Saba four / MeenalSinha one, with subsequent remediation
recorded independently. They do not inflate current counts.

Public upstream metadata reported **0 accessible forks**; zero distinct fork code
trees were available for comparison. Seventeen local branch/tracking snapshots
were examined, plus the origin/HEAD symbolic alias. Current frontend and its
tracking ref share the same 15 commits/80 paths. One historical Saba tracking
branch has one divergent commit/12 paths; it changes an inherited FRP fallback
from 676 to 1278 MW. These are branches of one repository, not distinct forks.
Remote main is newer than cached main and its remote-only tree remains unexamined.
See FORK_COMPARISON.md for exact revisions and unavailable comparisons.

## Verification and limitations

Controlled Python 3.14.3 probes reproduced the AQI gaps, unsupported agent defaults,
fresh-empty FIRMS publication attempt, all 59 derived AQI values, all 40 legacy
concentration/risk formulas, and all 444 fixed archived facility increments.
Node 24.16.0 ran the actual heatmap calculation in memory: **59 samples, 28 cells,
one rejected station, all 59 samples stale** at 2026-10-10T00:00:00Z. It is a
station aggregation display, not an interpolated or calibrated exposure field.

The redacted pattern scan examined 349 current files and 661 distinct locally
reachable Git blobs (46,838,455 bytes), with zero signature matches. This does not
certify arbitrary-format, encrypted, binary, environment-only, unreachable, or
remote-only secrets absent. Dependencies/build/caches are excluded and named in
CENSUS.json; binary artwork received metadata review only. No database/migration,
Dockerfile, populated notebook, raw raster, eligible historical calibration archive,
or calibrated params.json exists in the examined first-party tree.

No source or data download, training, calibration, remote inference, deployment,
Git mutation, or application fix occurred. Existing suite/CI claims were not
adopted as newly executed tests. Pure diagnostic probes and audit validation are
the executed checks; see VALIDATION.md and VALIDATION.json for actual results,
warnings, and corrected first-pass audit failures. Full unit/browser suites and
remote AWS/live-service state were not verified by this audit.

Required reports are FINDINGS.csv, FILE_INVENTORY.csv, CONTRIBUTOR_ATTRIBUTION.csv,
FORK_COMPARISON.md, DATA_PROVENANCE.md, METHODOLOGY.md, and this summary. All audit
scripts and supplementary evidence files are indexed in AUDIT_FILES.md.
