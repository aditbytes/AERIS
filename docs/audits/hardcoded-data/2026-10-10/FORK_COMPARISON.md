# Fork and locally available branch comparison

Audit date: 2026-10-10 (Asia/Calcutta). This is an evidence boundary, not a complete remote contributor census.

Only local remote: `origin`, `https://github.com/sinhaaditya5/AERIS.git`. GitHub CLI is not installed. Public REST calls were read-only, unauthenticated and did not fetch or update local refs.

[Public repository metadata](https://api.github.com/repos/sinhaaditya5/AERIS) reported a public, non-fork repository, default branch `main`, and **0 forks**. [Fork enumeration](https://api.github.com/repos/sinhaaditya5/AERIS/forks?per_page=100) returned an empty list at 2026-10-10T10:04:03.3211160Z. Thus **0 distinct fork repositories were available for code comparison**; introduced/inherited finding counts by fork are unavailable rather than invented zeros for unknown forks. Private, detached, deleted and inaccessible forks cannot be enumerated from this result.

Remote main metadata is `f5ead137364c4cb33a25c2b3a70629d851bbec45`; cached origin/main is `f5e4689d59b410d3621bb65ac6f3f35b896faa4d`. The remote feature branch returned HTTP 404. Local branch/tracking snapshots remain available, but their existence does not establish a currently existing remote branch. No remote-only commit/code tree was downloaded; remote main content beyond local objects is unverified.

## Available local snapshots

All following refs belong to the same local repository; they are not forks. Merge bases were computed against cached origin/main, not the newer remote main. A zero-commit comparison means that ref is already an ancestor of cached main; it does not mean the branch originally added no code.

| Ref | Commit | Merge base | Commits after base | Changed paths |
|---|---|---|---:|---:|
| `refs/heads/feature/frontend-audit-heatmap` | `7cf0572049d6` | `f5e4689d59b4` | 15 | 80 |
| `refs/heads/feature/pritam-models` | `b886e2ede79d` | `b886e2ede79d` | 0 | 0 |
| `refs/heads/feature/python312-lambda-verification` | `508cd7f16870` | `508cd7f16870` | 0 | 0 |
| `refs/heads/feature/self-hosted-runner-diagnostic` | `27a8a9688d08` | `27a8a9688d08` | 0 | 0 |
| `refs/heads/main` | `f5e4689d59b4` | `f5e4689d59b4` | 0 | 0 |
| `refs/remotes/origin/aditya_8oct_phase1` | `6f0ca45658da` | `6f0ca45658da` | 0 | 0 |
| `refs/remotes/origin/aditya_8oct_phase2` | `1d87fa9d0804` | `1d87fa9d0804` | 0 | 0 |
| `refs/remotes/origin/aditya_8oct_phases_2_to_4` | `14c020ab26dd` | `14c020ab26dd` | 0 | 0 |
| `refs/remotes/origin/feat/ingestion-snapshots` | `3789d0815b3d` | `3789d0815b3d` | 0 | 0 |
| `refs/remotes/origin/feature/frontend-audit-heatmap` | `7cf0572049d6` | `f5e4689d59b4` | 15 | 80 |
| `refs/remotes/origin/feature/pritam-models` | `b886e2ede79d` | `b886e2ede79d` | 0 | 0 |
| `refs/remotes/origin/feature/python312-lambda-verification` | `508cd7f16870` | `508cd7f16870` | 0 | 0 |
| `refs/remotes/origin/feature/self-hosted-runner-diagnostic` | `27a8a9688d08` | `27a8a9688d08` | 0 | 0 |
| `refs/remotes/origin/fix/exposure-schema-range-reporting` | `df7b0c6a9900` | `df7b0c6a9900` | 0 | 0 |
| `refs/remotes/origin/main` | `f5e4689d59b4` | `f5e4689d59b4` | 0 | 0 |
| `refs/remotes/origin/saba-8-oct-2026` | `60af675b0bdf` | `60af675b0bdf` | 0 | 0 |
| `refs/remotes/origin/saba-8oct2026-2nd-phase` | `d775db0db281` | `d5dfafa3cb6e` | 1 | 12 |

## Differences actually examined

Current feature/frontend-audit-heatmap and its tracking ref point to the same 15 commits/80 web paths; count them once. The changes remove prior fabricated dashboard defaults and unsupported forecast/validation claims, add strict data recovery and observed-cell rendering, and preserve labelled 0.65/0.45 scenario assumptions. Current remaining derived-AQI-observed labels and map tooltip unknown-territory-as-India are in FINDINGS.csv. Scientific models, captured inputs and backend agent defects are inherited from cached main, not introduced by these frontend commits. Per-finding introduction evidence is in CONTRIBUTOR_ATTRIBUTION.csv.

`origin/saba-8oct2026-2nd-phase` has one commit `d775db0db281d4a783d2938c4f3feae48061344d` after base `d5dfafa3cb6e8046f864d422570563c21be76df0`, changing 12 web paths. Its diff was inspected. It modifies an inherited AgentWidget FRP fallback from 676 to 1278 MW; inherited fallbacks of 215 fires and 570,938 population remain in that historical tree. It adds `types/grap.ts` with static indicative GRAP trigger mappings and new When/Who/Where KPI components. The FRP fallback change is a branch modification, not proof the contributor originally invented all those fallbacks. Current working-tree frontend code has removed these numeric fallbacks; unmerged historical branch values are excluded from current totals. Regulatory mappings were not independently certified current and must not be merged as official orders without verification.

The remaining 14 refs are ancestors of cached origin/main. Their zero differences are inherited comparison results. Reviewing whole local history supplies introduction commits, but local branch names/member documentation alone do not verify personal identity or establish distinct fork ownership.

## Unavailable comparisons

No second remote, authenticated GitHub connector/CLI session, private fork access, remote AWS/S3 source archive, or remote-only main tree was available. Initial sandbox HTTP/web requests were inaccessible; approved read-only public REST metadata requests succeeded. No fetch, clone, settings change, support request or billing action occurred. Fork attribution remains **unavailable** where an actual fork/comparison point is absent.
