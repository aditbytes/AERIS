# 3.2 SageMaker

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 5. Only if Pritam delivers an ML model.

- [ ] Run a SageMaker **training job** from `models/training/train.py`, trained on real data only
- [ ] Store the artifact in `models/` on S3
- [ ] Deploy with **Serverless Inference** or **Async** endpoint (no idle instances)
- [ ] Keep the API contract identical to the Lambda baseline so either can be swapped
- [ ] **Delete endpoints when not demoing**

**Done when:** endpoint returns the same schema as the baseline; cost check done after teardown.
