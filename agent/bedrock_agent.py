"""
agent/bedrock_agent.py
----------------------
Strands Agents SDK + Amazon Bedrock version of the AERIS action agent.

The model only sees what the tools return (real sources, corridor, ranked sites,
exposed population from AERIS_DATA_DIR). Its plan is validated before it is
accepted: every site_id must be a real ranked site, and the plan must not be empty.

Env:
  AGENT_MODEL_ID   Bedrock model or inference-profile id
  AWS_REGION       region for the Bedrock runtime client
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from agent import tools as aeris_tools
from agent.agent import AuthorityAction, SiteAction

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "anthropic.claude-opus-5-5"

SYSTEM_PROMPT = """You are the AERIS action agent for air-quality emergencies in north-west India \
(Punjab, Haryana, Delhi NCR). Smoke from detected fires is forecast to move along a corridor; \
schools and hospitals inside it are ranked by risk.

Use the tools to read the current situation, then write a prioritised action plan.

Rules:
- Use only numbers returned by the tools (ETA hours, PM2.5 delta, occupancy, exposed population, \
fire counts). Never estimate or invent a figure. If a number is missing, leave it out.
- Site actions: one per site, for the highest-risk ranked sites (at most 8), using each site's \
real site_id. "who" names the responsible role at that site. "reason" cites that site's ETA, \
PM2.5 delta and occupancy. deadline_hours is before the site's ETA.
- Authority actions: 2-4 actions for regional bodies (CAQM, DPCC, state pollution control boards, \
education and health departments), each with a reason grounded in the tool data.
- Summary: 2-3 plain sentences a duty officer can read in 15 seconds.
- If the tools report no ranked sites, say so in the summary and return no site actions."""


class _Plan(BaseModel):
    summary: str
    actions: list[SiteAction]
    authority_actions: list[AuthorityAction]


def _tools() -> list[Any]:
    from strands import tool

    @tool
    def get_sources() -> str:
        """Detected fire/pollution sources: id, type, location, fire count, total FRP, emission strength."""
        return json.dumps(aeris_tools.get_sources())

    @tool
    def query_corridor() -> str:
        """Forecast smoke corridor bands per source: hour_from, hour_to, risk, pm25_delta_ugm3."""
        return json.dumps(aeris_tools.query_corridor())

    @tool
    def get_ranked_sites(top_n: int = 10) -> str:
        """Schools and hospitals inside the corridor, highest risk first, with ETA, PM2.5 delta and occupancy."""
        return json.dumps(aeris_tools.get_ranked_sites(top_n=top_n))

    @tool
    def get_site(site_id: str) -> str:
        """Full record for one site by site_id."""
        return json.dumps(aeris_tools.get_site(site_id))

    @tool
    def get_exposed_population() -> str:
        """Estimated people inside the corridor: estimate, low, high."""
        return json.dumps(aeris_tools.get_exposed_population())

    return [get_sources, query_corridor, get_ranked_sites, get_site, get_exposed_population]


def _validate(plan: _Plan) -> None:
    known = {s["site_id"] for s in aeris_tools.get_ranked_sites(top_n=10_000)}
    unknown = [a.site_id for a in plan.actions if a.site_id not in known]
    if unknown:
        raise ValueError(f"Agent cited site_ids that are not ranked sites: {unknown}")
    if not plan.summary.strip():
        raise ValueError("Agent returned an empty summary")
    if known and not plan.actions:
        raise ValueError("Agent returned no site actions although ranked sites exist")


def generate_bedrock_plan(model_id: str | None = None) -> dict[str, Any]:
    """Run the Strands agent on Bedrock and return an actions.json-shaped dict."""
    from strands import Agent
    from strands.models import BedrockModel

    model_id = model_id or os.environ.get("AGENT_MODEL_ID", DEFAULT_MODEL_ID)
    model = BedrockModel(model_id=model_id, region_name=os.environ.get("AWS_REGION"), max_tokens=8000)
    agent = Agent(model=model, tools=_tools(), system_prompt=SYSTEM_PROMPT, callback_handler=None)

    result = agent(
        "Read the current AERIS situation with the tools and produce the action plan.",
        structured_output_model=_Plan,
    )
    plan = result.structured_output
    if not isinstance(plan, _Plan):
        raise ValueError(f"Agent returned no structured plan (stop_reason={result.stop_reason})")
    _validate(plan)
    logger.info("Bedrock plan: %d site actions, %d authority actions", len(plan.actions), len(plan.authority_actions))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "generator": f"bedrock:{model_id}",
        **plan.model_dump(),
    }
