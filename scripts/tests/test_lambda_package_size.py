"""Deployment byte accounting and runtime-only source staging regressions."""

import json
import importlib
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from scripts import stage_lambda_sources as staging
from scripts import verify_lambda_dependencies as verifier
from scripts.tests.test_verify_lambda_dependencies import configuration, save
pruning = importlib.import_module("infra.lambda.prune")


def built_artifacts(configuration, tmp_path):
    groups = verifier.inspect_configuration(configuration[0])
    build = tmp_path / "artifacts"
    for group in groups:
        for name in group["functions"]:
            module = group["function_handlers"][name].rsplit(".", 1)[0]
            path = (build / name / Path(*module.split("."))).with_suffix(".py")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"code\n")
    return groups, build


def test_counts_all_file_bytes_not_only_code(tmp_path):
    directory = tmp_path / "artifact"
    directory.mkdir()
    for name, value in {"app.py": b"a", "METADATA": b"abc", "README.md": b"doc", "cache.pyc": b"cache"}.items():
        (directory / name).write_bytes(value)
    (directory / "empty").mkdir()
    assert verifier.artifact_size(directory) == (12, 4)


def test_counts_uncompressed_zip_members(tmp_path):
    archive = tmp_path / "layer.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as stream:
        stream.writestr("python/library.py", b"x" * 500)
        stream.writestr("python/METADATA", b"metadata")
    assert verifier.artifact_size(archive) == (508, 2)


def test_function_and_layer_limit_failure_boundary():
    result = {"function": "DetectFunction", "total_bytes": verifier.UNCOMPRESSED_LIMIT,
              "headroom_bytes": 0}
    verifier.enforce_sizes([result])
    result.update(total_bytes=verifier.UNCOMPRESSED_LIMIT + 1, headroom_bytes=-1)
    with pytest.raises(verifier.VerificationError, match="DetectFunction.*1 over limit"):
        verifier.enforce_sizes([result])


def test_global_and_function_layers_charged_once_per_attachment(configuration, tmp_path):
    _, data, _ = configuration
    data["Resources"]["Shared"] = {"Type": "AWS::Serverless::LayerVersion", "Properties": {"ContentUri": "shared/"}}
    data["Resources"]["Second"] = {"Type": "AWS::Serverless::LayerVersion", "Properties": {"ContentUri": "second/"}}
    data["Globals"]["Function"]["Layers"] = [{"Ref": "Shared"}]
    data["Resources"]["AgentFunction"]["Properties"]["Layers"] = [{"Ref": "Shared"}, {"Ref": "Second"}]
    save(configuration)
    groups, build = built_artifacts(configuration, tmp_path)
    for name, content in {"Shared": b"shared", "Second": b"second-layer"}.items():
        layer = build / name / "python"
        layer.mkdir(parents=True)
        (layer / "library.py").write_bytes(content)
    results = verifier.measure_packages(groups, build)
    agent = next(item for item in results if item["function"] == "AgentFunction")
    assert agent["package_bytes"] == 5 and agent["layer_bytes"] == 18
    assert agent["total_bytes"] == 23
    assert [layer["layer"] for layer in agent["layers"]] == ["Shared", "Second"]
    # The same layer is charged to each function that attaches it, not globally
    # summed into unrelated functions; overlapping paths in distinct layers count.
    assert all(item["layer_bytes"] == 6 for item in results if item is not agent)


def test_short_form_ref_retains_layer_identity(configuration, tmp_path):
    template, data, _ = configuration
    data["Resources"]["Shared"] = {"Type": "AWS::Serverless::LayerVersion", "Properties": {"ContentUri": "shared/"}}
    save(configuration)
    text = template.read_text(encoding="utf-8").replace("Architectures:\n", "Layers: [!Ref Shared]\n    Architectures:\n", 1)
    template.write_text(text, encoding="utf-8")
    assert all(group["function_layers"][name] == ["Shared"] for group in verifier.inspect_configuration(template)
               for name in group["functions"])


