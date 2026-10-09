"""Offline checks for the Lambda verifier's configuration and resolver failures."""

from pathlib import Path
from types import SimpleNamespace
import zipfile

import pytest
import yaml

from scripts import verify_lambda_dependencies as verifier


@pytest.fixture
def configuration(tmp_path):
    source = tmp_path / "lambda"
    source.mkdir()
    data = {
        "Globals": {"Function": {"Runtime": "python3.12", "Architectures": ["arm64"]}},
        "Resources": {},
    }
    names = {
        "DetectFunction": "pipeline.steps.detect_handler",
        "AgentFunction": "pipeline.steps.agent_handler",
        "FirmsFunction": "ingest.firms.handler.lambda_handler",
        "ApiFunction": "api.handlers.app.lambda_handler",
    }
    recipes = [
        "PIP = python3 -m pip install --platform manylinux2014_aarch64 "
        "--python-version 3.12 --implementation cp --abi cp312 --only-binary=:all: --no-compile",
    ]
    for name, handler in names.items():
        data["Resources"][name] = {
            "Type": "AWS::Serverless::Function",
            "Metadata": {"BuildMethod": "makefile"},
            "Properties": {"CodeUri": "lambda/", "Handler": handler},
        }
        recipes.extend([f"build-{name}:", '\tmkdir -p "$(ARTIFACTS_DIR)"'])
        manifest = verifier.HANDLERS[handler]
        if manifest:
            recipes.append(f"\t$(PIP) -r {manifest}")
            (source / manifest).write_text(
                "\n".join(f"{package}>=1.0" for package in verifier.DIRECT_DEPENDENCIES[manifest]),
                encoding="utf-8",
            )
    (source / "Makefile").write_text("\n".join(recipes), encoding="utf-8")
    template = tmp_path / "template.yaml"
    template.write_text(yaml.safe_dump(data), encoding="utf-8")
    return template, data, source


def save(configuration):
    template, data, _ = configuration
    template.write_text(yaml.safe_dump(data), encoding="utf-8")
    return template


def test_reads_intrinsic_tags_and_independent_manifests(configuration):
    template, _, _ = configuration
    with template.open("a", encoding="utf-8") as stream:
        stream.write("\nOutputs:\n  Bucket: !Ref DataBucket\n  Arn: !Sub '${Bucket.Arn}'\n")
    groups = verifier.inspect_configuration(template)
    assert {group["manifest"].name for group in groups if group["manifest"]} == {
        "requirements.txt", "requirements-agent.txt", "requirements-pipeline.txt",
    }
    assert {group["architecture"] for group in groups} == {"arm64"}
    assert [group["functions"] for group in groups if group["manifest"] is None] == [["ApiFunction"]]


def test_per_function_runtime_and_architecture_override_globals(configuration):
    _, data, _ = configuration
    data["Globals"]["Function"] = {"Runtime": "python3.13", "Architectures": ["x86_64"]}
    for resource in data["Resources"].values():
        resource["Properties"]["Runtime"] = "python3.12"
        resource["Properties"]["Architectures"] = ["arm64"]
    data["Resources"]["ApiFunction"]["Properties"]["Architectures"] = ["x86_64"]
    groups = verifier.inspect_configuration(save(configuration))
    api = next(group for group in groups if group["manifest"] is None)
    assert api["architecture"] == "x86_64"
    assert api["platform"] == "manylinux2014_x86_64"


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda data: data.pop("Globals"), "unsupported runtime"),
        (lambda data: data["Globals"]["Function"].pop("Architectures"), "missing Architectures"),
        (lambda data: data["Globals"]["Function"].update(Runtime="python3.13"), "unsupported runtime"),
        (lambda data: data["Globals"]["Function"].update(Architectures=["s390x"]), "unsupported or missing Architectures"),
        (lambda data: data["Resources"]["DetectFunction"]["Properties"].pop("Handler"), "missing handler"),
        (lambda data: data["Resources"]["DetectFunction"]["Properties"].pop("CodeUri"), "missing local CodeUri"),
        (lambda data: data["Resources"]["DetectFunction"].pop("Metadata"), "BuildMethod"),
        (lambda data: data.update(Resources={}), "no Lambda functions"),
    ],
)
def test_missing_or_unsupported_configuration_fails(configuration, change, message):
    change(configuration[1])
    with pytest.raises(verifier.VerificationError, match=message):
        verifier.inspect_configuration(save(configuration))


