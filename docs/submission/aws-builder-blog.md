# Seeing the smoke before it arrives: AERIS on AWS

*Draft for AWS Builder Center — Aditya (AWS lead), AERIS team. Not yet published. Before posting, replace each `<…>` with the live value.*

![AERIS as deployed on AWS](../assets/aeris-deployed-architecture.png)

## The problem

Every October and November, crop-residue fires in Punjab and Haryana add smoke to Delhi NCR's air. The public signal is the AQI, but by the time a station reads "Severe", children have already walked to school through it. We wanted lead time: which fires matter now, where their smoke is going over the next 24 hours, which schools and hospitals sit in its path, and what each of them should do before it arrives.

AERIS (AI Environmental Risk & Intervention System) answers those four questions on one map. We set one rule early, and it shaped everything below: **real data only**. There is no demo mode, no mocked sensor and no "typical" fallback. If a source is down, the UI says so.

## What runs on AWS

Everything is in one SAM template in `ap-south-1` (Mumbai):

- **Ingestion.** EventBridge Scheduler runs Python 3.12 Lambdas on arm64:
  - NASA FIRMS (VIIRS active fires) every 15 minutes
  - OpenAQ and data.gov.in station AQI every 30 minutes
  - Open-Meteo GFS wind and boundary-layer height every 60 minutes

  Each key lives in Secrets Manager under `aeris/*`. A function's role can read only its own key, and keys are cached at cold start, so a rotated key needs no redeploy. Raw results go to `s3://…/bronze/<feed>/<timestamp>.json` plus a `latest.json` pointer.
- **Failure handling.** Every fetcher has an SQS dead-letter queue. A fetch that returns nothing raises an error instead of writing an empty file, so the last good data is never overwritten. On our first deploy the DLQ caught a real failure, so we knew it worked.
- **Pipeline.** Every 30 minutes (or via `POST /run`), Step Functions runs five Lambdas in order. Each step writes one contract file to `gold/`:
  1. *Publish* the latest feeds
  2. *Detect* sources by clustering fire detections (DBSCAN on haversine distance, weighted by fire radiative power)
  3. *Advect* a smoke corridor hour by hour along the forecast wind, producing time bands for 0–2, 2–4, 4–8 and 8–24 h
  4. *Rank* the OpenStreetMap schools and hospitals inside the corridor, and sum WorldPop population inside it
  5. *Agent*: write the action plan
- **Agent.** The action agent uses the open-source **Strands Agents SDK** with a `BedrockModel`. Its tools only read the `gold/` files, so the model sees the same numbers the map shows. The plan comes back as a typed object, and we reject it if it names a site that is not in the ranking. If Bedrock is unavailable, a rules-based plan is built from the same data, and the `generator` field in `actions.json` records which one ran.
- **Serving.** An API Gateway HTTP API calls one Lambda that reads `gold/`. Every response carries `generated_at`, `age_seconds` and `stale`. CloudFront serves the React + MapLibre app from a private S3 bucket through origin access control.
- **Operations.**
  - Each function logs to its own group with 7-day retention
  - CloudWatch alarms on Lambda errors, DLQ depth and failed pipeline runs email us through SNS
  - A $50 monthly budget alerts at 50%, 80% and 100%
  - `scripts/smoke_test.py` triggers a run and validates every route against our data contracts

There is no NAT gateway and no always-on instance. At hackathon traffic the cost is a few dollars a month, mostly Bedrock tokens and Lambda time: `<actual figure from Cost Explorer>`.

## What fought back

**1. The smoke always went to Delhi.** Our first corridor model looked great on the map: every plume drifted neatly south-east toward Delhi. In review we found out why. The wind lookup took `abs(u)` and `-abs(v)`, which forced every trajectory south-east whatever the forecast said. It also used the first hour in the wind file, and Open-Meteo returns the previous day as well, so the model was advecting with yesterday's wind. With the real sign and the matching hour, the 7 October plumes drift 50–80 km, mostly west. The new map is less dramatic, but it is correct. Lesson: test a physical model's direction against its input, not against the story you expect it to tell.

**2. "Latest" was empty right after midnight UTC.** With a one-day window, the first FIRMS runs after the UTC date changes return nothing until the day's first satellite pass. We now request two days and refuse empty results, so `latest` always holds the last real detections.

**3. Lambda's file system is read-only.** The fetchers were written to save into `data/live/`. On Lambda that path is `/var/task/data`, which is read-only, and the error went straight into the DLQ. The fix was a storage interface with two backends: local files for teammates, S3 when `AERIS_STORAGE=s3`. Teammates never needed AWS credentials.

**4. Lifecycle rules versus one-time data.** `bronze/` expires after 14 days to keep costs down. But the OpenStreetMap sites and WorldPop population are pulled once, and they would have expired in the middle of judging. They now live in a separate `reference/` prefix with no expiry rule.

**5. The UI threw away the stale flag.** The API marked old data `stale: true`, but the frontend validates responses with zod, and zod strips unknown keys. We now record freshness before parsing and show a banner. The same review found a dozen hard-coded "fallback" numbers in the UI, left over from an early snapshot: 570,938 people, AQI 179 and others. Each one now shows "—" instead.

**6. Small infrastructure-as-code traps.**
- YAML anchors are handy in a Step Functions definition, but CloudFormation rejects YAML aliases, so we expanded them inline
- A missing S3 key returns `AccessDenied`, not `NoSuchKey`, unless the role also has `s3:ListBucket`. Without it, our clean 404s became 500s
- Bedrock model availability varies by region. The model ID is a stack parameter, so switching to a cross-region inference profile is a redeploy, not a code change

## What we would do next

- Calibrate corridor PM2.5 against station observations along the path, using Open-Meteo history
- Add Sentinel-5P NO₂/CO to confirm a plume really left the source
- Replace the rule-of-thumb dispersion with a trained surrogate on SageMaker Serverless Inference, behind the same API contract

## Links

- Live app: `<CloudFront URL>`
- Code: `<GitHub repo URL>`
- Demo video: `<video URL>`
