"""Provenance checks preserve real snapshots; mathematical probes are labelled."""

import hashlib
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize("kind,name,finding", [
    ("sources", "sources.json", "SCI-055"),
    ("corridor", "corridor.geojson", "SCI-056"),
])
def test_known_archive_is_labelled_by_exact_content(tmp_path, kind, name, finding):
    from models.common.provenance import inspect_artifact

    original = ROOT / "data/live" / name
    captured = original.read_bytes()
    copy = tmp_path / name
    copy.write_bytes(captured)
    description = inspect_artifact(copy, kind)
    assert description["artifact_status"] == "ARCHIVED_LEGACY"
    assert description["finding_id"] == finding
    assert description["artifact_sha256"] == hashlib.sha256(captured).hexdigest()
    assert description["operational_validation"] == "NOT_ESTABLISHED"
    assert description["original_parameter_binding"] == "NOT_RECORDED"
    assert original.read_bytes() == captured


def test_edited_or_reserialized_archive_is_unknown(tmp_path):
    from models.common.provenance import inspect_artifact

    value = json.loads((ROOT / "data/live/sources.json").read_text(encoding="utf-8"))
    path = tmp_path / "sources.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    assert inspect_artifact(path, "sources")["artifact_status"] == "UNVERSIONED_UNKNOWN"
    value["sources"][0]["confidence"] = 0.123
    path.write_text(json.dumps(value), encoding="utf-8")
    assert inspect_artifact(path, "sources")["artifact_status"] == "UNVERSIONED_UNKNOWN"


@pytest.mark.parametrize("text", ['{"generated_at": "invalid", "sources": []}', '{"sources": NaN}', '{broken', '[]'])
def test_malformed_artifact_is_not_given_provenance(tmp_path, text):
    from models.common.provenance import inspect_artifact

    path = tmp_path / "sources.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(ValueError):
        inspect_artifact(path, "sources")


def test_wrong_artifact_kind_is_rejected():
    from models.common.provenance import inspect_artifact

    with pytest.raises(ValueError):
        inspect_artifact(ROOT / "data/live/corridor.geojson", "sources")


