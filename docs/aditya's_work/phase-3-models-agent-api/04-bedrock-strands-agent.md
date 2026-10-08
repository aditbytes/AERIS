# 3.4 Bedrock and the Strands Agent

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 6. Satisfies the prize rule on AWS open-source tooling (Strands Agents SDK).

- [ ] Enable Bedrock model access in a region offering the chosen Claude model (cross-region calls if needed)
- [ ] Set env vars so Saba's agent uses the Bedrock provider instead of the local default
- [ ] Host as a Lambda (simplest) or Bedrock AgentCore Runtime
- [ ] Raise Lambda timeout — agent runs take 30–60 s
- [ ] Write result to `gold/actions.json`
- [ ] Optional: Bedrock Guardrails for safe output

**Done when:** an end-to-end run produces an action plan grounded only in real corridor and site data.
