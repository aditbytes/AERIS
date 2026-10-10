# Manual cross-checks of high findings

All 15 High rows were reviewed. There are zero Critical rows. This table records
what was established and which uncertainties remain; it is not a remediation log.

| ID | Current location | Cross-check |
|---|---|---|
| WEB-010 | `web/src/components/kpi/AqiKpiCard.tsx:49` | Checked browser observed-AQI labels against the ingestion derivation; 59/59 captured AQIs match compute_pm25_aqi. Averaging and official composite-index status are not authenticated. |
| SCI-003 | `ingest/firms/fetch_fires.py:262` | Manually read exception/return and handler publication paths; patched fetch failure and patched storage show a fresh empty capture and publication attempt with no real write. |
| SCI-005 | `ingest/aqi/fetch_aqi.py:79` | Read interval table and fallback; seven controlled boundary probes include five decimal-gap values returning 500/Severe. |
| SCI-006 | `ingest/aqi/fetch_aqi.py:260` | Read latest OpenAQ extraction and immediate subindex conversion; no 24-hour aggregation or retained averaging metadata. Risk, not proof each raw provider reading has the wrong interval. |
| SCI-019 | `ingest/common/http.py:50` | Read query-only redaction and DEBUG logging at line 82; dummy path probe retains placeholder. No actual key or actual disclosure verified. |
| SCI-033 | `models/exposure/rank_sites.py:196` | Read the independent minimum ETA, maximum band concentration, and first source selection. Proxy semantics confirmed; quantitative real forecast overestimation is unmeasured. |
| SCI-034 | `agent/agent.py:83` | Read defaults and unconditional summary/directives; empty patched inputs produce active threat, two-hour arrival, and three authority actions. |
| SCI-035 | `agent/agent.py:122` | Read missing-metric defaults; a controlled site_id-only record produces ETA 1h, delta +25 ug/m3, deadline 0.5h. No captured record was fabricated or changed. |
| SCI-036 | `agent/agent.py:155` | Read all three unconditional authority constructors and captured authority actions. Regulatory/clinical validity not certified. |
| SCI-039 | `agent/bedrock_agent.py:95` | Read _validate: IDs, nonempty summary, and action presence are the checks. Numeric grounding is not validated; remote generation was not invoked. |
| SCI-052 | `data/live/wind.json:1` | Parsed 323 points/15,504 hours and historical label bounds; compared old/current parser and weather disclosure. Actual physical timing remains unverified without the original response. |
| SCI-055 | `data/live/sources.json:1` | Inspected real capture and detector history; current read-only replay yielded 22 candidates/151 included detections versus archive 10/215. models/README discloses older output. |
| SCI-056 | `data/live/corridor.geojson:1` | Recomputed both legacy formulas from archived strengths; 40/40 concentration and 40/40 risk values match. Current source has no mandatory legacy floor; older archive is disclosed. |
| SCI-057 | `data/live/ranked_sites.json:1` | Parsed all 444 ranking records: delta 15 ug/m3 throughout, occupancy null, explicit threshold-sensitivity range. No new receptor validation claimed. |
| SCI-058 | `data/live/actions.json:1` | Parsed eight site and three authority actions with October 9 publication time; compared reasons and the older October 7 forecast origin. No present threat authenticated. |

Sources were read as UTF-8 and captures as bytes/JSON. Values above are safe
public scientific quantities or explicitly controlled diagnostic inputs. No actual
credential values were read from the environment, printed, or tested. The full
introduction/modification evidence is in CONTRIBUTOR_ATTRIBUTION.csv.

Semantic overlap review narrowed DOC02 to the manifest and left SCI-060 as the
separate fetcher-only claim. Broad configuration spans can overlap narrower policy
spans without duplicating declarations; literal ownership is assigned once.
SCI-046 is classified as synthetic teacher evaluation rather than operational
observation data. AR01 (a directory of staged copies) is excluded as a redundant
inventory description. Five removed historical findings are counted separately.
