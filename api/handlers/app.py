"""
api/handlers/app.py
-------------------
AERIS read API behind API Gateway (HTTP API, payload v2). Every GET route reads one
real contract file from gold/ through ``ingest.common.storage``; nothing is computed
from defaults or invented.

Each JSON object returned gains:
  stale        true when generated_at is older than that file's refresh budget
  age_seconds  seconds since generated_at
So when an upstream feed is down, the API keeps serving the last real result and the
UI can mark it stale. With no real result yet, the route returns 404.

Routes are listed in docs/api-list.md. The web app's names (/sites/ranked, /aqi) are
aliases of /ranked-sites and /stations.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable

from ingest.common import storage

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Seconds after generated_at before a file counts as stale: about 3 missed refreshes.
STALE_AFTER = {
    "fires": 45 * 60,
    "aqi": 90 * 60,
    "wind": 3 * 3600,
    "sources": 90 * 60,
    "corridor": 90 * 60,
    "ranked_sites": 90 * 60,
    "actions": 90 * 60,
    "sites": None,  # one-time OSM pull; never stale
}

_HEADERS = {"Content-Type": "application/json", "Cache-Control": "max-age=60"}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _age_seconds(generated_at: str | None) -> int | None:
    if not generated_at:
        return None
    try:
        t = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return int((_now() - t).total_seconds())


def load(name: str) -> dict[str, Any]:
    """Read gold/<name> and add stale/age_seconds. 404 if no real result exists yet."""
    geojson = name in ("corridor", "sites")
    try:
        obj = storage.read_json(name, geojson=geojson)
    except FileNotFoundError as exc:
        raise ApiError(404, "no_data", f"No {name} result has been produced yet") from exc
    age = _age_seconds(obj.get("generated_at"))
    limit = STALE_AFTER.get(name)
    obj["age_seconds"] = age
    obj["stale"] = bool(limit is not None and (age is None or age > limit))
    return obj


def _ranked(query: dict[str, str]) -> dict[str, Any]:
    data = load("ranked_sites")
    sites = data["sites"]
    if query.get("type"):
        if query["type"] not in ("school", "hospital"):
            raise ApiError(400, "bad_request", "type must be school or hospital")
        sites = [s for s in sites if s.get("type") == query["type"]]
    if query.get("limit"):
        try:
            limit = int(query["limit"])
        except ValueError as exc:
            raise ApiError(400, "bad_request", "limit must be an integer") from exc
        sites = sites[: max(0, limit)]
    data["sites"] = sites
    return data


def _summary(_: dict[str, str]) -> dict[str, Any]:
    sources = load("sources")
    ranked = load("ranked_sites")
    actions = load("actions")
    etas = [s["eta_hours"] for s in ranked["sites"] if s.get("eta_hours") is not None]
    parts = [sources, ranked, actions]
    return {
        "generated_at": actions["generated_at"],
        "source_count": len(sources["sources"]),
        "fire_count": sum(s.get("fire_count", 0) for s in sources["sources"]),
        "ranked_site_count": len(ranked["sites"]),
        "earliest_eta_hours": min(etas) if etas else None,
        "exposed_population": ranked["exposed_population"],
        "summary": actions["summary"],
        "generator": actions.get("generator"),
        "inputs_generated_at": {
            "sources": sources["generated_at"],
            "ranked_sites": ranked["generated_at"],
            "actions": actions["generated_at"],
        },
        "stale": any(p["stale"] for p in parts),
    }


def _health(_: dict[str, str]) -> dict[str, Any]:
    try:
        last_run = storage.read_json("actions").get("generated_at")
    except FileNotFoundError:
        last_run = None
    return {"status": "ok", "generated_at": _now().isoformat().replace("+00:00", "Z"), "last_run": last_run}


def _sfn():
    import boto3

    return boto3.client("stepfunctions")


def _start_run(_: dict[str, str]) -> dict[str, Any]:
    arn = os.environ.get("STATE_MACHINE_ARN")
    if not arn:
        raise ApiError(501, "not_configured", "POST /run is not enabled on this deployment")
    resp = _sfn().start_execution(stateMachineArn=arn)
    run_id = resp["executionArn"].rsplit(":", 1)[-1]
    return {"run_id": run_id, "status": "running", "started_at": resp["startDate"].isoformat()}


_STATUS = {"RUNNING": "running", "SUCCEEDED": "succeeded"}


def _run_status(run_id: str) -> dict[str, Any]:
    arn = os.environ.get("STATE_MACHINE_ARN")
    if not arn:
        raise ApiError(501, "not_configured", "Run status is not enabled on this deployment")
    if not run_id.replace("-", "").isalnum():
        raise ApiError(400, "bad_request", "invalid run id")
    exec_arn = arn.replace(":stateMachine:", ":execution:") + f":{run_id}"
    sfn = _sfn()
    try:
        resp = sfn.describe_execution(executionArn=exec_arn)
    except sfn.exceptions.ExecutionDoesNotExist as exc:
        raise ApiError(404, "not_found", f"No run {run_id}") from exc
    return {
        "run_id": run_id,
        "status": _STATUS.get(resp["status"], "failed"),
        "started_at": resp["startDate"].isoformat(),
        "stopped_at": resp["stopDate"].isoformat() if resp.get("stopDate") else None,
    }


ROUTES: dict[str, Callable[[dict[str, str]], dict[str, Any]]] = {
    "GET /health": _health,
    "GET /sources": lambda q: load("sources"),
    "GET /corridor": lambda q: load("corridor"),
    "GET /sites": lambda q: load("sites"),
    "GET /ranked-sites": _ranked,
    "GET /sites/ranked": _ranked,
    "GET /actions": lambda q: load("actions"),
    "GET /stations": lambda q: load("aqi"),
    "GET /aqi": lambda q: load("aqi"),
    "GET /wind": lambda q: load("wind"),
    "GET /fires": lambda q: load("fires"),
    "GET /summary": _summary,
    "POST /run": _start_run,
}


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {"statusCode": status, "headers": _HEADERS, "body": json.dumps(body, ensure_ascii=False)}


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    route = event.get("routeKey", "")
    query = event.get("queryStringParameters") or {}
    try:
        if route == "GET /run/{run_id}":
            return _response(200, _run_status((event.get("pathParameters") or {}).get("run_id", "")))
        handler = ROUTES.get(route)
        if handler is None:
            raise ApiError(404, "not_found", f"No route {route}")
        return _response(200, handler(query))
    except ApiError as exc:
        return _response(exc.status, {"error": exc.code, "message": exc.message})
    except Exception:  # noqa: BLE001 - never leak internals to the client
        logger.exception("Unhandled error on %s", route)
        return _response(500, {"error": "internal", "message": "Internal error"})
