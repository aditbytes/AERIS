"""Real captured bytes are preserved; replays remain separately identified."""
import hashlib
import json
from pathlib import Path
import shutil

import pytest

from api.handlers import app
from ingest.common import storage
from pipeline import steps

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def copied(tmp_path, monkeypatch):
    for p in (ROOT / "data/live").iterdir():
        if p.is_file():
            shutil.copyfile(p, tmp_path / p.name)
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.delenv("AGENT_MODEL_PROVIDER", raising=False)
    return tmp_path


@pytest.mark.parametrize("kind,file", [("sources", "sources.json"), ("corridor", "corridor.geojson")])
def test_archive_bytes_survive_api_serialization(copied, kind, file):
    raw = (copied / file).read_bytes()
    response = app.lambda_handler({"routeKey": f"GET /{kind}"}, None)
    assert response["statusCode"] == 200
    description = json.loads(response["body"])["provenance"]
    assert description["artifact_status"] == "ARCHIVED_LEGACY"
    assert description["artifact_sha256"] == hashlib.sha256(raw).hexdigest()
    assert description["original_input_binding"] == "NOT_RECORDED"
    assert (copied / file).read_bytes() == raw


def test_production_replay_has_bound_parameters_lineage_and_semantics(copied):
    raw_fires = (copied / "fires.json").read_bytes()
    steps.detect_handler({}, None)
    source = app.load("sources")["provenance"]
    assert source["artifact_status"] == "MODELLED_WITH_COMPANION_PROVENANCE"
    assert source["parameters"]["eps_km"] == 7.5
    assert source["inputs"]["fires"]["sha256"] == hashlib.sha256(raw_fires).hexdigest()
    assert source["semantics"]["confidence"] == "HEURISTIC_SCORE_NOT_PROBABILITY"
    start = max(s["last_seen"] for s in storage.read_json("sources")["sources"])
    steps.corridor_handler({"forecast_start": start, "forecast_hours": 2}, None)
    corridor = app.load("corridor")["provenance"]
    assert corridor["declared_parameter_source"] == "BASELINE"
    assert corridor["inputs"]["sources"]["artifact_status"] == source["artifact_status"]
    assert corridor["inputs"]["sources"]["artifact_sha256"] == source["artifact_sha256"]
    assert corridor["forecast_start"] == start
    assert corridor["semantics"]["pm25_delta_ugm3"] == "SOURCE_BAND_GRID_TIME_PEAK_NOT_RECEPTOR_CONCENTRATION"
    steps.rank_handler({"population_key": "population"}, None)
    steps.agent_handler({}, None)
    actions = storage.read_json("actions")
    assert actions["advisory_only"] is True
    assert actions["model_context"]["corridor"]["artifact_sha256"] == corridor["artifact_sha256"]
    assert storage.read_json("ranked_sites")["model_context"]["corridor"] == corridor


def test_mismatching_companion_fails_closed_and_preserves_outputs(copied):
    steps.detect_handler({}, None)
    path = copied / "sources.json"
    raw = path.read_bytes()
    path.write_bytes(raw + b" ")
    response = app.lambda_handler({"routeKey": "GET /sources"}, None)
    assert response["statusCode"] == 500
    before = (copied / "corridor.geojson").read_bytes()
    with pytest.raises(ValueError, match="hash mismatch"):
        steps.corridor_handler({}, None)
    assert (copied / "corridor.geojson").read_bytes() == before


def test_inline_provenance_cannot_relabel_a_changed_archive(copied):
    obj = storage.read_json("sources")
    obj["provenance"] = {"artifact_status": "CALIBRATED", "operational_validation": "VERIFIED"}
    storage.write_json("sources", obj)
    assert app.load("sources")["provenance"]["artifact_status"] == "UNVERSIONED_UNKNOWN"


@pytest.mark.parametrize("stamp", [None, 123, "invalid", "2026-10-10T01:00:00", "2099-01-01T00:00:00Z"])
def test_api_unknown_or_future_timestamp_never_counts_as_fresh(stamp):
    assert app._age_seconds(stamp) is None


def test_publish_empty_aqi_preserves_every_previous_gold_feed(copied):
    storage.write_json("incoming_aqi", {"generated_at": "2026-10-10T00:00:00Z", "stations": []})
    before = {p.name: p.read_bytes() for p in copied.iterdir()}
    with pytest.raises(ValueError, match="aqi"):
        steps.publish_handler({"fires_key": "fires", "aqi_key": "incoming_aqi", "wind_key": "wind", "sites_key": "sites"}, None)
    assert before == {p.name: p.read_bytes() for p in copied.iterdir()}


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_storage_rejects_nonfinite_json_before_overwrite(copied, value):
    raw = (copied / "aqi.json").read_bytes()
    with pytest.raises(ValueError):
        storage.write_json("aqi", {"generated_at": "2026-10-10T00:00:00Z", "stations": [value]})
    assert (copied / "aqi.json").read_bytes() == raw
