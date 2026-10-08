"""
agent/bedrock_agent.py
----------------------
Strands Agents SDK + Amazon Bedrock version of the AERIS action agent.

The model only sees what the tools return (real sources, corridor, ranked sites,
exposed population from AERIS_DATA_DIR). Its plan is validated before it is
accepted: every site_id must be a real ranked site, and the plan must not be empty.

Env:
  AGENT_MODEL_ID            Bedrock model or inference-profile id (tried first)
  AGENT_FALLBACK_MODEL_IDS  comma-separated ids tried next, in order (default: Amazon Nova)
  AWS_REGION                region for the Bedrock runtime client
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from agent import tools as aeris_tools
from agent.agent import AuthorityAction, SiteAction

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "global.anthropic.claude-sonnet-4-6"
# Amazon Nova is billed directly by AWS (no Marketplace subscription), so it works
# when Anthropic models are blocked by account access or payment issues.
DEFAULT_FALLBACK_MODEL_IDS = "apac.amazon.nova-pro-v1:0,amazon.nova-pro-v1:0,apac.amazon.nova-lite-v1:0,amazon.nova-lite-v1:0"

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


def _model_ids(model_id: str | None) -> list[str]:
    """Primary model, then AGENT_FALLBACK_MODEL_IDS (comma-separated) in order, without duplicates."""
    primary = model_id or os.environ.get("AGENT_MODEL_ID", DEFAULT_MODEL_ID)
    fallbacks = os.environ.get("AGENT_FALLBACK_MODEL_IDS", DEFAULT_FALLBACK_MODEL_IDS)
    ids = [primary] + [m.strip() for m in fallbacks.split(",") if m.strip()]
    return list(dict.fromkeys(ids))


# Bounds for one model attempt. Strands' default retry (6 attempts, up to 240 s
# backoff) can spend minutes on a throttled model and time the Lambda out before
# the next model or the rules plan gets a chance.
MAX_TURNS = 8
READ_TIMEOUT_S = 60
# Do not start another model with less than this many seconds left.
MIN_SECONDS_PER_MODEL = 75


def _run_model(model_id: str) -> _Plan:
    from botocore.config import Config
    from strands import Agent, ModelRetryStrategy
    from strands.models import BedrockModel

    model = BedrockModel(
        model_id=model_id,
        region_name=os.environ.get("AWS_REGION"),
        max_tokens=8000,
        boto_client_config=Config(
            connect_timeout=5, read_timeout=READ_TIMEOUT_S, retries={"max_attempts": 2, "mode": "standard"}
        ),
    )
    agent = Agent(
        model=model,
        tools=_tools(),
        system_prompt=SYSTEM_PROMPT,
        callback_handler=None,
        retry_strategy=ModelRetryStrategy(max_attempts=2, initial_delay=2, max_delay=10),
    )
    result = agent(
        "Read the current AERIS situation with the tools and produce the action plan.",
        structured_output_model=_Plan,
        limits={"turns": MAX_TURNS},
    )
    plan = result.structured_output
    if not isinstance(plan, _Plan):
        raise ValueError(f"Agent returned no structured plan (stop_reason={result.stop_reason})")
    _validate(plan)
    return plan


def generate_bedrock_plan(model_id: str | None = None, time_budget_s: float | None = None) -> dict[str, Any]:
    """
    Run the Strands agent on Bedrock and return an actions.json-shaped dict.
    Tries each model in turn (e.g. Claude, then Amazon Nova); raises if all fail.
    With ``time_budget_s``, stops starting new models once less than
    MIN_SECONDS_PER_MODEL remains, so the caller can still fall back in time.
    """
    deadline = time.monotonic() + time_budget_s if time_budget_s else None
    errors = []
    for mid in _model_ids(model_id):
        if deadline is not None and deadline - time.monotonic() < MIN_SECONDS_PER_MODEL:
            errors.append(f"{mid}: skipped, time budget used up")
            logger.warning("Skipping Bedrock model %s: time budget used up", mid)
            continue
        try:
            plan = _run_model(mid)
        except Exception as exc:  # noqa: BLE001 - access, billing, throttling or validation: try the next model
            logger.warning("Bedrock model %s failed: %s: %s", mid, type(exc).__name__, str(exc)[:300])
            errors.append(f"{mid}: {type(exc).__name__}")
            continue
        logger.info("Bedrock plan from %s: %d site actions, %d authority actions",
                    mid, len(plan.actions), len(plan.authority_actions))
        return {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "generator": f"bedrock:{mid}",
            **plan.model_dump(),
        }
    raise RuntimeError("All Bedrock models failed: " + "; ".join(errors))