def test_unmeasured_external_layer_fails_closed(configuration, tmp_path):
    configuration[1]["Globals"]["Function"]["Layers"] = ["arn:aws:lambda:ap-south-1:123456789012:layer:shared:1"]
    save(configuration)
    groups, build = built_artifacts(configuration, tmp_path)
    with pytest.raises(verifier.VerificationError, match="unmeasured external/parameter layer"):
        verifier.measure_packages(groups, build)
    artifact = tmp_path / "external"
    artifact.mkdir()
    (artifact / "file").write_bytes(b"layer")
    key = configuration[1]["Globals"]["Function"]["Layers"][0]
    assert all(item["layer_bytes"] == 5 for item in verifier.measure_packages(groups, build, {key: artifact}))


def test_missing_local_layer_artifact_fails(configuration, tmp_path):
    data = configuration[1]
    data["Resources"]["Shared"] = {"Type": "AWS::Serverless::LayerVersion", "Properties": {"ContentUri": "shared/"}}
    data["Globals"]["Function"]["Layers"] = [{"Ref": "Shared"}]
    save(configuration)
    groups, build = built_artifacts(configuration, tmp_path)
    with pytest.raises(verifier.VerificationError, match="Missing artifact"):
        verifier.measure_packages(groups, build)


def test_missing_function_or_handler_fails(configuration, tmp_path):
    groups, build = built_artifacts(configuration, tmp_path)
    shutil.rmtree(build / "AgentFunction")
    with pytest.raises(verifier.VerificationError, match="Missing artifact"):
        verifier.measure_packages(groups, build)
    (build / "AgentFunction").mkdir()
    with pytest.raises(verifier.VerificationError, match="missing handler module"):
        verifier.measure_packages(groups, build)


def test_size_cli_fails_above_limit_and_writes_measurements(configuration, tmp_path, monkeypatch, capsys):
    _, build = built_artifacts(configuration, tmp_path)
    monkeypatch.setattr(verifier, "UNCOMPRESSED_LIMIT", 4)
    report = tmp_path / "report.json"
    assert verifier.main(["--template", str(configuration[0]), "--artifacts-dir", str(build), "--report", str(report)]) == 1
    assert "exceed 4-byte" in capsys.readouterr().err
    assert len(json.loads(report.read_text(encoding="utf-8"))["functions"]) == 4


def test_layer_can_push_an_otherwise_valid_function_over_limit(configuration, tmp_path, monkeypatch, capsys):
    data = configuration[1]
    data["Resources"]["Shared"] = {"Type": "AWS::Serverless::LayerVersion", "Properties": {"ContentUri": "shared/"}}
    data["Globals"]["Function"]["Layers"] = [{"Ref": "Shared"}]
    save(configuration)
    _, build = built_artifacts(configuration, tmp_path)
    (build / "Shared").mkdir()
    (build / "Shared/file").write_bytes(b"layer")
    monkeypatch.setattr(verifier, "UNCOMPRESSED_LIMIT", 9)
    assert verifier.main(["--template", str(configuration[0]), "--artifacts-dir", str(build)]) == 1
    assert "total=10" in capsys.readouterr().out


def test_measurement_does_not_redownload_dependencies(configuration, tmp_path, monkeypatch):
    _, build = built_artifacts(configuration, tmp_path)
    def forbidden(*args, **kwargs):
        raise AssertionError("Already built files are the source of truth")
    monkeypatch.setattr(verifier.subprocess, "run", forbidden)
    assert verifier.main(["--template", str(configuration[0]), "--artifacts-dir", str(build)]) == 0


