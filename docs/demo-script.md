# AERIS — 3-Minute Demo Video Script & Storyboard
**Hackathon:** WeMakeDevs x AWS Environmental Hacks 2026  
**Track:** Air Quality & Predictive Climate Interventions  
**Target Duration:** Exactly 3:00 minutes (180 seconds)  
**Presenter:** Saba Saeed (Product & AI Agent Lead) + Aditya (AWS Cloud Architect)

---

## Storyboard Overview & Timing

```
[0:00 - 0:25] The Problem & Status Quo
     └── Delhi post-harvest AQI emergencies, reactive firefighting, lack of lead time.
[0:25 - 1:15] The Live Solution — AERIS Interactive Map
     └── Satellite detection (VIIRS) → Wind dispersion corridor → Time slider (0-3h) → Real-time receptor arrival.
[1:15 - 2:00] Exposure Assessment & The Strands Action Agent
     └── 494 vulnerable facilities ranked → AERIS Strands Agent executive summary → Instant action directives modal.
[2:00 - 2:40] How It Works & Where AWS Fits (Aditya Architecture)
     └── Serverless pipeline: EventBridge → Lambda → Step Functions → Bedrock (Strands) → API Gateway + CloudFront.
[2:40 - 3:00] Real-World Impact & Call to Action
     └── 55% exposure reduction, zero fabricated data, proactive protection before the first breath of smoke.
```

---

## Detailed Cue-by-Cue Script

### Segment 1: The Crisis — From Reactive Regret to Proactive Shield (0:00 – 0:25)
* **Visual:** Aerial video/photo of Delhi winter smog and headline: *"Delhi AQI hits 480: Schools Shut After Smoke Arrives"*. Transition to the crisp, modern AERIS Dashboard at `localhost` / CloudFront.
* **Speaker (Saba):**
  > "Every October, over 30 million people in Delhi NCR wake up to toxic air. 
  > Current systems tell us the air is hazardous *after* children have already breathed it in on the way to school, and *after* emergency rooms are overwhelmed. 
  > 
  > This is **AERIS** — the AI Environmental Risk and Intervention System. 
  > We flip air quality management on its head: moving from *reactive measurement* to *predictive, proactive intervention* hours before the smoke arrives."

---

### Segment 2: Live Map Walkthrough — Physics & Wind Advection (0:25 – 1:15)
* **Visual:** Pan across the AERIS map centerpiece. Zoom in on Punjab and Haryana stubble burning fire markers. Hover over a cluster to show the popup: `104 fires, 676 MW FRP`. Then point to the crimson-and-orange advection plume heading towards Delhi NCR.
* **Speaker (Saba):**
  > "At this exact moment, AERIS is ingesting live satellite thermal data from NASA VIIRS and real wind forecast grids from Open-Meteo GFS. 
  > 
  > Upwind in Punjab, our clustering algorithms detected active stubble burning clusters with a combined Fire Radiative Power of over 670 Megawatts. 
  > 
  > Rather than waiting for local sensors to register a spike, our Lagrangian plume model simulates smoke transport hour-by-hour along the real boundary layer wind vectors. 
  > 
  > Notice the floating HUD: **The plume will reach northwest Delhi receptor communities in approximately 2 hours**. 
  > As I scrub our time horizon filter from **Now** to **+1h**, **+2h**, and **+3h**, watch the plume corridor advance dynamically. By hour two, expected particulate levels along the corridor rise into the very poor 350 to 420 range."

---

### Segment 3: Exposure Matrix & The Strands Action Agent (1:15 – 2:00)
* **Visual:** Move to the right side-panel: highlight **Top Affected Areas** (Government Senior Secondary School, A.D. Sr. Sec. School, Pulse Hospital). Click on the first school to trigger map fly-to.
* **Speaker (Saba):**
  > "A forecast without action is useless. AERIS intersects the plume corridor with over 3,100 verified OpenStreetMap schools and hospitals, plus gridded population density data. 
  > 
  > We identify that **571,000 residents** and **494 sensitive facilities** are directly in harm's way. 
  > 
  > Here is where the **AERIS Strands Agent** takes command. Built using the AWS Strands Agents SDK, it generates a prioritized, legally aligned operational plan."
* **Visual:** Click the green **"View Recommended Actions →"** button. The Action Directives modal smoothly animates open with the verified live data badge.
* **Speaker (Saba):**
  > "Instead of vague advisories, the agent generates concrete directives tailored for two distinct audiences:
  > First, for **Institutions**: School Principals receive explicit orders to move assemblies indoors, seal air filtration gaps, and issue N95 masks *at least 30 minutes before arrival*.
  > Second, for **Authorities**: clicking Regulatory Directives shows targeted Stage-III GRAP mandates for CAQM and DPCC, deploying smog cannons precisely where the plume will strike."

---

### Segment 4: Under the Hood & Where AWS Fits (2:00 – 2:40)
* **Visual:** Switch to the "As deployed" page of `aeris_architecture.drawio` (PNG: `docs/assets/aeris-deployed-architecture.png`). Highlight each column as it is named.
* **Speaker (Aditya / Voiceover):**
  > "Everything you just saw runs serverless on AWS in Mumbai, from one SAM template:
  > 
  > 1. **Ingestion**: EventBridge Scheduler runs Lambda fetchers every 15, 30 and 60 minutes against NASA FIRMS, OpenAQ and Open-Meteo. API keys live in Secrets Manager, raw results land in S3, and any failed fetch goes to an SQS dead-letter queue instead of overwriting good data.
  > 2. **Pipeline**: Every 30 minutes, AWS Step Functions runs five Lambdas in order: publish, detect fire clusters, advect the smoke corridor with forecast wind, rank schools and hospitals against WorldPop population, then the agent.
  > 3. **Action agent**: The agent is built with the open-source **Strands Agents SDK** on **Amazon Bedrock**. It can only cite numbers its tools return, and every site it names is checked against the real ranking.
  > 4. **Delivery**: An API Gateway HTTP API serves the results, flagging anything stale, and **CloudFront** serves the React and MapLibre app from a private S3 bucket. CloudWatch alarms and a budget email us if anything breaks."

---

### Segment 5: Quantified Impact & Future Vision (2:40 – 3:00)
* **Visual:** Return to the bottom analytics row of the dashboard: zoom in on the **"What If We Act?"** counterfactual bar chart showing 571K dropping to 257K (55% reduction).
* **Speaker (Saba):**
  > "Look at our counterfactual impact model: if administrators execute these automated directives, **high-risk exposure drops by 55%**, protecting over 314,000 children and patients from toxic spikes.
  > 
  > Every byte of data in AERIS is 100% real — no demo mocks, no fabricated sensors. 
  > AERIS proves that with AWS and agentic AI, we can stop managing environmental disasters after they happen, and start protecting citizens before the first breath of smoke. 
  > Thank you."

---

## Production & Recording Checklist
- [x] Run preview server: `npx vite preview --port 4173`
- [x] Full resolution: 1920x1080 (16:9), 60 FPS recording
- [x] Audio: Clear condenser microphone, noise cancellation enabled
- [x] Cursor highlights: Smooth cursor easing on clicks (+1h, site item, modal)
- [x] Subtitles: English closed captions embedded (.srt file)
