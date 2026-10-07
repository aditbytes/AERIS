# AERIS — File & Folder Structure

Planned layout for the MVP. Folders marked ✅ exist today; the rest are created as each piece lands.

```
AERIS/
├── README.md                          ✅ project overview
├── file and folder structure.md       ✅ this file
├── .gitignore                         ✅
├── .env.example                       # required env vars (no secrets)
│
├── docs/                              ✅
│   ├── aeris_architecture.drawio      ✅ full 8-layer reference architecture
│   ├── assets/
│   │   └── logo.svg                   ✅
│   ├── mvp.md                         # MVP scope + demo script
│   └── data-sources.md                # API endpoints, licences, refresh rates
│
├── ingest/                            # ① Data ingestion (Lambda, triggered by EventBridge)
│   ├── firms/                         # NASA FIRMS active-fire pull
│   ├── aqi/                           # CPCB / OpenAQ air-quality pull
│   ├── weather/                       # wind / PBLH from IMD / GFS / ERA5
│   ├── sites/                         # schools + hospitals (OSM, UDISE, NHA)
│   ├── common/                        # shared normalise / write-to-S3 helpers
│   └── tests/
│
├── models/                            # ② Source detection + plume corridor
│   ├── source_detection/              # fire clustering, source registry
│   ├── plume/                         # wind-advection corridor + SageMaker model
│   ├── exposure/                      # population overlay, site ranking, ETA
│   ├── training/                      # SageMaker training scripts / notebooks
│   └── tests/
│
├── agent/                             # ③ Strands Agent — action recommendations
│   ├── agent.py                       # agent definition + system prompt
│   ├── tools/                         # query_plume, rank_sites, dispatch ...
│   ├── prompts/
│   └── tests/
│
├── api/                               # ④ API Gateway / Lambda handlers
│   ├── handlers/                      # /sources, /corridor, /sites, /actions
│   ├── schemas/                       # request/response JSON schemas
│   └── tests/
│
├── web/                               # ⑤ Map UI (CloudFront + S3)
│   ├── src/
│   │   ├── components/                # map, layers, side panel
│   │   ├── layers/                    # source, corridor, sites, actions
│   │   └── api/                       # API client
│   ├── public/
│   └── package.json
│
├── infra/                             # ⑥ Infrastructure as code (SAM / CDK)
│   ├── template.yaml                  # Lambda, EventBridge, API GW, S3, CloudFront
│   └── sagemaker/                     # endpoints, pipelines
│
├── data/                              # local sample data (raw/ is gitignored)
│   ├── sample/                        # small fixtures for the demo
│   └── raw/                           # downloaded data (not committed)
│
└── scripts/                           # dev helpers: seed data, run demo, deploy
```

## Data flow → folder map

| Stage | Folder |
|-------|--------|
| Pull fire, AQI, weather, site data | `ingest/` |
| Detect source → forecast corridor → rank vulnerable sites | `models/` |
| Turn ranking into an action plan | `agent/` |
| Serve results | `api/` |
| Show everything on one map | `web/` |
| Deploy it all on AWS (`ap-south-1`) | `infra/` |
