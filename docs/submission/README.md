# Submission checklist

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

| Item | Owner | Status | Where |
|------|-------|--------|-------|
| Deployed URL (CloudFront) | Aditya | After `scripts/deploy.sh` and `scripts/deploy_web.sh` | `WebUrl` stack output |
| Smoke test green on the deployed stack | Aditya | After deploy | `python3 scripts/smoke_test.py` |
| Repo public (if required by the rules) | Aditya | Open | GitHub settings |
| AWS Builder Center blog | Aditya | Draft ready | [`aws-builder-blog.md`](aws-builder-blog.md) |
| 3-minute demo video | Saba records; Aditya does 2:00–2:40 | Script ready | [`../demo-script.md`](../demo-script.md), diagram [`../assets/aeris-deployed-architecture.png`](../assets/aeris-deployed-architecture.png) |
| Architecture diagram matches the deployment | Aditya | Done | "As deployed" page in [`../aeris_architecture.drawio`](../aeris_architecture.drawio) |
| Final submission form: URL, repo, video, blog link | Aditya | Open | Hackathon portal |

## Before recording or judging
1. Run `python3 scripts/smoke_test.py`. It must print `SMOKE TEST PASSED`
2. Check `GET /summary`: `stale` is `false`, and `generator` starts with `bedrock:`. If it says `rules`, Bedrock access is not set up; see the Phase 3 report
3. Read every number in the video from the live dashboard, not from the script

## Before publishing the blog
- Replace the `<…>` values: the CloudFront URL, the repo, the video and the Cost Explorer figure
- Publishing is a public action. Do it from your own Builder Center account