def test_function_architecture_must_match_its_makefile_recipe(configuration):
    configuration[1]["Resources"]["AgentFunction"]["Properties"]["Architectures"] = ["x86_64"]
    with pytest.raises(verifier.VerificationError, match="--platform manylinux2014_x86_64"):
        verifier.inspect_configuration(save(configuration))


@pytest.mark.parametrize(
    ("before", "after", "message"),
    [
        ("build-AgentFunction:", "build-OtherFunction:", "missing Makefile target"),
        ("-r requirements-agent.txt", "-r requirements-pipeline.txt", "Makefile manifests"),
        ("--abi cp312", "--abi cp314", "--abi cp312"),
        ("--implementation cp", "--implementation pp", "--implementation cp"),
        ("--only-binary=:all:", "", "--only-binary :all:"),
        ("--no-compile", "", "--no-compile"),
    ],
)
def test_makefile_mismatch_fails(configuration, before, after, message):
    template, _, source = configuration
    makefile = source / "Makefile"
    makefile.write_text(makefile.read_text(encoding="utf-8").replace(before, after), encoding="utf-8")
    with pytest.raises(verifier.VerificationError, match=message):
        verifier.inspect_configuration(template)


def test_missing_manifest_fails(configuration):
    template, _, source = configuration
    (source / "requirements-agent.txt").unlink()
    with pytest.raises(verifier.VerificationError, match="missing dependency manifest"):
        verifier.inspect_configuration(template)


def test_missing_direct_dependency_fails(configuration):
    template, _, source = configuration
    manifest = source / "requirements-agent.txt"
    manifest.write_text(manifest.read_text(encoding="utf-8").replace("botocore>=1.0", ""), encoding="utf-8")
    with pytest.raises(verifier.VerificationError, match="missing direct dependencies.*botocore"):
        verifier.inspect_configuration(template)


def test_resolver_command_uses_target_flags_and_removes_wheels(configuration, monkeypatch):
    group = verifier.inspect_configuration(configuration[0])[0]
    directories = []

    def run(command, **kwargs):
        assert command[:4] == [verifier.sys.executable, "-m", "pip", "download"]
        for flag, value in {
            "--platform": "manylinux2014_aarch64", "--python-version": "3.12",
            "--implementation": "cp", "--abi": "cp312", "-r": str(group["manifest"]),
        }.items():
            assert command[command.index(flag) + 1] == value
        assert "--only-binary=:all:" in command and "--no-cache-dir" in command
        directory = Path(command[command.index("--dest") + 1])
        directories.append(directory)
        with zipfile.ZipFile(directory / "example-1.0-py3-none-any.whl", "w") as archive:
            archive.writestr("example.py", b"wheel test marker")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(verifier.subprocess, "run", run)
    assert verifier.resolve_dependencies(group) == (1, len(b"wheel test marker"))
    assert directories and all(not directory.exists() for directory in directories)


def test_failed_resolver_reports_package_and_target(configuration, monkeypatch, capsys):
    monkeypatch.setattr(
        verifier.subprocess, "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout="dependency explanation: host-marker package", stderr="No matching distribution found for bad-package"),
    )
    assert verifier.main(["--template", str(configuration[0])]) == 1
    error = capsys.readouterr().err
    assert "requirements-agent.txt" in error
    assert "python3.12/arm64" in error and "bad-package" in error
    assert "dependency explanation: host-marker package" in error


def test_success_without_wheels_is_a_failure(configuration, monkeypatch):
    monkeypatch.setattr(
        verifier.subprocess, "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )
    group = verifier.inspect_configuration(configuration[0])[0]
    with pytest.raises(verifier.VerificationError, match="produced no wheels"):
        verifier.resolve_dependencies(group)


def test_config_only_never_invokes_pip(configuration, monkeypatch, capsys):
    def forbidden(*args, **kwargs):
        raise AssertionError("Offline configuration validation must not invoke pip")

    monkeypatch.setattr(verifier.subprocess, "run", forbidden)
    assert verifier.main(["--template", str(configuration[0]), "--config-only"]) == 0
    output = capsys.readouterr().out
    assert output.count("wheel availability NOT_CHECKED") == 4
    assert "No SAM build or deployment was performed" in output
