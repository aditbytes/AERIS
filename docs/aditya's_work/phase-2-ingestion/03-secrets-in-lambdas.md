# 2.3 Secrets in Lambdas

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 4.

- [ ] Grant each Lambda role read access to only its secrets
- [ ] Read keys at cold start and cache in module scope
- [ ] Never log secret values; never put them in env vars in the template

**Done when:** rotating a secret needs no code change or redeploy.
