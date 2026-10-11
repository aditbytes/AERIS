"""
pipeline/contracts.py
---------------------
Checks that an object matches its format in docs/data-contracts.md. Each check
returns a list of problems (empty = valid); nothing is coerced or filled in.

Used by scripts/smoke_test.py against the live API and by tests against data/live/.
"""

from __future__ import annotations

from datetime import datetime
import math
from typing import Any, Callable

Problems = list[str]


def _is_time(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    try:
        datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _in01(v: Any) -> bool:
    return _num(v) and 0 <= v <= 1


def _latlon(o: dict[str, Any], where: str) -> Problems:
    p = []
    if not (_num(o.get("lat")) and -90 <= o["lat"] <= 90):
        p.append(f"{where}: bad lat {o.get('lat')!r}")
    if not (_num(o.get("lon")) and -180 <= o["lon"] <= 180):
        p.append(f"{where}: bad lon {o.get('lon')!r}")
    return p


def _stamped(obj: Any, name: str) -> Problems:
    if not isinstance(obj, dict):
        return [f"{name}: not an object"]
    return [] if _is_time(obj.get("generated_at")) else [f"{name}: missing or invalid generated_at"]


def check_sources(obj: Any) -> Problems:
    p = _stamped(obj, "sources")
    for i, s in enumerate(obj.get("sources") or []):
        w = f"sources[{i}]"
        p += _latlon(s, w)
        for k in ("id", "type"):
            if not isinstance(s.get(k), str):
                p.append(f"{w}: missing {k}")
        if not (isinstance(s.get("fire_count"), int) and s["fire_count"] > 0):
            p.append(f"{w}: fire_count must be a positive int")
        for k in ("total_frp_mw", "radius_km"):
            if not (_num(s.get(k)) and s[k] >= 0):
                p.append(f"{w}: bad {k}")
        for k in ("confidence", "emission_strength"):
            if not _in01(s.get(k)):
                p.append(f"{w}: {k} must be 0-1")
        for k in ("first_seen", "last_seen"):
            if not _is_time(s.get(k)):
                p.append(f"{w}: bad {k}")
    if not isinstance(obj.get("sources"), list):
        p.append("sources: 'sources' must be a list")
    return p


def check_corridor(obj: Any) -> Problems:
    p = _stamped(obj, "corridor")
    if obj.get("type") != "FeatureCollection":
        return p + ["corridor: not a FeatureCollection"]
    for i, f in enumerate(obj.get("features") or []):
        w = f"corridor.features[{i}]"
        props, geom = f.get("properties") or {}, f.get("geometry") or {}
        kind = props.get("kind")
        if kind == "band":
            if geom.get("type") != "Polygon":
                p.append(f"{w}: band must be a Polygon")
            elif geom["coordinates"][0][0] != geom["coordinates"][0][-1]:
                p.append(f"{w}: polygon ring not closed")
            if not (_num(props.get("hour_from")) and _num(props.get("hour_to")) and props["hour_from"] < props["hour_to"]):
                p.append(f"{w}: hour_from must be < hour_to")
            if not _in01(props.get("risk")):
                p.append(f"{w}: risk must be 0-1")
            if not (_num(props.get("pm25_delta_ugm3")) and props["pm25_delta_ugm3"] >= 0):
                p.append(f"{w}: bad pm25_delta_ugm3")
        elif kind == "centerline":
            if geom.get("type") != "LineString":
                p.append(f"{w}: centerline must be a LineString")
            elif len(props.get("points_eta_hours") or []) != len(geom.get("coordinates") or []):
                p.append(f"{w}: points_eta_hours length != coordinates length")
        else:
            p.append(f"{w}: unknown kind {kind!r}")
        if not isinstance(props.get("source_id"), str):
            p.append(f"{w}: missing source_id")
    return p


def check_sites(obj: Any) -> Problems:
    p = []
    if not isinstance(obj, dict) or obj.get("type") != "FeatureCollection":
        return ["sites: not a FeatureCollection"]
    if not obj.get("features"):
        p.append("sites: no features")
    for i, f in enumerate(obj.get("features") or []):
        w = f"sites.features[{i}]"
        props = f.get("properties") or {}
        if (f.get("geometry") or {}).get("type") != "Point":
            p.append(f"{w}: not a Point")
        if props.get("type") not in ("school", "hospital"):
            p.append(f"{w}: type must be school or hospital")
        if not isinstance(props.get("id"), str):
            p.append(f"{w}: missing id")
        if len(p) > 20:
            break
    return p


def check_ranked_sites(obj: Any) -> Problems:
    p = _stamped(obj, "ranked_sites")
    exp = obj.get("exposed_population") or {}
    for k in ("estimate", "low", "high"):
        if not (isinstance(exp.get(k), int) and exp[k] >= 0):
            p.append(f"ranked_sites: exposed_population.{k} must be a non-negative int")
    if "data_available" in exp and not isinstance(exp["data_available"], bool):
        p.append("ranked_sites: exposed_population.data_available must be a bool")
    if "method" in exp and not (isinstance(exp["method"], str) and exp["method"].strip()):
        p.append("ranked_sites: exposed_population.method must be a non-empty str")
    ranks = []
    for i, s in enumerate(obj.get("sites") or []):
        w = f"ranked_sites.sites[{i}]"
        p += _latlon(s, w)
        if s.get("type") not in ("school", "hospital"):
            p.append(f"{w}: type must be school or hospital")
        for k in ("site_id", "name", "source_id"):
            if not isinstance(s.get(k), str):
                p.append(f"{w}: missing {k}")
        if not _in01(s.get("risk_score")):
            p.append(f"{w}: risk_score must be 0-1")
        for k in ("eta_hours", "pm25_delta_ugm3"):
            if not (_num(s.get(k)) and s[k] >= 0):
                p.append(f"{w}: bad {k}")
        ranks.append(s.get("rank"))
    if ranks != list(range(1, len(ranks) + 1)):
        p.append("ranked_sites: rank must run 1..n in order")
    return p


def check_actions(obj: Any, ranked_ids: set[str] | None = None) -> Problems:
    p = _stamped(obj, "actions")
    if not (isinstance(obj.get("summary"), str) and obj["summary"].strip()):
        p.append("actions: empty summary")
    for i, a in enumerate(obj.get("actions") or []):
        w = f"actions.actions[{i}]"
        for k in ("site_id", "who", "action", "reason"):
            if not (isinstance(a.get(k), str) and a[k].strip()):
                p.append(f"{w}: missing {k}")
        if not isinstance(a.get("priority"), int):
            p.append(f"{w}: priority must be an int")
        if not (_num(a.get("deadline_hours")) and a["deadline_hours"] >= 0):
            p.append(f"{w}: bad deadline_hours")
        if ranked_ids is not None and a.get("site_id") not in ranked_ids:
            p.append(f"{w}: site_id {a.get('site_id')!r} is not a ranked site")
    for i, a in enumerate(obj.get("authority_actions") or []):
        for k in ("who", "action", "reason"):
            if not (isinstance(a.get(k), str) and a[k].strip()):
                p.append(f"actions.authority_actions[{i}]: missing {k}")
    return p


def check_aqi(obj: Any) -> Problems:
    p = _stamped(obj, "aqi")
    if not isinstance(obj, dict):
        return p
    if "source" in obj and not (isinstance(obj["source"], str) and obj["source"].strip()):
        p.append("aqi: bad source")
    if "coverage_complete" in obj and obj["coverage_complete"] is not None and type(obj["coverage_complete"]) is not bool:
        p.append("aqi: bad coverage_complete")
    for key in ("sources_with_readings", "sources_failed"):
        if key in obj and not (isinstance(obj[key], list) and all(isinstance(v, str) and v.strip() for v in obj[key])):
            p.append(f"aqi: bad {key}")
    fetch_status = obj.get("fetch_status")
    if "fetch_status" in obj and fetch_status not in ("COMPLETE", "PARTIAL", "FAILED", "UNAVAILABLE", "UNKNOWN"):
        p.append("aqi: bad fetch_status")
    if fetch_status == "COMPLETE" and obj.get("sources_failed"):
        p.append("aqi: complete fetch contradicts sources_failed")
    source_status = obj.get("source_fetch_status")
    if "source_fetch_status" in obj:
        valid = isinstance(source_status, dict) and bool(source_status) and all(
            isinstance(k, str) and k.strip() and v in ("SUCCESS", "PARTIAL_FAILURE", "FAILED", "NOT_CONFIGURED", "UNKNOWN")
            for k, v in source_status.items()
        )
        if not valid:
            p.append("aqi: bad source_fetch_status")
        elif fetch_status == "COMPLETE" and any(v != "SUCCESS" for v in source_status.values()):
            p.append("aqi: complete fetch contradicts source_fetch_status")
        elif obj.get("coverage_complete") is True and any(v in ("PARTIAL_FAILURE", "FAILED", "NOT_CONFIGURED") for v in source_status.values()):
            p.append("aqi: complete coverage contradicts known fetch gaps")
    if obj.get("coverage_complete") is True and (obj.get("sources_failed") or fetch_status in ("PARTIAL", "FAILED", "UNAVAILABLE")):
        p.append("aqi: complete coverage contradicts fetch failure")
    if not obj.get("stations"):
        p.append("aqi: no stations")
    for i, s in enumerate(obj.get("stations") or []):
        w = f"aqi.stations[{i}]"
        p += _latlon(s, w)
        for k in ("id", "name"):
            if not isinstance(s.get(k), str):
                p.append(f"{w}: missing {k}")
        for k in ("pm25", "pm10", "aqi"):
            if s.get(k) is not None and not (_num(s[k]) and s[k] >= 0):
                p.append(f"{w}: bad {k}")
    has_readings = any(any(s.get(k) is not None for k in ("pm25", "pm10", "aqi")) for s in obj.get("stations") or [])
    if "data_status" in obj:
        expected = "READINGS_AVAILABLE" if has_readings else "UNAVAILABLE_OR_EMPTY"
        if obj["data_status"] != expected:
            p.append("aqi: data_status contradicts available readings")
    if fetch_status in ("FAILED", "UNAVAILABLE") and has_readings:
        p.append("aqi: failed/unavailable fetch contradicts available readings")
    return p


CHECKS: dict[str, Callable[[Any], Problems]] = {
    "sources": check_sources,
    "corridor": check_corridor,
    "sites": check_sites,
    "ranked_sites": check_ranked_sites,
    "actions": check_actions,
    "aqi": check_aqi,
}
