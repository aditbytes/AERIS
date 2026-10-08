"""
pipeline/steps.py
-----------------
Lambda handlers for the AERIS pipeline, run in order by Step Functions:

    publish -> detect -> corridor -> rank -> agent

Each step reads its real inputs through ``ingest.common.storage`` and writes one
contract file. With ``AERIS_STORAGE=s3`` plain keys land in ``gold/``; inputs come
from ``bronze/<feed>/latest`` (live feeds) and ``reference/<name>/latest``
(one-time datasets). Every step raises on missing or empty input, so a failed
upstream fetch never overwrites the last real ``gold/`` result.

Locally (``AERIS_STORAGE=local``) the same handlers read and write ``data/live/``
when the event overrides the input keys, e.g. ``{"fires_key": "fires"}``.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from ingest.common import storage

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Live feeds published into gold/ unchanged so the API serves one consistent set.
# Each feed lists candidate keys in order; the first that exists is used.
FEEDS = {
    "fires": (["bronze/fires/latest"], False),
    "aqi": (["bronze/aqi/latest"], False),
    "wind": (["bronze/wind/latest"], False),
    # reference/ never expires; bronze/sites is the pre-reference location (expires after 14 days)
    "sites": (["reference/sites/latest", "bronze/sites/latest"], True),
}


def _key(event: dict[str, Any], name: str, default: str) -> str:
    return (event or {}).get(f"{name}_key", default)


def publish_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Copy the latest real feeds into gold/ (fires, aqi, wind, sites)."""
    out = {}
    for name, (candidates, geojson) in FEEDS.items():
        keys = [event[f"{name}_key"]] if f"{name}_key" in (event or {}) else candidates
        obj = _read_first(keys, geojson)
        out[name] = storage.write_json(name, obj, geojson=geojson)
    return {"published": out}


def _read_first(keys: list[str], geojson: bool) -> Any:
    for key in keys:
        try:
            return storage.read_json(key, geojson=geojson)
        except FileNotFoundError:
            logger.warning("publish: %s not found", key)
    raise FileNotFoundError(f"None of {keys} exist")


def detect_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from models.source_detection.cluster import detect_sources

    fires = storage.read_json(_key(event, "fires", "fires"))
    if not fires.get("fires"):
        raise ValueError("fires.json has no detections; keeping the previous sources.json")
    result = detect_sources(fires)
    if not result["sources"]:
        raise ValueError(f"{len(fires['fires'])} fires formed no source cluster; keeping the previous sources.json")
    loc = storage.write_json("sources", result)
    logger.info("detect: %d fires -> %d sources -> %s", len(fires["fires"]), len(result["sources"]), loc)
    return {"location": loc, "sources": len(result["sources"])}


def corridor_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from models.plume.advect import parse_time
    from models.plume.corridor import predict_corridor

    sources = storage.read_json(_key(event, "sources", "sources"))
    wind = storage.read_json(_key(event, "wind", "wind"))
    forecast_start = (event or {}).get("forecast_start")
    result = predict_corridor(
        sources, wind,
        hours=(event or {}).get("forecast_hours", 48),
        start=parse_time(forecast_start, "forecast_start") if forecast_start is not None else None,
        params=(event or {}).get("plume_params"),
    )
    loc = storage.write_json("corridor", result, geojson=True)
    logger.info("corridor: %d features -> %s", len(result["features"]), loc)
    return {"location": loc, "features": len(result["features"])}


def rank_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from models.exposure.rank_sites import rank_sites

    corridor = storage.read_json(_key(event, "corridor", "corridor"), geojson=True)
    sites = storage.read_json(_key(event, "sites", "sites"), geojson=True)
    population = storage.read_json(_key(event, "population", "reference/population/latest"))
    if not population.get("cells"):
        raise ValueError("population.json has no cells")
    result = rank_sites(corridor, sites, population)
    loc = storage.write_json("ranked_sites", result)
    logger.info("rank: %d sites, %s exposed -> %s", len(result["sites"]), result["exposed_population"], loc)
    return {"location": loc, "sites": len(result["sites"])}


# Files the agent tools read from AERIS_DATA_DIR.
_AGENT_INPUTS = [("sources", False), ("corridor", True), ("ranked_sites", False), ("sites", True)]


def agent_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Stage gold/ inputs in a temp dir for the agent tools, run the agent, write actions.json."""
    import json

    from agent.agent import run

    with tempfile.TemporaryDirectory() as tmp:
        for name, geojson in _AGENT_INPUTS:
            obj = storage.read_json(_key(event, name, name), geojson=geojson)
            (Path(tmp) / f"{name}{'.geojson' if geojson else '.json'}").write_text(json.dumps(obj))
        previous = os.environ.get("AERIS_DATA_DIR")
        try:
            result = run(Path(tmp))
        finally:
            if previous is None:
                os.environ.pop("AERIS_DATA_DIR", None)
            else:
                os.environ["AERIS_DATA_DIR"] = previous
    loc = storage.write_json("actions", result)
    logger.info("agent: %s, %d site actions -> %s", result.get("generator"), len(result["actions"]), loc)
    return {"location": loc, "actions": len(result["actions"]), "generator": result.get("generator")}