def test_source_cli_writes_bound_heuristic_manifest(tmp_path, monkeypatch):
    from models.source_detection.cluster import main
    from models.common.provenance import inspect_artifact
    from pipeline.contracts import check_sources

    input_path = tmp_path / "fires.json"
    input_path.write_bytes((ROOT / "data/live/fires.json").read_bytes())
    before = input_path.read_bytes()
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    output, sidecar = tmp_path / "sources.json", tmp_path / "sources.provenance.json"
    main(["--live", "--eps-km", "15", "--provenance-output", str(sidecar)])
    metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    assert metadata["parameters"]["eps_km"] == 15
    assert metadata["parameter_source"] == "EXPLICIT_OR_BASELINE_UNCALIBRATED"
    assert metadata["semantics"]["confidence"] == "HEURISTIC_SCORE_NOT_PROBABILITY"
    assert metadata["semantics"]["type"] == "REGION_SEASON_PROXY_NOT_VERIFIED_LAND_USE"
    assert metadata["inputs"]["fires"]["sha256"] == hashlib.sha256(before).hexdigest()
    assert metadata["output_sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    assert metadata["analysis_reference"] == json.loads(output.read_text(encoding="utf-8"))["generated_at"]
    assert inspect_artifact(output, "sources", provenance_path=sidecar)["artifact_status"] == "MODELLED_WITH_COMPANION_PROVENANCE"
    assert check_sources(json.loads(output.read_text(encoding="utf-8"))) == []
    assert input_path.read_bytes() == before
    plain_output = tmp_path / "plain-sources.json"
    main(["--live", "--eps-km", "15", "--output", str(plain_output)])
    assert plain_output.read_bytes() == output.read_bytes()
    output.write_bytes(output.read_bytes() + b" ")
    with pytest.raises(ValueError, match="hash"):
        inspect_artifact(output, "sources", provenance_path=sidecar)


def test_corridor_cli_labels_peak_and_legacy_source_lineage(tmp_path, monkeypatch):
    from models.plume.corridor import main
    from models.common.provenance import inspect_artifact
    from pipeline.contracts import check_corridor

    before = {}
    for name in ("sources.json", "wind.json"):
        before[name] = (ROOT / "data/live" / name).read_bytes()
        (tmp_path / name).write_bytes(before[name])
    sources = json.loads(before["sources.json"])
    start = max(source["last_seen"] for source in sources["sources"])
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    sidecar = tmp_path / "corridor.provenance.json"
    main(["--live", "--hours", "2", "--start", start, "--provenance-output", str(sidecar)])
    metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    assert metadata["parameter_source"] == "BASELINE"
    assert metadata["semantics"]["pm25_delta_ugm3"] == "SOURCE_BAND_GRID_TIME_PEAK_NOT_RECEPTOR_CONCENTRATION"
    assert metadata["semantics"]["risk"] == "UNCALIBRATED_RELATIVE_SCORE_NOT_HEALTH_PROBABILITY"
    assert metadata["inputs"]["sources"]["artifact_status"] == "ARCHIVED_LEGACY"
    assert metadata["forecast_start"] == json.loads((tmp_path / "corridor.geojson").read_text(encoding="utf-8"))["forecast_start"]
    assert metadata["output_sha256"] == hashlib.sha256((tmp_path / "corridor.geojson").read_bytes()).hexdigest()
    assert inspect_artifact(tmp_path / "corridor.geojson", "corridor", provenance_path=sidecar)["artifact_status"] == "MODELLED_WITH_COMPANION_PROVENANCE"
    assert check_corridor(json.loads((tmp_path / "corridor.geojson").read_text(encoding="utf-8"))) == []
    assert before == {name: (tmp_path / name).read_bytes() for name in before}
    plain_output = tmp_path / "plain-corridor.geojson"
    main(["--live", "--hours", "2", "--start", start, "--output", str(plain_output)])
    assert plain_output.read_bytes() == (tmp_path / "corridor.geojson").read_bytes()


@pytest.mark.parametrize("field,value", [("schema_version", True), ("inputs", []),
                                       ("parameters", "assumed"), ("model_code_sha256", "unknown"),
                                       ("output_kind", "corridor")])
def test_malformed_companion_is_rejected(tmp_path, monkeypatch, field, value):
    from models.source_detection.cluster import main
    from models.common.provenance import inspect_artifact

    (tmp_path / "fires.json").write_bytes((ROOT / "data/live/fires.json").read_bytes())
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    sidecar = tmp_path / "sources.provenance.json"
    main(["--live", "--provenance-output", str(sidecar)])
    metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    metadata[field] = value
    sidecar.write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(ValueError):
        inspect_artifact(tmp_path / "sources.json", "sources", provenance_path=sidecar)


@pytest.mark.parametrize("sidecar", ["fires.json", "sources.json", "absent/provenance.json"])
def test_invalid_source_manifest_path_preserves_input_and_prior_output(tmp_path, monkeypatch, sidecar):
    from models.source_detection.cluster import main

    (tmp_path / "fires.json").write_bytes((ROOT / "data/live/fires.json").read_bytes())
    output = tmp_path / "sources.json"
    output.write_bytes((ROOT / "data/live/sources.json").read_bytes())
    before = {p.name: p.read_bytes() for p in [tmp_path / "fires.json", output]}
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as error:
        main(["--live", "--provenance-output", str(tmp_path / sidecar)])
    assert error.value.code == 1
    assert before == {name: (tmp_path / name).read_bytes() for name in before}


def test_missing_source_input_preserves_previous_output_and_companion(tmp_path, monkeypatch):
    from models.source_detection.cluster import main

    output, sidecar = tmp_path / "sources.json", tmp_path / "sources.provenance.json"
    output.write_bytes((ROOT / "data/live/sources.json").read_bytes())
    sidecar.write_text("prior companion; negative write-preservation fixture", encoding="utf-8")
    before = output.read_bytes(), sidecar.read_bytes()
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as error:
        main(["--live", "--provenance-output", str(sidecar)])
    assert error.value.code == 1
    assert (output.read_bytes(), sidecar.read_bytes()) == before


def test_stale_source_replay_keeps_capture_and_reference_times_distinct(tmp_path, monkeypatch):
    from models.source_detection.cluster import main

    raw = (ROOT / "data/live/fires.json").read_bytes()
    (tmp_path / "fires.json").write_bytes(raw)
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    sidecar = tmp_path / "sources.provenance.json"
    main(["--live", "--as-of", "2026-10-10T12:00:00Z", "--provenance-output", str(sidecar)])
    output = json.loads((tmp_path / "sources.json").read_text(encoding="utf-8"))
    metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    assert output["sources"] == []
    assert metadata["analysis_reference"] == "2026-10-10T12:00:00Z"
    assert metadata["inputs"]["fires"]["generated_at"] == json.loads(raw)["generated_at"]
    assert metadata["analysis_reference"] != metadata["inputs"]["fires"]["generated_at"]


@pytest.mark.parametrize("sidecar,hours", [("sources.json", 2), ("wind.json", 2),
                                          ("corridor.geojson", 2), ("corridor.provenance.json", 48)])
def test_corridor_failure_preserves_captured_inputs_and_prior_outputs(tmp_path, monkeypatch, sidecar, hours):
    from models.plume.corridor import main

    before = {}
    for name in ("sources.json", "wind.json", "corridor.geojson"):
        before[name] = (ROOT / "data/live" / name).read_bytes()
        (tmp_path / name).write_bytes(before[name])
    companion = tmp_path / "corridor.provenance.json"
    companion.write_text("prior companion; negative write-preservation fixture", encoding="utf-8")
    prior_companion = companion.read_bytes()
    start = max(s["last_seen"] for s in json.loads(before["sources.json"])["sources"])
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as error:
        main(["--live", "--hours", str(hours), "--start", start,
              "--provenance-output", str(tmp_path / sidecar)])
    assert error.value.code == 1
    assert before == {name: (tmp_path / name).read_bytes() for name in before}
    assert companion.read_bytes() == prior_companion
