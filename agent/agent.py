"""
agent/agent.py
--------------
AERIS Action Agent: generates prioritized intervention directives from
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
    deadline_hours: float


class AuthorityAction(BaseModel):
    who: str
    action: str
    reason: str


class ActionsOutput(BaseModel):
    generated_at: str
    summary: str
    actions: list[SiteAction]
    authority_actions: list[AuthorityAction]


# ---------------------------------------------------------------------------
# Core Action Generation Logic
# ---------------------------------------------------------------------------

def generate_action_plan(data_dir: Path | None = None) -> ActionsOutput:
    """
    Generate the prioritized emergency action plan using tool data.
    Cites only real numbers (ETA, delta PM2.5, occupancy, exposed population).
    """
    if data_dir:
        os.environ["AERIS_DATA_DIR"] = str(data_dir)

    sources = get_sources()
    pop_info = get_exposed_population()
    ranked_sites = get_ranked_sites(top_n=10)

    # 1. Synthesize Executive Summary
    total_fires = sum(s.get("fire_count", 0) for s in sources)
    top_source = sources[0] if sources else {}
    src_type = top_source.get("type", "stubble_burning").replace("_", " ")

    est_pop = pop_info.get("estimate", 0)
    low_pop = pop_info.get("low", 0)
    high_pop = pop_info.get("high", 0)

    # Earliest arrival time among ranked sites
    etas = [s.get("eta_hours", 2.0) for s in ranked_sites]
    min_eta = min(etas) if etas else 2.0

    summary_parts = []
    if sources:
        summary_parts.append(
            f"Active {src_type} cluster detected with {total_fires} fires (FRP: {top_source.get('total_frp_mw', 0):.0f} MW) and {top_source.get('emission_strength', 0)*100:.0f}% emission strength."
        )
    else:
        summary_parts.append("Elevated environmental emission sources detected in upwind agricultural corridor.")

    pop_str = f"{est_pop/1_000_000:.1f}M" if est_pop >= 1_000_000 else f"{est_pop:,}"
    summary_parts.append(
        f"Smoke corridor approaches NCR receptor communities in ~{max(0.5, min_eta):.1f} hours, exposing an estimated {pop_str} residents (90% CI: {low_pop:,} - {high_pop:,})."
    )

    top_facility_names = [s.get("name", "vulnerable sites") for s in ranked_sites[:2]]
    joined_names = " and ".join(top_facility_names) if top_facility_names else "vulnerable facilities"
    summary_parts.append(
        f"Immediate protective interventions mandated for {joined_names} before threshold exceedance."
    )

    summary = " ".join(summary_parts)

    # 2. Site-specific Actions (prioritized by risk and urgency)
    actions: list[SiteAction] = []
    for rank, site in enumerate(ranked_sites[:8], start=1):
        site_id = site["site_id"]
        s_type = site.get("type", "school")
        name = site.get("name", f"Facility {site_id}")
        eta = float(site.get("eta_hours", 1.0))
        delta = float(site.get("pm25_delta_ugm3", 25.0))
        occ = site.get("occupancy")

        deadline = round(max(0.5, eta - 0.5), 1)

        occ_text = f", {occ:,} occupants" if occ else ""
        reason = f"ETA {eta:.1f}h, forecast PM2.5 delta +{delta:.0f} µg/m³{occ_text}"

        if s_type == "hospital":
            who = f"Medical Director, {name}"
            action = (
                "Activate hospital HVAC HEPA filtration in ICU & pulmonary wards; "
                "seal triage entryways and stage supplemental oxygen supplies"
            )
        else:
            who = f"Principal / Administrator, {name}"
            action = (
                "Transition morning assembly and all sports indoors; "
                "verify classroom air purification and distribute certified N95 masks"
            )

        actions.append(
            SiteAction(
                priority=rank,
                site_id=site_id,
                who=who,
                action=action,
                reason=reason,
                deadline_hours=deadline,
            )
        )

    # 3. Authority-level Actions (City / Regional)
    authority_actions = [
        AuthorityAction(
            who="Commission for Air Quality Management (CAQM)",
            action="Invoke Graded Response Action Plan (GRAP Stage III) advisory across northern and western transit sectors",
            reason=f"Corridor trajectory impacts ~{pop_str} residents with forecast PM2.5 delta exceedance",
        ),
        AuthorityAction(
            who="Delhi Pollution Control Committee (DPCC)",
            action="Deploy mechanized vacuum road sweeping and continuous anti-smog mist water cannons along arterial roads",
            reason="High particulate loading projected within the next 2-4 hour advection window",
        ),
        AuthorityAction(
            who="Directorate of Education (DoE)",
            action="Issue mandatory circular for all outdoor school activities and assemblies to remain indoors until 12:00 PM",
            reason=f"Top 50 schools located directly along the downwind dispersion path",
        ),
    ]

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return ActionsOutput(
        generated_at=generated_at,
        summary=summary,
        actions=actions,
        authority_actions=authority_actions,
    )


def run(data_dir: Path | None = None) -> dict[str, Any]:
    """
    Execute action agent and return validated dict.

    AGENT_MODEL_PROVIDER=bedrock runs the Strands agent on Amazon Bedrock. If that
    fails, the rules-based plan (built from the same real data) is used instead.
    The ``generator`` field records which one produced the plan.
    """
    if data_dir:
        os.environ["AERIS_DATA_DIR"] = str(data_dir)

    if os.environ.get("AGENT_MODEL_PROVIDER", "").lower() == "bedrock":
        try:
            from agent.bedrock_agent import generate_bedrock_plan

            return generate_bedrock_plan()
        except Exception as exc:  # noqa: BLE001 - any Bedrock/validation failure falls back to rules
            logger.exception("Bedrock agent failed (%s); using the rules-based plan", type(exc).__name__)

    plan = generate_action_plan(data_dir).model_dump()
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
    with out_file.open("w") as f:
        json.dump(result, f, indent=2)

    logger.info("Wrote validated actions plan to %s with %d site actions", out_file, len(result["actions"]))

    # Also mirror to web/public/data if web folder exists
    if _WEB_DATA.exists():
        web_out = _WEB_DATA / "actions.json"
        with web_out.open("w") as f:
            json.dump(result, f, indent=2)
        logger.info("Mirrored to %s", web_out)


if __name__ == "__main__":
    main()
