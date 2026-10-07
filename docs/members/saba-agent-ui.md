# Saba Saeed — Action Agent, Map UI and Demo

> ⚠️ **No demo data.** AERIS uses **only real data** from live sources. Do not create, hand-write, mock or hard-code sample, demo, placeholder or fabricated data — not in code, not in the UI, not in tests, and not as a "fallback". If a live source is unavailable, return an error and show an error state. The only offline files allowed are **real snapshots** that the fetchers captured from live sources into `data/live/` (each stamped with its source and fetch time). Tests may use small captured real API responses, labelled as such.

You build **everything the user sees and reads**: the Strands Agent that writes the action plan, the single map that shows the whole story, and the demo video. Run everything locally, with no AWS account needed. Aditya hosts it and sets the model provider to Bedrock. Shared formats: [`../data-contracts.md`](../data-contracts.md).

## Your outputs

| Output | What it is |
|--------|------------|
| `actions.json` | Prioritised action plan from the agent |
| `web/` | The map UI (source → corridor → sites → actions) |
| Demo video | 3-minute recording (the judges see only this) |

## Folders you own

```
agent/
  agent.py        # build_agent(), run(), CLI
  tools/          # get_sources.py, query_corridor.py, rank_sites.py, get_site.py
  prompts/        # system.md, examples/
  tests/
web/
  src/ (components/, layers/, api/, App.tsx)
  public/
  package.json
```

## Rules for your code

1. **Works with no backend.** Both the agent and the UI read the real snapshots in `data/live/` by default; a config switch points them to the live API. Never ship invented data
2. **Configurable via environment variables**: `AERIS_DATA_DIR` (default `data/live`), `AGENT_MODEL_PROVIDER` (`bedrock` | `ollama` | `anthropic`, default one that runs for you locally), `API_BASE_URL` (UI). Aditya sets Bedrock on AWS. Document them in `.env.example`
3. **Match the contracts** exactly; Meenal and Pritam's real outputs are your only inputs
4. Agent: Python 3.12 and the **Strands Agents SDK** (an AWS open-source tool, which helps eligibility). UI: React + Vite + TypeScript, **MapLibre GL** (or Leaflet) with free OSM tiles

---

## Part A — Strands Action Agent (`agent/`)

### Behaviour
Given the pipeline results, the agent produces a clear plan: **what to do, for whom, by when, and why**, for two audiences: site administrators (schools and hospitals) and authorities.

### Tasks
1. **Install and hello-world** the Strands Agents SDK; confirm a model provider works locally
2. **Tools** (each is a `@tool` function that reads the JSON files via `AERIS_DATA_DIR`):
   - `get_sources()` returns detected sources with strength and confidence
   - `query_corridor(source_id)` returns corridor bands and ETAs
   - `get_ranked_sites(top_n=10, site_type=None)` returns the ranked sites
   - `get_site(site_id)` returns one site's details
   - `get_exposed_population()` returns the estimate with its range
3. **System prompt** (`prompts/system.md`): role is an air-quality emergency advisor for Indian authorities. Rules: use only tool data and never invent numbers; cite ETA, PM2.5 delta and occupancy in every reason; order by urgency (ETA) and vulnerability; give concrete actions (keep children indoors, close outdoor activities, activate air purifiers, N95 distribution, shift elective hospital procedures, advisory by DPCC/CAQM aligned with GRAP); say honestly that the forecast is uncertain, and give ranges
4. **Structured output**: the agent must return the `actions.json` schema (use Strands structured output or a Pydantic model with validation and one retry on invalid output)
5. **Two sets of actions**: per-site `actions[]` (priority, site, who, action, reason, deadline) and city-level `authority_actions[]`. Include a plain-language `summary` (3 sentences) that fits the demo ("Smoke from Punjab reaches Delhi in about 2 hours; 1.2M people exposed; protect AIIMS and these schools first")
6. **Optional**: Hindi version of the summary (`summary_hi`) for the demo
7. **Optional (swarm flavour)**: split into a planner agent and a critic agent that checks every number against the tools. Only if time allows, since one good agent is enough
8. **CLI**: `python -m agent.agent --live` writes `actions.json` next to the other outputs
9. **Tests**: mock the model and verify tool outputs plus schema validation. Add one manual review of a real run, saved in `agent/tests/reviewed_run.json` and labelled with its input snapshot

