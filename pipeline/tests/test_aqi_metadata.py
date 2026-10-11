"""AQI metadata survives publication/API; labelled cases never alter captures."""
import json
import shutil
from pathlib import Path

import pytest

from api.handlers import app
from ingest.aqi import handler
from ingest.common import storage
from pipeline import steps
from pipeline.contracts import check_aqi


def _case():
    return {
        "generated_at": "2026-10-10T06:00:00Z", "source": "OpenAQ",
        "data_status": "READINGS_AVAILABLE", "sources_with_readings": ["OpenAQ"],
        "stations": [{"id": "ISOLATED_ZERO_TEST", "name": "Isolated zero test", "lat": 29, "lon": 77,
                      "pm25": 0, "aqi": 0, "source": "OpenAQ", "observed_at": None,
                      "source_timestamp": "10-10-2026 07:00:00", "timestamp_status": "UNAVAILABLE_OR_AMBIGUOUS"}],
    }


@pytest.mark.parametrize("metadata", [
    {"fetch_status": "COMPLETE", "coverage_complete": None, "source_fetch_status": {"OpenAQ": "SUCCESS", "CPCB/data.gov.in": "SUCCESS"}},
    {"fetch_status": "PARTIAL", "coverage_complete": False, "sources_failed": ["OpenAQ"], "source_fetch_status": {"OpenAQ": "PARTIAL_FAILURE", "CPCB/data.gov.in": "SUCCESS"}},
    {"fetch_status": "UNKNOWN", "coverage_complete": None},
])
def test_ingestion_publication_and_both_api_aliases_preserve_metadata(tmp_path, monkeypatch, metadata):
    live = Path(__file__).resolve().parents[2] / "data/live"
    for name in ("fires.json", "wind.json", "sites.geojson"):
        shutil.copyfile(live / name, tmp_path / name)
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    result = {**_case(), **metadata}
    monkeypatch.setattr(handler, "fetch_aqi", lambda **kw: result)
    monkeypatch.setattr(handler.secrets, "get_secret", lambda key: "TEST_KEY")
    assert handler.lambda_handler({}, None)["count"] == 1
    assert storage.read_json("bronze/aqi/latest") == result
    assert check_aqi(result) == []
    steps.publish_handler({"fires_key": "fires", "wind_key": "wind", "sites_key": "sites"}, None)
    assert storage.read_json("aqi") == result
    for route in ("GET /aqi", "GET /stations"):
        response = app.lambda_handler({"routeKey": route}, None)
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert {key: body[key] for key in result} == result
        assert body["stations"][0]["aqi"] == 0
        assert body["stations"][0]["observed_at"] is None
        assert isinstance(body["stale"], bool)


@pytest.mark.parametrize("invalid", [
    {"source": ""}, {"sources_failed": "OpenAQ"}, {"sources_with_readings": [None]},
    {"coverage_complete": "false"}, {"fetch_status": "SUCCESS"},
    {"source_fetch_status": {"OpenAQ": "bad"}}, {"source_fetch_status": {}},
    {"coverage_complete": True, "sources_failed": ["OpenAQ"]},
    {"fetch_status": "COMPLETE", "source_fetch_status": {"OpenAQ": "PARTIAL_FAILURE"}},
    {"fetch_status": "COMPLETE", "sources_failed": ["OpenAQ"]},
    {"data_status": "UNAVAILABLE_OR_EMPTY"}, {"data_status": "bad"},
    {"fetch_status": "FAILED"}, {"fetch_status": "UNAVAILABLE"},
])
def test_contract_rejects_invalid_or_contradictory_metadata(invalid):
    assert check_aqi({**_case(), **invalid})


@pytest.mark.parametrize("fetch_status", ["COMPLETE", "PARTIAL", "FAILED", "UNAVAILABLE", "UNKNOWN"])
def test_publication_never_refreshes_an_empty_result(tmp_path, monkeypatch, fetch_status):
    live = Path(__file__).resolve().parents[2] / "data/live"
    for name in ("fires.json", "wind.json", "sites.geojson", "aqi.json"):
        shutil.copyfile(live / name, tmp_path / name)
    before = (tmp_path / "aqi.json").read_bytes()
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    storage.write_json("bronze/aqi/latest", {"generated_at": "2026-10-10T06:00:00Z", "source": "none", "stations": [], "fetch_status": fetch_status})
    with pytest.raises(ValueError, match="unavailable or invalid aqi"):
        steps.publish_handler({"fires_key": "fires", "wind_key": "wind", "sites_key": "sites"}, None)
    assert (tmp_path / "aqi.json").read_bytes() == before
