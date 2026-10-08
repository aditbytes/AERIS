# 3.1 Detection and Corridor Lambda

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 5.

- [ ] Run Pritam's detection and corridor code as a Lambda
- [ ] Use a **container image** if shapely/numpy exceed the zip limit
- [ ] Read from `bronze/`, write `gold/` files in contract format
- [ ] This is also the baseline fallback if SageMaker is not ready

**Done when:** a real FIRMS detection produces a corridor file that validates against the contract.