## Part B — Map UI (`web/`)

### Behaviour
**One map** showing everything. A judge should understand the product in 10 seconds.

### Tasks
1. **Scaffold** Vite + React + TS + MapLibre GL, centred on Punjab → Delhi (about 29.8°N, 76.5°E, zoom 6.5)
2. **Data layer** (`src/api/`): `getSources()`, `getCorridor()`, `getSites()`, `getRankedSites()`, `getActions()`. If `API_BASE_URL` is empty, fetch the real snapshot files copied from `data/live/` into `public/`. Show clear loading and error states
3. **Map layers** (toggle each in a legend):
   - Sources: pulsing red/orange markers sized by `emission_strength`; popup with fire count, FRP, confidence
   - Corridor: translucent polygons coloured by time band (0–2 h dark red → 8–24 h light yellow), plus the dashed centreline with hour labels
   - Sites: school and hospital icons, sized or coloured by `risk_score`; top-ranked sites get a numbered badge; popup with name, ETA, PM2.5 delta, occupancy
   - Stations (optional): AQI dots coloured by CPCB category
4. **Side panel**:
   - Top: headline numbers: sources detected, **time to Delhi (ETA)**, **exposed people (with range)**
   - Agent summary text
   - Ranked list of sites; clicking an item flies the map to it
   - Action plan: priority cards with action, who, deadline, reason; a separate "For authorities" section
5. **Time slider** (0–48 h) that filters corridor bands and animates the plume
6. **Responsive and accessible**: usable on laptop and phone, readable contrast, keyboard-focusable controls, colour not the only signal (icons and labels too)
7. **Polish for the demo**: a title bar with the AERIS name, "last updated" time, a "Run analysis" button (calls `POST /run` if available, otherwise re-reads the latest real result) and a legend
8. **Build**: `npm run build` creates `web/dist` for Aditya to host. Set `base` so it works on CloudFront
9. **Tests**: a few component tests (vitest) and a manual checklist for the demo scenario

## Part C — Demo video (3 minutes, required)

Judges **only** see the video, so it counts as much as the code.

| Time | Content |
|------|---------|
| 0:00–0:25 | The problem: Delhi AQI spikes, authorities react only after the fact |
| 0:25–1:15 | Live demo on the map: source detected → corridor towards Delhi → ETA and exposed people |
| 1:15–2:00 | Ranked schools/hospitals, then the agent's action plan |
| 2:00–2:40 | How it works and **where AWS fits** (Aditya records or supplies this part with the architecture diagram) |
| 2:40–3:00 | Impact and what's next |

- [ ] Write the script by day 3, record the product walkthrough on the final deployed version, edit, and subtitle it in English. Keep it at 3 minutes

## Handoffs

| To | What | When |
|----|------|------|
| Everyone | First UI running on real snapshot data (even rough) | Day 2 |
| Aditya | `agent/` with `requirements.txt` and entry point, `web/dist` build, env var list | Day 2–3 |
| Meenal, Pritam | Feedback if a field they produce is missing or awkward | Throughout |
| Aditya | Video script and walkthrough clip | Day 3–4 |

## Definition of done

- `python -m agent.agent --live` writes a valid `actions.json` that cites real numbers from the data
- `npm run dev` shows source, corridor, ranked sites and the action plan on one map using the real snapshot data
- The same UI works against the live API by changing only `API_BASE_URL`
- Demo video is recorded, 3 minutes, and readable on a phone
