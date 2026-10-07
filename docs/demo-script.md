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
     └── Serverless pipeline: EventBridge → ECS/Lambda → Bedrock Strands Agent → S3/CloudFront UI.
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
* **Visual:** Switch to Aditya's technical architecture slide (`aeris_architecture.drawio`).
* **Speaker (Aditya / Voiceover):**
  > "AERIS is architected natively on AWS for sub-minute scalability and zero server maintenance:
  > 
  > 1. **Ingestion & Processing**: Amazon EventBridge schedules automated AWS Lambda fetchers that query NASA FIRMS, OpenAQ, and Open-Meteo, writing immutable GeoJSON snapshots into Amazon S3.
  > 2. **Scientific Modeling**: Our Lagrangian advection and exposure models execute on containerized AWS ECS Fargate tasks with sub-second execution times.
  > 3. **Action Intelligence**: The reasoning core runs on **Amazon Bedrock**, leveraging Claude and Llama foundation models via the AWS Strands Agents framework, constrained by strict Pydantic schemas.
  > 4. **Global Delivery**: The React and MapLibre GL frontend is globally distributed via **Amazon CloudFront** and S3 with zero API key dependencies."

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
