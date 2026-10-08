# 2.5 Step Functions Pipeline (Optional)

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 4.

State machine order: **fetch → detect → corridor → rank → agent**. One trigger produces a fully refreshed result.

- [ ] Define states with retries and catch to a failure state
- [ ] Expose via the optional `POST /run` route ([3.5](../phase-3-models-agent-api/05-api-gateway.md))
- [ ] Build only after Phase 3 Lambdas exist; skip if time is short

**Done when:** one execution updates every `gold/` file.
