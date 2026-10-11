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
from dataclasses import asdict
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
    from pipeline.contracts import check_aqi, check_sites

    pending = {}
    for name, (candidates, geojson) in FEEDS.items():
        keys = [event[f"{name}_key"]] if f"{name}_key" in (event or {}) else candidates
        obj = _read_first(keys, geojson)
        if name == "wind" and not any(p.get("hours") for p in obj.get("points", [])):
            raise ValueError("Cannot publish wind without usable hourly samples")
        if name in ("aqi", "sites"):
            problems = (check_aqi if name == "aqi" else check_sites)(obj)
            records = obj.get("stations" if name == "aqi" else "features")
            readings = name != "aqi" or any(any(s.get(k) is not None for k in ("pm25", "pm10", "aqi")) for s in records or [])
            if problems or not records or not readings:
                raise ValueError(f"Cannot publish unavailable or invalid {name}: {problems}")
        storage.serialize_json(obj)  # Validate all feeds before starting publication.
        pending[name] = (obj, geojson)
    out = {name: storage.write_json(name, obj, geojson=geojson)
           for name, (obj, geojson) in pending.items()}
    return {"published": out}


def _read_first(keys: list[str], geojson: bool) -> Any:
    for key in keys:
        try:
            return storage.read_json(key, geojson=geojson)
        except FileNotFoundError:
            logger.warning("publish: %s not found", key)
    raise FileNotFoundError(f"None of {keys} exist")


def detect_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from models.source_detection import cluster

    raw = storage.read_bytes(_key(event, "fires", "fires"))
    fires = storage.parse_json(raw)
    if not fires.get("fires"):
        raise ValueError("fires.json has no detections; keeping the previous sources.json")
    params = cluster.SourceDetectionParams()
    result = cluster.detect_sources(fires, params=params)
    if not result["sources"]:
        raise ValueError(f"{len(fires['fires'])} fires formed no source cluster; keeping the previous sources.json")
    loc = _write_model("sources", result, {"fires": raw}, Path(cluster.__file__),
                       "fire-dbscan-v1", asdict(params), "BASELINE_UNCALIBRATED",
                       {"confidence": "HEURISTIC_SCORE_NOT_PROBABILITY",
                        "confidence_weights": cluster._CONFIDENCE_WEIGHTS,
                        "type": "REGION_SEASON_PROXY_NOT_VERIFIED_LAND_USE",
                        "emission_strength": "NORMALIZED_FRP_PROXY_NOT_EMISSION_MASS",
                        "total_frp_mw": "SUM_OF_SATELLITE_FRP_MW"})
    logger.info("detect: %d fires -> %d sources -> %s", len(fires["fires"]), len(result["sources"]), loc)
    return {"location": loc, "sources": len(result["sources"])}


def corridor_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from models.plume.advect import parse_time
    from models.plume import corridor as engine
    from models.plume.parameters import load_parameters

    sources_key = _key(event, "sources", "sources")
    raw_sources = storage.read_bytes(sources_key)
    raw_wind = storage.read_bytes(_key(event, "wind", "wind"))
    sources, wind = storage.parse_json(raw_sources), storage.parse_json(raw_wind)
    lineage = storage.describe_model_bytes(sources_key, "sources", raw_sources)
    loaded = load_parameters((event or {}).get("plume_params"))
    forecast_start = (event or {}).get("forecast_start")
    result = engine.predict_corridor(
        sources, wind,
        hours=(event or {}).get("forecast_hours", 48),
        start=parse_time(forecast_start, "forecast_start") if forecast_start is not None else None,
        params=loaded.params,
    )
    loc = _write_model("corridor", result, {"sources": raw_sources, "wind": raw_wind},
                       Path(engine.__file__), "lagrangian-puff-v1", asdict(loaded.params), loaded.provenance,
                       {"pm25_delta_ugm3": "SOURCE_BAND_GRID_TIME_PEAK_NOT_RECEPTOR_CONCENTRATION",
                        "concentration_units": "ug/m3",
                        "risk": "UNCALIBRATED_RELATIVE_SCORE_NOT_HEALTH_PROBABILITY",
                        "parameter_calibration": loaded.metadata.get("status") if loaded.metadata else "NOT_ESTABLISHED",
                        "wind_validation": "REQUESTED_PATH_AND_TIME_VALIDATED_BY_WIND_FIELD",
                        "feed_coverage_complete": wind.get("coverage_complete")}, lineage=lineage)
    logger.info("corridor: %d features -> %s", len(result["features"]), loc)
    return {"location": loc, "features": len(result["features"])}


