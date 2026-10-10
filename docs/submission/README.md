# Submission checklist

> Production observations must be real and attributed. Offline judging uses preserved captures, with stale and legacy disclosures. Labelled mathematical and intercepted boundary cases in tests are verification fixtures, not observations, calibration data or published feeds. See [current local readiness evidence](READINESS.md).

| Item | Owner | Status | Where |
|------|-------|--------|-------|
| Deployed URL (CloudFront) | Aditya | After `scripts/deploy.sh` and `scripts/deploy_web.sh` | `WebUrl` stack output |
| Smoke test green on the deployed stack | Aditya | After deploy | `python3 scripts/smoke_test.py` |
| Repo public (if required by the rules) | Aditya | Open | GitHub settings |
| AWS Builder Center blog | Aditya | Draft ready | [`aws-builder-blog.md`](aws-builder-blog.md) |
| 3-minute demo video | Saba records; Aditya does 2:00–2:40 | Script ready | [`../demo-script.md`](../demo-script.md), diagram [`../assets/aeris-deployed-architecture.png`](../assets/aeris-deployed-architecture.png) |
| Architecture diagram matches the deployment | Aditya | Current stack unverified; diagram records configured/earlier design | "As deployed" page in [`../aeris_architecture.drawio`](../aeris_architecture.drawio) |
| Final submission form: URL, repo, video, blog link | Aditya | Open | Hackathon portal |

## Before recording or judging
1. For an offline demo, follow `web/README.md`, verify `python -m scripts.publish_model_provenance --check`, and show the saved captures' timestamps and legacy status. No AWS credentials are needed.
2. For a deployed demo, the owner must separately authorize and run `python3 scripts/smoke_test.py` (it starts a remote pipeline). Require actual success and inspect stale flags, wind coverage and provenance. A non-stale capture alone does not establish forecast validity.
3. Record the actual `generator`; rules fallback is supported behavior, not evidence that Bedrock passed. Review generated prose before use.
4. Read numbers from the application and retain their observed/derived/archived classifications. Do not claim forecast accuracy, protected lives, guaranteed lead time or current deployment verification without evidence.

## Before publishing the blog
- Replace the `<…>` values: the CloudFront URL, the repo, the video and the Cost Explorer figure
- Publishing is a public action. Do it from your own Builder Center account
