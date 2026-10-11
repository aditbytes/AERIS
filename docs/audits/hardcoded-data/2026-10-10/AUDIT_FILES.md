# Audit file index

All **41 new files** are inside `docs/audits/hardcoded-data/2026-10-10/`.
No pre-existing application/configuration/data file was changed; nothing is staged.
The seven requested deliverables are marked Required below. Supporting inputs and
scripts preserve reproducibility and distinguish audit judgment from scan results.

| File | Purpose |
|---|---|
| [assemble_findings.py](assemble_findings.py) | Normalize reviewed inputs and apply explicit second-review corrections. |
| [AUDIT_FILES.md](AUDIT_FILES.md) | Index of every new file in this authorized audit directory. |
| [BASELINE.json](BASELINE.json) | Pre-audit branch, HEAD, index hash, tracked paths, original file hashes, exclusions. |
| [CENSUS.json](CENSUS.json) | Reproducible original file census and parser/metadata status. |
| [CONTRIBUTOR_ATTRIBUTION.csv](CONTRIBUTOR_ATTRIBUTION.csv) | Required introduction evidence; reviewed edits and last file edits are separate. |
| [DATA_PROVENANCE.md](DATA_PROVENANCE.md) | Required dataset provenance, transformations, scientific limits, license evidence, runtime paths. |
| [DATASET_INVENTORY.json](DATASET_INVENTORY.json) | Ten unique live datasets plus seven publication copies, metadata and hashes. |
| [DOCUMENT_REVIEW.json](DOCUMENT_REVIEW.json) | Inspected documentation file metadata and document-review coverage. |
| [EXCLUDED_REVIEW_ROWS.json](EXCLUDED_REVIEW_ROWS.json) | Reason AR01 duplicate-directory inventory is excluded from finding totals. |
| [EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md) | Required summary: counts, priorities, reachability, attribution, limitations. |
| [FILE_INVENTORY.csv](FILE_INVENTORY.csv) | Required inspected file inventory with hashes, bytes, lines, counts, categories, scope. |
| [FINDINGS.csv](FINDINGS.csv) | Required current unique finding rows and recommendations; values of credentials are absent. |
| [FORK_COMPARISON.md](FORK_COMPARISON.md) | Required public fork and local branch comparison with exact revisions and limitations. |
| [heatmap_probe.cjs](heatmap_probe.cjs) | In-memory TypeScript runtime probe; reads captures, writes only audit evidence. |
| [HEATMAP_PROBE.json](HEATMAP_PROBE.json) | Actual in-memory heatmap calculation on captured readings with fixed audit time. |
| [HISTORICAL_EVIDENCE.json](HISTORICAL_EVIDENCE.json) | Normalized removed/remediated historical evidence, separate from current totals. |
| [HISTORICAL_FINDINGS.csv](HISTORICAL_FINDINGS.csv) | Five historical finding rows with introduction and remediation metadata. |
| [IGNORED_ARTIFACTS.json](IGNORED_ARTIFACTS.json) | Three specifically inspected ignored ML artifact metadata/hashes; pickle not loaded. |
| [inventory.py](inventory.py) | Read-only scan/report compiler; writes only beside itself. |
| [LITERAL_OCCURRENCES.csv](LITERAL_OCCURRENCES.csv) | Value-redacted source literal positions and kinds; one-owner count reconciliation. |
| [literal_scan.cjs](literal_scan.cjs) | Installed TypeScript AST literal-position helper; no values or source writes. |
| [LOCAL_REF_COMPARISON.json](LOCAL_REF_COMPARISON.json) | 17 branch/tracking snapshots compared against cached main; divergent paths. |
| [MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md) | Manual evidence and uncertainty for all fifteen High findings; deduplication decisions. |
| [METHODOLOGY.md](METHODOLOGY.md) | Required scope, counting definitions, exclusions, interpretation limits, reproduction. |
| [METRICS.json](METRICS.json) | Reconciled category/severity/status/reachability/attribution and selected entry counts. |
| [PROBE_RESULTS.json](PROBE_RESULTS.json) | Controlled Python diagnostic outcomes and real archived-data formula comparisons. |
| [REMOTE_METADATA.json](REMOTE_METADATA.json) | Approved read-only public repository/fork metadata and request timestamp. |
| [review_corrections.json](review_corrections.json) | Explicit second-review corrections to descriptions, attribution, categories and spans. |
| [reviewed_backend.json](reviewed_backend.json) | Original reviewed API/pipeline/deployment/configuration input evidence. |
| [reviewed_docs.json](reviewed_docs.json) | Original documentation finding input evidence. |
| [reviewed_findings.json](reviewed_findings.json) | Normalized current reviewed input after explicit corrections. |
| [reviewed_frontend.json](reviewed_frontend.json) | Original reviewed frontend input evidence; no application source changes. |
| [reviewed_science.json](reviewed_science.json) | Original reviewed ingestion/models/exposure/agent/data input evidence. |
| [reviewed_science_history.json](reviewed_science_history.json) | Original separate historical input evidence. |
| [SECRET_SCAN.json](SECRET_SCAN.json) | Value-redacted current/historical signature scan totals and limitations. |
| [secret_scan.py](secret_scan.py) | Read-only value-redacted signature scanner; never uses credentials or the network. |
| [STAGING_COPY_VERIFICATION.json](STAGING_COPY_VERIFICATION.json) | 49 ignored staging copies mapped to original files; byte equality evidence. |
| [validate_audit.py](validate_audit.py) | 42 count, evidence, copy, Git protection, scope, and whitespace checks. |
| [VALIDATION.json](VALIDATION.json) | Machine-readable final validation checks and final Git status. |
| [VALIDATION.md](VALIDATION.md) | Executed commands, exact outcomes, interpreter paths, corrected harness issues, warnings. |
| [verification_probes.py](verification_probes.py) | Read-only controlled Python probes; patched network, secrets, and publication. |

Only these audit artifacts are newly created. FILE_INVENTORY.csv lists the inspected
pre-existing project, rather than counting the audit itself as first-party source.
