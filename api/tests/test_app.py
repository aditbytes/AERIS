"""API handler tests against the real snapshots in data/live/ (local backend, no AWS)."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from api.handlers import app

_LIVE = Path(__file__).resolve().parents[2] / "data" / "live"
_FILES = ["sources.json", "corridor.geojson", "ranked_sites.json", "actions.json", "aqi.json", "sites.geojson"]


@pytest.fixture
def gold(tmp_path, monkeypatch):
    for name in _FILES:
        shutil.copy(_LIVE / name, tmp_path / name)
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("STATE_MACHINE_ARN", raising=False)
    return tmp_path


def call(route, query=None, path=None):
    resp = app.lambda_handler({"routeKey": route, "queryStringParameters": query, "pathParameters": path}, None)
    return resp["statusCode"], json.loads(resp["body"]), resp["headers"]


@pytest.mark.parametrize("route", ["GET /sources", "GET /corridor", "GET /sites", "GET /actions", "GET /stations", "GET /aqi"])
def test_read_routes_return_real_files_with_freshness(gold, route):
    status, body, headers = call(route)
    assert status == 200
    assert body["generated_at"]
    assert isinstance(body["stale"], bool)
    assert headers["Cache-Control"] == "max-age=60"


def test_ranked_sites_filters(gold):
    _, all_sites, _ = call("GET /ranked-sites")
    status, body, _ = call("GET /sites/ranked", {"type": "hospital", "limit": "3"})
    assert status == 200
    assert len(body["sites"]) <= 3
    assert all(s["type"] == "hospital" for s in body["sites"])
    assert len(all_sites["sites"]) >= len(body["sites"])


def test_bad_query_is_400(gold):
    assert call("GET /ranked-sites", {"limit": "x"})[0] == 400
    assert call("GET /ranked-sites", {"type": "mall"})[0] == 400


def test_missing_file_is_404_not_a_default(gold):
    (gold / "actions.json").unlink()
    status, body, _ = call("GET /actions")
    assert status == 404 and body["error"] == "no_data"


def test_old_result_is_served_and_flagged_stale(gold):
    data = json.loads((gold / "sources.json").read_text())
    data["generated_at"] = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    (gold / "sources.json").write_text(json.dumps(data))
    status, body, _ = call("GET /sources")
    assert status == 200 and body["stale"] is True
    assert body["sources"] == data["sources"]


def test_fresh_result_is_not_stale(gold):
    data = json.loads((gold / "sources.json").read_text())
    data["generated_at"] = datetime.now(timezone.utc).isoformat()
    (gold / "sources.json").write_text(json.dumps(data))
    assert call("GET /sources")[1]["stale"] is False


def test_summary_and_health(gold):
    status, body, _ = call("GET /summary")
    assert status == 200
    assert body["source_count"] > 0 and body["summary"]
    status, body, _ = call("GET /health")
    assert status == 200 and body["status"] == "ok" and body["last_run"]


def test_run_routes_disabled_without_state_machine(gold):
    assert call("POST /run")[0] == 501
    assert call("GET /run/{run_id}", path={"run_id": "abc"})[0] == 501


def test_unknown_route_is_404(gold):
    assert call("GET /nope")[0] == 404
