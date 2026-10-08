# 3.5 API Gateway

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 7. See also [`../../api-list.md`](../../api-list.md).

| Route | Reads |
|-------|-------|
| `GET /sources` | `gold/` sources file |
| `GET /corridor` | corridor file |
| `GET /sites` | ranked sites |
| `GET /actions` | `gold/actions.json` |
| `GET /summary` | summary file |
| `POST /run` (optional) | triggers pipeline |

- [ ] HTTP API; each Lambda only reads the matching `gold/` file
- [ ] CORS enabled for the CloudFront origin
- [ ] Responses include fetch time so the UI can flag staleness

**Done when:** all routes return contract-valid JSON.
