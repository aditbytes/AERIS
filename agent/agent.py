"""
agent/agent.py
--------------
AERIS Action Agent: generates prioritized advisory review suggestions from
real pipeline snapshot data using Strands Agent principles.
Follows docs/members/saba-agent-ui.md and docs/data-contracts.md.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from agent.tools import (
    get_exposed_population,
    get_ranked_sites,
    get_site,
    get_sources,
    query_corridor,
)

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[1]
_DATA_LIVE = _REPO_ROOT / "data" / "live"
_WEB_DATA = _REPO_ROOT / "web" / "public" / "data"


# ---------------------------------------------------------------------------
# Output Schemas (Pydantic validation)
# ---------------------------------------------------------------------------

class SiteAction(BaseModel):
    priority: int
    site_id: str
    who: str
    action: str
    reason: str
    deadline_hours: float = Field(ge=0, allow_inf_nan=False)


class AuthorityAction(BaseModel):
    who: str
    action: str
    reason: str


class ActionsOutput(BaseModel):
    generated_at: str
    summary: str
    actions: list[SiteAction]
    authority_actions: list[AuthorityAction]
    advisory_only: bool = True


# ---------------------------------------------------------------------------
# Core Action Generation Logic
# ---------------------------------------------------------------------------

def generate_action_plan(data_dir: Path | None = None) -> ActionsOutput:
    """
    Generate advisory review suggestions using available tool data.
    Cites only real numbers (ETA, delta PM2.5, occupancy, exposed population).
    """
    if data_dir:
        os.environ["AERIS_DATA_DIR"] = str(data_dir)

    sources = get_sources()
    pop_info = get_exposed_population()
    ranked_sites = get_ranked_sites(top_n=10)

    def number(value):
        import math
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0 else None

    parts = [f'{len(sources)} candidate source clusters recorded; source type and confidence are heuristic proxies.'
             if sources else 'Source evidence unavailable or empty; no emission source is asserted.']
    etas = [value for site in ranked_sites if (value := number(site.get('eta_hours'))) is not None]
    parts.append(f'Earliest model band arrival among ranked sites: {min(etas):.1f} hours from forecast start.'
                 if etas else 'Arrival estimate unavailable.')
    values = [number(pop_info.get(key)) for key in ('estimate', 'low', 'high')]
    if pop_info.get('data_available') is False or any(v is None for v in values) or not values[1] <= values[0] <= values[2]:
        parts.append('Population estimate unavailable (population data unavailable).')
    else:
        estimate, low, high = values
        parts.append(f'Corridor population proxy: {estimate:,} (exposure range: {low:,} - {high:,}); heuristic range with no established statistical coverage or observed exposure.')
    parts.append('Uncalibrated model outputs require review against current observations; these are advisory suggestions, not emergency orders or medical advice.')

    actions = []
    for site in ranked_sites[:8]:
        site_id = site.get('site_id')
        if not isinstance(site_id, str) or not site_id.strip():
            continue
        eta = number(site.get('eta_hours'))
        delta = number(site.get('pm25_delta_ugm3'))
        occupancy = number(site.get('occupancy'))
        evidence = [f'Model band arrival {eta:.1f}h from forecast start' if eta is not None else 'Arrival unavailable',
                    f'source-band peak proxy +{delta:g} µg/m³ (not receptor concentration)' if delta is not None else 'PM2.5 change unavailable']
        if occupancy is not None:
            evidence.append(f'{occupancy:,} recorded occupants')
        evidence.append('Deadline 0 means review now; future deadlines are a scheduling heuristic relative to forecast start, not a safety threshold')
        actions.append(SiteAction(priority=len(actions)+1, site_id=site_id,
                                  who=f"Site administrator, {site.get('name') or site_id}",
                                  action='Review current local air-quality observations and the applicable site response protocol before deciding on protective measures',
                                  reason='; '.join(evidence),
                                  deadline_hours=round(max(0, eta-0.5), 1) if eta is not None else 0))
    authority_actions = [AuthorityAction(who='Regional duty officer',
                                         action='Verify feed freshness, wind coverage and model provenance before using this advisory plan',
                                         reason=f'{len(ranked_sites)} ranked facilities recorded; no validated threat threshold or legal response stage is inferred')]
    return ActionsOutput(generated_at=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                         summary=' '.join(parts), actions=actions, authority_actions=authority_actions)


def run(data_dir: Path | None = None, time_budget_s: float | None = None) -> dict[str, Any]:
    """
    Execute action agent and return validated dict.

    AGENT_MODEL_PROVIDER=bedrock runs the Strands agent on Amazon Bedrock. If that
    fails, the rules-based plan (built from the same real data) is used instead.
    The ``generator`` field records which one produced the plan. ``time_budget_s``
    bounds how long the Bedrock attempts may take before falling back.
    """
    if data_dir:
        os.environ["AERIS_DATA_DIR"] = str(data_dir)

    if os.environ.get("AGENT_MODEL_PROVIDER", "").lower() == "bedrock":
        try:
            from agent.bedrock_agent import generate_bedrock_plan

            return generate_bedrock_plan(time_budget_s=time_budget_s)
        except Exception as exc:  # noqa: BLE001 - any Bedrock/validation failure falls back to rules
            logger.exception("Bedrock agent failed (%s); using the rules-based plan", type(exc).__name__)

    plan = generate_action_plan(data_dir).model_dump()
    from agent.tools import get_model_context

    plan["model_context"] = get_model_context()
    plan["generator"] = "rules"
    return plan


def main() -> None:
    parser = argparse.ArgumentParser(description="AERIS Strands Action Agent")
    parser.add_argument("--live", action="store_true", help="Read from data/live/ and write actions.json")
    parser.add_argument("--out", type=str, default="", help="Custom output path")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    data_dir = _DATA_LIVE if args.live else Path(os.environ.get("AERIS_DATA_DIR", _DATA_LIVE))
    result = run(data_dir)

    out_file = Path(args.out) if args.out else data_dir / "actions.json"
    with out_file.open("w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    logger.info("Wrote validated actions plan to %s with %d site actions", out_file, len(result["actions"]))

    # Also mirror to web/public/data if web folder exists
    if _WEB_DATA.exists():
        web_out = _WEB_DATA / "actions.json"
        with web_out.open("w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        logger.info("Mirrored to %s", web_out)


if __name__ == "__main__":
    main()
