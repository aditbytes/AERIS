# 3.6 CloudFront and Website

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 7.

- [ ] CloudFront + S3 with origin access control serving Saba's `web/dist`
- [ ] Set `API_BASE_URL` at build time
- [ ] Basemap: free OSM tiles, or Amazon Location Service if a hosted basemap is needed
- [ ] Invalidate cache after each deploy

**Done when:** the CloudFront URL loads the map and shows live data from the API.