def test_staging_excludes_offline_content_preserving_runtime_assets(tmp_path):
    root, destination = tmp_path / "repo", tmp_path / "staged"
    for package in staging.PACKAGES:
        source = root / package
        source.mkdir(parents=True)
        (source / "__init__.py").write_bytes(b"")
    fixtures = ["models/training/train.py", "models/README.md", "models/RELEASE_AUDIT.json", "models/tests/test.py",
                "models/__pycache__/cache.pyc", "ingest/notebooks/notebook.ipynb", "agent/.pytest_cache/cache",
                "models/plume/params.json", "agent/prompts/system.md"]
    for name in fixtures:
        source = root / name
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"asset")
    staging.stage_sources(root, destination)
    assert (destination / "models/plume/params.json").read_bytes() == b"asset"
    assert (destination / "agent/prompts/system.md").read_bytes() == b"asset"
    assert not (destination / "models/training").exists()
    assert not any(path.name in staging.EXCLUDED_DIRECTORIES for path in destination.rglob("*"))
    assert not (destination / "models/README.md").exists()
    (destination / "models/stale.py").write_bytes(b"stale")
    staging.stage_sources(root, destination)
    assert not (destination / "models/stale.py").exists()
    assert all((root / name).is_file() for name in fixtures)


def test_staging_rejects_source_overlap(tmp_path):
    for package in staging.PACKAGES:
        (tmp_path / package).mkdir()
    with pytest.raises(ValueError, match="overlaps source"):
        staging.stage_sources(tmp_path, tmp_path)


def test_prunes_reviewed_test_suites_preserving_runtime_helpers(tmp_path):
    paths = ["numpy/tests/test.py", "scipy/stats/tests/test.py", "sklearn/cluster/tests/test.py",
             "numpy/testing/__init__.py", "scipy/_lib/_testutils.py", "numpy/_core/_multiarray_tests.so",
             "numpy/__pycache__/array.pyc", "strands/assets/system.md", "example.dist-info/METADATA", "bin/f2py"]
    for name in paths:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"runtime-or-test")
    pruning.prune_artifact(tmp_path)
    assert not any(path.name in {"tests", "__pycache__"} for path in tmp_path.rglob("*"))
    assert not (tmp_path / "bin").exists()
    for name in paths[3:6] + paths[7:9]:
        assert (tmp_path / name).is_file()


def test_staged_physics_pipeline_uses_real_snapshots_without_offline_ml_or_pydantic(tmp_path):
    root = Path(__file__).resolve().parents[2]
    staged, live = tmp_path / "staged", tmp_path / "live"
    staging.stage_sources(root, staged)
    live.mkdir()
    for name in ("fires.json", "aqi.json", "wind.json", "sites.geojson", "population.json"):
        shutil.copy2(root / "data/live" / name, live / name)
    code = '''
import builtins, json, sys
from pathlib import Path
root, staged = map(Path, sys.argv[1:])
sys.path = [str(staged)] + [item for item in sys.path if Path(item).resolve() != root]
original = builtins.__import__
def guarded(name, *args, **kwargs):
    if name.startswith(("models.training", "pydantic")):
        raise AssertionError("Production pipeline must not need offline ML or Pydantic")
    if name.split(".")[0] in ("numpy", "scipy", "sklearn", "shapely", "certifi") and "tests" in name.split("."):
        raise AssertionError("Production pipeline must not import dependency test suites")
    return original(name, *args, **kwargs)
builtins.__import__ = guarded
from pipeline import steps
assert Path(steps.__file__).is_relative_to(staged)
keys = {name + "_key": name for name in ("fires", "aqi", "wind", "sites", "population")}
steps.publish_handler(keys, None)
assert steps.detect_handler(keys, None)["sources"] > 0
import os
fires = json.loads((Path(os.environ["AERIS_DATA_DIR"]) / "fires.json").read_text())
event = dict(keys, forecast_hours=2, forecast_start=max(fire["acq_time"] for fire in fires["fires"]))
assert steps.corridor_handler(event, None)["features"] > 0
steps.rank_handler(keys, None)
from pipeline.contracts import check_corridor
assert check_corridor(json.loads((Path(os.environ["AERIS_DATA_DIR"]) / "corridor.geojson").read_text())) == []
'''
    environment = dict(os.environ, AERIS_STORAGE="local", AERIS_DATA_DIR=str(live), PYTHONDONTWRITEBYTECODE="1")
    result = subprocess.run([sys.executable, "-I", "-c", code, str(root), str(staged)], env=environment,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    assert result.returncode == 0, result.stdout + result.stderr