def _write_model(kind, result, inputs, code, version, parameters, parameter_source, semantics, *, lineage=None):
    from models.common.provenance import manifest_for_bytes

    metadata = manifest_for_bytes(body=storage.serialize_json(result).encode("utf-8"), kind=kind,
                                  inputs=inputs, model_version=version, model_code=code,
                                  parameters=parameters, parameter_source=parameter_source, semantics=semantics)
    if lineage is not None:
        metadata["inputs"]["sources"].update(lineage)
    # Readers verify the pair. A interrupted two-object write cannot appear bound.
    loc = storage.write_json(kind, result, geojson=kind == "corridor")
    storage.write_json(f"{kind}.provenance", metadata)
    return loc


def rank_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    from models.exposure.rank_sites import rank_sites

    corridor = storage.read_model_artifact(_key(event, "corridor", "corridor"), "corridor")
    sites = storage.read_json(_key(event, "sites", "sites"), geojson=True)
    population = storage.read_json(_key(event, "population", "reference/population/latest"))
    if not population.get("cells"):
        raise ValueError("population.json has no cells")
    result = rank_sites(corridor, sites, population)
    result["model_context"] = {"corridor": corridor["provenance"],
                               "pm25_delta_ugm3": "SOURCE_BAND_PEAK_NOT_RECEPTOR_CONCENTRATION",
                               "population": "SPATIAL_EXPOSURE_PROXY_NOT_OBSERVED_HEALTH_OUTCOME"}
    loc = storage.write_json("ranked_sites", result)
    logger.info("rank: %d sites, %s exposed -> %s", len(result["sites"]), result["exposed_population"], loc)
    return {"location": loc, "sites": len(result["sites"])}


# Files the agent tools read from AERIS_DATA_DIR.
_AGENT_INPUTS = [("sources", False), ("corridor", True), ("ranked_sites", False), ("sites", True)]


# Seconds kept back from the Lambda timeout for the rules fallback and the S3 write.
_AGENT_RESERVE_S = 30


def _agent_budget(context: Any) -> float | None:
    """Seconds the Bedrock attempts may use, from the Lambda's remaining time."""
    if context is None or not hasattr(context, "get_remaining_time_in_millis"):
        return None
    return max(0.0, context.get_remaining_time_in_millis() / 1000 - _AGENT_RESERVE_S)


def agent_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Stage gold/ inputs in a temp dir for the agent tools, run the agent, write actions.json."""
    from agent.agent import run

    with tempfile.TemporaryDirectory() as tmp:
        for name, geojson in _AGENT_INPUTS:
            key = _key(event, name, name)
            (Path(tmp) / f"{name}{'.geojson' if geojson else '.json'}").write_bytes(storage.read_bytes(key, geojson=geojson))
            if name in ("sources", "corridor"):
                try:
                    raw = storage.read_bytes(f"{key}.provenance")
                except FileNotFoundError:
                    continue
                (Path(tmp) / f"{name}.provenance.json").write_bytes(raw)
        previous = os.environ.get("AERIS_DATA_DIR")
        try:
            result = run(Path(tmp), time_budget_s=_agent_budget(context))
        finally:
            if previous is None:
                os.environ.pop("AERIS_DATA_DIR", None)
            else:
                os.environ["AERIS_DATA_DIR"] = previous
    loc = storage.write_json("actions", result)
    logger.info("agent: %s, %d site actions -> %s", result.get("generator"), len(result["actions"]), loc)
    return {"location": loc, "actions": len(result["actions"]), "generator": result.get("generator")}
