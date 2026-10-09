"""Check Lambda dependencies or enforce supplied function-plus-layer byte limits."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import yaml


class VerificationError(ValueError):
    """A required packaging check failed."""


class TemplateLoader(yaml.SafeLoader):
    """Read configuration without interpreting CloudFormation intrinsic functions."""

    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict:
        # Reject duplicate explicit keys before SafeLoader silently overwrites
        # them. YAML merge keys still retain their normal override semantics.
        keys = set()
        for key_node, _ in node.value:
            if key_node.tag == "tag:yaml.org,2002:merge":
                continue
            key = self.construct_object(key_node, deep=deep)
            try:
                duplicate = key in keys
                keys.add(key)
            except TypeError as exc:
                raise yaml.constructor.ConstructorError(
                    None, None, "Unhashable configuration key", key_node.start_mark
                ) from exc
            if duplicate:
                raise yaml.constructor.ConstructorError(
                    None, None, f"Duplicate configuration key {key!r}", key_node.start_mark
                )
        return super().construct_mapping(node, deep=deep)


def _intrinsic(loader: TemplateLoader, tag: str, node: yaml.Node) -> Any:
    if isinstance(node, yaml.ScalarNode):
        value = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node)
    else:
        value = loader.construct_mapping(node)
    return {tag if tag == "Ref" else f"Fn::{tag}": value}


TemplateLoader.add_multi_constructor("!", _intrinsic)

PLATFORMS = {"arm64": "manylinux2014_aarch64", "x86_64": "manylinux2014_x86_64"}
UNCOMPRESSED_LIMIT = 250 * 1024**2
# Keep handler dependency sets separate; test and raster preparation packages
# do not belong in these Lambda manifests.
HANDLERS = {
    "pipeline.steps.publish_handler": "requirements-pipeline.txt",
    "pipeline.steps.detect_handler": "requirements-pipeline.txt",
    "pipeline.steps.corridor_handler": "requirements-pipeline.txt",
    "pipeline.steps.rank_handler": "requirements-pipeline.txt",
    "pipeline.steps.agent_handler": "requirements-agent.txt",
    "ingest.firms.handler.lambda_handler": "requirements.txt",
    "ingest.aqi.handler.lambda_handler": "requirements.txt",
    "ingest.weather.handler.lambda_handler": "requirements.txt",
    "ingest.sites.handler.lambda_handler": "requirements.txt",
    "api.handlers.app.lambda_handler": None,
}
DIRECT_DEPENDENCIES = {
    # scikit-learn needs threadpoolctl even when offline ML source is excluded.
    "requirements-pipeline.txt": {"numpy", "scikit-learn", "pyproj", "shapely", "threadpoolctl"},
    "requirements-agent.txt": {"strands-agents", "boto3", "botocore", "pydantic"},
    "requirements.txt": {"requests"},
}


def _mapping(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise VerificationError(f"{context} must be a mapping")
    return value


def _read_utf8(path: Path, context: str) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise VerificationError(f"{context}: cannot read UTF-8 file {path}: {exc}") from exc


def load_template(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise VerificationError(f"Missing SAM template: {path}")
    try:
        return _mapping(yaml.load(_read_utf8(path, "Template"), Loader=TemplateLoader), "Template")
    except yaml.YAMLError as exc:
        raise VerificationError(f"Invalid SAM YAML in {path}: {exc}") from exc


def _layer_keys(defaults: dict[str, Any], properties: dict[str, Any], name: str) -> list[str]:
    keys = []
    # SAM prepends global list entries to per-function entries.
    for config in (defaults, properties):
        layers = config.get("Layers", [])
        if not isinstance(layers, list):
            raise VerificationError(f"{name}: Layers must be a list")
        for layer in layers:
            if isinstance(layer, str) and layer.startswith("arn:"):
                key = layer
            elif isinstance(layer, dict) and set(layer) == {"Ref"} and isinstance(layer["Ref"], str):
                key = layer["Ref"]
            else:
                raise VerificationError(f"{name}: unresolved layer reference {layer!r}; supply a concrete Ref or ARN")
            if key not in keys:
                keys.append(key)
    return keys


def _makefile(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    if not path.is_file():
        raise VerificationError(f"Missing Makefile: {path}")
    text = re.sub(r"\\\r?\n[ \t]*", " ", _read_utf8(path, "Makefile"))
    variables, recipes = {}, {}
    targets: list[str] = []
    for number, line in enumerate(text.splitlines(), 1):
        if line.startswith("\t"):
            for target in targets:
                recipes[target] += line.strip() + "\n"
        else:
            targets = []
            variable = re.match(r"^(\w+)\s*([?:+]?)=\s*(.*)$", line)
            if variable:
                if variable[2]:
                    raise VerificationError(f"{path}:{number}: unsupported variable assignment; use a static NAME = value")
                variables[variable[1]] = variable[3]
            elif re.match(r"^build-\w", line):
                names, separator, prerequisites = line.partition(":")
                if not separator or prerequisites.strip():
                    raise VerificationError(f"Unsupported Makefile target declaration: {line}")
                targets = names.split()
                for target in targets:
                    if target in recipes:
                        raise VerificationError(f"Duplicate Makefile target: {target}")
                    recipes[target] = ""
            elif line.strip() and not line.lstrip().startswith("#"):
                raise VerificationError(f"{path}:{number}: unsupported Makefile declaration {line!r}")
    return variables, recipes


def _expand_recipe(recipe: str, variables: dict[str, str], context: str) -> str:
    def expand(text: str, active: tuple[str, ...] = ()) -> str:
        def replacement(match: re.Match) -> str:
            name = match[1]
            if name == "ARTIFACTS_DIR":
                return match[0]  # SAM supplies this value at build time.
            if name not in variables or name in active:
                raise VerificationError(f"{context}: unresolved or recursive Makefile variable {name!r}")
            return expand(variables[name], (*active, name))
        return re.sub(r"\$\(([^)]+)\)", replacement, text)
    return expand(recipe)


def _install_arguments(recipe: str, context: str) -> list[list[str]]:
    commands = []
    for line in recipe.splitlines():
        try:
            lexer = shlex.shlex(line, posix=True, punctuation_chars=";&|")
            lexer.whitespace_split = True
            tokens = list(lexer)
        except ValueError as exc:
            raise VerificationError(f"{context}: invalid recipe quoting: {exc}") from exc
        if not tokens:
            continue
        if any(re.fullmatch(r"[;&|]+", token) for token in tokens):
            raise VerificationError(f"{context}: compound shell commands cannot be verified unambiguously")
        executable = Path(tokens[0]).name
        arguments = None
        if re.fullmatch(r"python(?:\d+(?:\.\d+)*)?(?:\.exe)?", executable) and tokens[1:4] == ["-m", "pip", "install"]:
            arguments = tokens[4:]
        elif re.fullmatch(r"pip(?:\d+(?:\.\d+)*)?(?:\.exe)?", executable) and tokens[1:2] == ["install"]:
            arguments = tokens[2:]
        if arguments is not None:
            commands.append(arguments)
    return commands


def _option_values(arguments: list[str], option: str, context: str) -> list[str]:
    values = []
    for index, token in enumerate(arguments):
        if token == option:
            if index + 1 == len(arguments) or arguments[index + 1].startswith("-"):
                raise VerificationError(f"{context}: missing value for {option}")
            values.append(arguments[index + 1])
        elif token.startswith(option + "="):
            values.append(token[len(option) + 1:])
    return values


def inspect_configuration(template_path: Path) -> list[dict[str, Any]]:
    """Validate every configured function and group identical dependency targets."""
    template = load_template(template_path)
    global_config = _mapping(template.get("Globals", {}), "Globals")
    defaults = _mapping(global_config.get("Function", {}), "Globals.Function")
    resources = _mapping(template.get("Resources"), "Resources")
    groups: dict[tuple[Any, ...], dict[str, Any]] = {}
    local_layers = {name for name, resource in resources.items() if isinstance(resource, dict)
                    and resource.get("Type") in {"AWS::Serverless::LayerVersion", "AWS::Lambda::LayerVersion"}}
    for name, resource in resources.items():
        resource = _mapping(resource, f"Resources.{name}")
        if not isinstance(resource.get("Type"), str):
            raise VerificationError(f"{name}: missing or unresolved resource Type; function discovery cannot proceed")
        if resource.get("Type") == "AWS::Lambda::Function":
            raise VerificationError(f"{name}: raw AWS::Lambda::Function builds are unsupported; configure a SAM makefile function")
        if resource.get("Type") != "AWS::Serverless::Function":
            continue
        properties = _mapping(resource.get("Properties"), f"{name}.Properties")
        if properties.get("PackageType", "Zip") != "Zip":
            raise VerificationError(f"{name}: this verifier supports local ZIP-based functions only")
        runtime = properties.get("Runtime", defaults.get("Runtime"))
        if runtime != "python3.12":
            raise VerificationError(f"{name}: unsupported runtime {runtime!r}; this verifier supports python3.12")
        # SAM replaces Function.Architectures; Layers are additive instead.
        architectures = properties.get("Architectures", defaults.get("Architectures"))
        if (
            not isinstance(architectures, list) or len(architectures) != 1
            or not isinstance(architectures[0], str) or architectures[0] not in PLATFORMS
        ):
            raise VerificationError(f"{name}: unsupported or missing Architectures {architectures!r}")
        architecture = architectures[0]
        python_version = runtime.removeprefix("python")
        implementation, abi = "cp", "cp" + python_version.replace(".", "")
        handler = properties.get("Handler", defaults.get("Handler"))
        if not isinstance(handler, str) or handler not in HANDLERS:
            raise VerificationError(f"{name}: unsupported or missing handler {handler!r}")
        metadata = _mapping(resource.get("Metadata", {}), f"{name}.Metadata")
        if metadata.get("BuildMethod") != "makefile":
            raise VerificationError(f"{name}: expected BuildMethod: makefile")
        code_uri = properties.get("CodeUri", defaults.get("CodeUri"))
        if not isinstance(code_uri, str) or not code_uri or "://" in code_uri:
            raise VerificationError(f"{name}: missing local CodeUri or unsupported value {code_uri!r}; expected a local directory path")
        source_dir = (template_path.parent / code_uri).resolve()
        try:
            variables, recipes = _makefile(source_dir / "Makefile")
        except VerificationError as exc:
            raise VerificationError(f"{name}: {exc}") from exc
        target = f"build-{name}"
        if target not in recipes:
            raise VerificationError(f"{name}: missing Makefile target {target}")
        recipe = _expand_recipe(recipes[target], variables, name)
        installs = _install_arguments(recipe, name)
        expected = HANDLERS[handler]
        if len(installs) != (1 if expected else 0):
            raise VerificationError(f"{name}: expected {'one' if expected else 'no'} pip install command for {expected!r}")
        arguments = installs[0] if installs else []
        manifests = _option_values(arguments, "-r", name) + _option_values(arguments, "--requirement", name)
        if manifests != ([expected] if expected else []):
            raise VerificationError(f"{name}: Makefile manifests {manifests!r}; expected {expected!r}")
        manifest = source_dir / expected if expected else None
        declared = set()
        if manifest is not None:
            if not manifest.is_file():
                raise VerificationError(f"{name}: missing dependency manifest {manifest}")
            if "--no-compile" not in arguments or "--compile" in arguments:
                raise VerificationError(f"{name}: Makefile target must specify --no-compile to limit artifact size")
            if "--no-deps" in arguments or "--ignore-requires-python" in arguments:
                raise VerificationError(f"{name}: pip install must retain dependency and Requires-Python checks")
            if _option_values(arguments, "--no-binary", name) or _option_values(arguments, "-c", name) or _option_values(arguments, "--constraint", name):
                raise VerificationError(f"{name}: source-build overrides or separate constraints cannot be verified from this manifest alone")
            for option, value in {
                "--platform": PLATFORMS[architecture], "--python-version": python_version,
                "--implementation": implementation, "--abi": abi, "--only-binary": ":all:",
            }.items():
                configured = _option_values(arguments, option, name)
                if configured != [value]:
                    raise VerificationError(f"{name}: Makefile target must specify {option} {value}")
            for line in _read_utf8(manifest, name).splitlines():
                line = line.split("#", 1)[0].strip()
                if not line:
                    continue
                match = re.match(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)", line)
                if not match:
                    raise VerificationError(f"{name}: unsupported requirement declaration in {manifest}: {line!r}")
                package = re.sub(r"[-_.]+", "-", match[1]).lower()
                if package in DIRECT_DEPENDENCIES[expected] and ";" in line:
                    raise VerificationError(f"{name}: {manifest.name} must declare production dependency {package} unconditionally")
                declared.add(package)
            missing = DIRECT_DEPENDENCIES[expected] - declared
            if missing:
                raise VerificationError(f"{name}: missing direct dependencies in {manifest.name}: {', '.join(sorted(missing))}")
        group = groups.setdefault((source_dir, recipe, manifest, runtime, architecture), {
            "manifest": manifest, "runtime": runtime, "architecture": architecture,
            "platform": PLATFORMS[architecture], "functions": [], "source_dir": source_dir,
            "python_version": python_version, "implementation": implementation, "abi": abi,
            "declared_dependencies": sorted(declared),
            "function_layers": {}, "function_handlers": {}, "local_layers": local_layers,
        })
        group["functions"].append(name)
        group["function_handlers"][name] = handler
        group["function_layers"][name] = _layer_keys(defaults, properties, name)
    if not groups:
        raise VerificationError("SAM template contains no Lambda functions")
    return list(groups.values())


def artifact_size(path: Path) -> tuple[int, int]:
    """Sum logical file bytes, not disk blocks or compressed wheel sizes."""
    if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
        raise VerificationError(f"Artifact links are unsupported: {path}")
    if path.is_file() and zipfile.is_zipfile(path):
        try:
            with zipfile.ZipFile(path) as archive:
                members = [member for member in archive.infolist() if not member.is_dir()]
                return sum(member.file_size for member in members), len(members)
        except (OSError, zipfile.BadZipFile) as exc:
            raise VerificationError(f"Cannot read artifact ZIP {path}: {exc}") from exc
    if not path.is_dir():
        raise VerificationError(f"Missing artifact directory or ZIP: {path}")
    size = count = 0
    def traversal_error(exc: OSError) -> None:
        raise VerificationError(f"Cannot traverse artifact {path}: {exc}") from exc

    # Path.rglob can suppress filesystem errors, producing an incomplete size.
    for directory, subdirectories, files in os.walk(path, onerror=traversal_error, followlinks=False):
        for name in subdirectories + files:
            item = Path(directory) / name
            if item.is_symlink() or getattr(item, "is_junction", lambda: False)():
                raise VerificationError(f"Artifact links are unsupported: {item}")
            try:
                entry = item.stat(follow_symlinks=False)
            except OSError as exc:
                raise VerificationError(f"Cannot stat artifact file {item}: {exc}") from exc
            if stat.S_ISREG(entry.st_mode):
                size += entry.st_size
                count += 1
            elif not stat.S_ISDIR(entry.st_mode):
                raise VerificationError(f"Unsupported artifact file type: {item}")
    return size, count


def measure_packages(groups: list[dict[str, Any]], artifacts_dir: Path,
                     layer_artifacts: dict[str, Path] | None = None) -> list[dict[str, Any]]:
    """Count every built function file and each distinct attached layer once per function."""
    layer_artifacts = layer_artifacts or {}
    cache: dict[Path, tuple[int, int]] = {}
    results = []

    def measured(path: Path) -> tuple[int, int]:
        # Check the original path for links before resolving/caching it.
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
            raise VerificationError(f"Artifact links are unsupported: {path}")
        resolved = path.resolve()
        if resolved not in cache:
            cache[resolved] = artifact_size(path)
        return cache[resolved]

    for group in groups:
        for function in group["functions"]:
            artifact = artifacts_dir / function
            try:
                package_bytes, files = measured(artifact)
            except (VerificationError, OSError) as exc:
                raise VerificationError(f"{function}: {exc}") from exc
            handler = group["function_handlers"][function]
            module_file = Path(*handler.rsplit(".", 1)[0].split(".")).with_suffix(".py")
            if not (artifact / module_file).is_file():
                raise VerificationError(f"{function}: built artifact is missing handler module {module_file}")
            layers = []
            for key in group["function_layers"][function]:
                path = layer_artifacts.get(key)
                if path is None:
                    if key not in group["local_layers"]:
                        raise VerificationError(f"{function}: unmeasured external/parameter layer {key}; use --layer-artifact KEY=PATH")
                    path = artifacts_dir / key
                try:
                    size, layer_files = measured(path)
                except (VerificationError, OSError) as exc:
                    raise VerificationError(f"{function}: layer {key}: {exc}") from exc
                layers.append({"layer": key, "artifact_path": str(path.resolve()), "bytes": size, "files": layer_files})
            layer_bytes = sum(layer["bytes"] for layer in layers)
            total = package_bytes + layer_bytes
            results.append({"function": function, "artifact_path": str(artifact.resolve()),
                            "package_bytes": package_bytes, "package_files": files,
                            "layers": layers, "layer_bytes": layer_bytes, "total_bytes": total,
                            "headroom_bytes": UNCOMPRESSED_LIMIT - total})
    return results


def enforce_sizes(results: list[dict[str, Any]]) -> None:
    oversized = [result for result in results if result["total_bytes"] > UNCOMPRESSED_LIMIT]
    if oversized:
        detail = "; ".join(f"{item['function']}: {item['total_bytes']:,} bytes "
                           f"({-item['headroom_bytes']:,} over limit)" for item in oversized)
        raise VerificationError(f"Function + layers exceed {UNCOMPRESSED_LIMIT:,}-byte uncompressed limit: {detail}")


def resolve_dependencies(group: dict[str, Any]) -> tuple[int, int]:
    """Download only matching wheels to a disposable directory, without AWS calls."""
    manifest = group["manifest"]
    if manifest is None:
        return 0, 0
    with tempfile.TemporaryDirectory(prefix="aeris-lambda-wheels-") as directory:
        command = [
            sys.executable, "-m", "pip", "download", "--only-binary=:all:",
            "--platform", group["platform"], "--python-version", group["python_version"],
            "--implementation", group["implementation"], "--abi", group["abi"], "--no-cache-dir",
            "--dest", directory, "-r", str(manifest),
        ]
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        if result.returncode:
            detail = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
            raise VerificationError(f"Dependency resolution failed for {manifest.name} ({group['runtime']}/{group['architecture']}):\n{detail}")
        wheels = list(Path(directory).glob("*.whl"))
        if not wheels:
            raise VerificationError(f"Dependency resolution produced no wheels for {manifest.name}")
        uncompressed_bytes = 0
        for wheel in wheels:
            try:
                with zipfile.ZipFile(wheel) as archive:
                    uncompressed_bytes += sum(item.file_size for item in archive.infolist())
            except zipfile.BadZipFile as exc:
                raise VerificationError(f"Invalid resolved wheel {wheel.name}: {exc}") from exc
        return len(wheels), uncompressed_bytes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, default=Path(__file__).resolve().parents[1] / "infra/template.yaml")
    parser.add_argument("--config-only", action="store_true", help="Check configuration/manifests without downloading packages")
    parser.add_argument("--artifacts-dir", type=Path, help="Measure supplied function build directories and enforce the function-plus-layer limit; does not run SAM")
    parser.add_argument("--layer-artifact", action="append", default=[], metavar="KEY=PATH",
                        help="Local directory/ZIP for an external layer ARN or parameter Ref; never fetched from AWS")
    parser.add_argument("--report", type=Path, help="Write measured package/layer bytes as JSON")
    args = parser.parse_args(argv)
    if args.config_only and args.artifacts_dir:
        parser.error("--config-only and --artifacts-dir are mutually exclusive")
    if (args.layer_artifact or args.report) and not args.artifacts_dir:
        parser.error("--layer-artifact and --report require --artifacts-dir")
    try:
        groups = inspect_configuration(args.template)
        if args.artifacts_dir:
            layers = {}
            for value in args.layer_artifact:
                key, separator, path = value.partition("=")
                if not separator or not key or not path or key in layers:
                    raise VerificationError(f"Invalid or duplicate --layer-artifact {value!r}; expected KEY=PATH")
                layers[key] = Path(path)
            results = measure_packages(groups, args.artifacts_dir, layers)
            if args.report:
                report = args.report.resolve()
                measured_paths = [Path(item["artifact_path"]) for item in results]
                measured_paths += [Path(layer["artifact_path"]) for item in results for layer in item["layers"]]
                if any(report == path or report.is_relative_to(path) for path in measured_paths):
                    raise VerificationError("--report must be outside every measured function/layer artifact; otherwise it changes the measured size")
            for result in results:
                print(f"SIZE {result['function']}: package={result['package_bytes']:,} bytes; "
                      f"layers={result['layer_bytes']:,}; total={result['total_bytes']:,}; "
                      f"headroom={result['headroom_bytes']:,}", flush=True)
                print(f"  artifact={result['artifact_path']}; layers={result['layers']}", flush=True)
            if args.report:
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps({"limit_bytes": UNCOMPRESSED_LIMIT,
                    "measurement_kind": "PROVIDED_ARTIFACTS", "artifacts_dir": str(args.artifacts_dir.resolve()),
                    "sam_build_verified": False, "deployment_verified": False, "functions": results}, indent=2) + "\n", encoding="utf-8")
            enforce_sizes(results)
            print("PASS supplied-artifact size gate; SAM build provenance, deployment and native execution NOT_VERIFIED.")
            return 0
        host_architecture = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "x86_64", "amd64": "x86_64"}.get(platform.machine().lower())
        host_markers_verified = (
            sys.platform == "linux" and sys.version_info[:2] == (3, 12)
            and sys.implementation.name == "cpython"
            and all(group["architecture"] == host_architecture for group in groups)
        )
        if not args.config_only and not host_markers_verified:
            print("WARN pip evaluates dependency markers on the host; use Linux CPython 3.12 matching the target architecture for the complete Lambda dependency closure", flush=True)
        for group in groups:
            manifest = group["manifest"]
            label = str(manifest) if manifest else "runtime-provided SDK (no dependency manifest)"
            print(f"CHECK {label}: {group['runtime']} / {group['architecture']} / {group['platform']}; functions={','.join(group['functions'])}", flush=True)
            if manifest:
                print(f"  declared dependencies={','.join(group['declared_dependencies'])}; "
                      "pip resolves transitive dependencies; runtime SDK used unless the manifest packages boto3/botocore", flush=True)
            if args.config_only:
                print("PASS configuration; wheel availability NOT_CHECKED", flush=True)
            elif manifest is None:
                print("PASS configuration; runtime-only package, no wheels resolved", flush=True)
            else:
                count, size = resolve_dependencies(group)
                status = "PASS" if host_markers_verified else "NOT_VERIFIED host markers; downloaded"
                print(f"{status} dependency resolution: {count} packages; uncompressed wheel contents={size:,} bytes ({size / 1024**2:.1f} MiB)", flush=True)
                if size > 250 * 1024**2:
                    print("WARN dependency wheel contents exceed 250 MiB; review the actual Lambda artifact size", flush=True)
        if not args.config_only and not host_markers_verified:
            raise VerificationError("Target wheel tags do not verify host-evaluated dependency markers; rerun wheel resolution on Linux CPython 3.12 matching the target architecture (Windows may activate pywin32)")
    except (VerificationError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        return 1
    print("Wheel content sizes exclude staged source and installation changes. No SAM build or deployment was performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
