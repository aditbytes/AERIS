# 4.6 Teardown and Cost Control

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc sections 1, 5 and 8.

- [ ] Delete SageMaker endpoints after demos
- [ ] Run `scripts/teardown.sh` once judging is finished (decide timing with the team)
- [ ] Check no NAT gateways or idle resources remain
- [ ] Confirm budget alerts are still active until the end

**Done when:** Cost Explorer shows no ongoing spend after teardown.
