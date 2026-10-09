"""Stage the source files used by the Lambda Makefile, without changing originals."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

PACKAGES = ("ingest", "models", "agent", "pipeline", "api")
EXCLUDED_DIRECTORIES = {"tests", "__pycache__", ".pytest_cache", "notebooks"}


def included(relative: Path) -> bool:
    """Keep runtime source/assets, including any future calibrated params.json."""
    if EXCLUDED_DIRECTORIES.intersection(relative.parts):
        return False
    if relative.parts[:2] == ("models", "training"):
        return False  # Optional offline ML; no production handler imports it.
    if relative.as_posix() == "models/RELEASE_AUDIT.json":
        return False
    if relative.as_posix() == "agent/prompts/system.md":
        return True
    return relative.name != ".gitkeep" and relative.suffix.lower() not in {".md", ".ipynb", ".pyc", ".pyo"}


def _link(path: Path) -> bool:
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def stage_sources(repo_root: Path, destination: Path) -> int:
    repo_root, destination = repo_root.resolve(), destination.resolve()
    # Only replace these explicitly named generated directories. Never replace
    # originals, follow links, or remove anything outside the chosen destination.
    for package in PACKAGES:
        source = repo_root / package
        target = destination / package
        if not source.is_dir():
            raise ValueError(f"Missing source package: {source}")
        if target == source or target.is_relative_to(source) or source.is_relative_to(target):
            raise ValueError(f"Staging destination overlaps source: {target}")
        if _link(target) or target.resolve().parent != destination:
            raise ValueError(f"Unsafe staging target: {target}")
        if target.exists() and (not target.is_dir() or any(_link(p) for p in target.rglob("*"))):
            raise ValueError(f"Unsafe existing staging contents: {target}")
    destination.mkdir(parents=True, exist_ok=True)
    count = 0
    for package in PACKAGES:
        target = destination / package
        if target.exists():
            shutil.rmtree(target)
        target.mkdir()
        for source in sorted((repo_root / package).rglob("*")):
            relative = source.relative_to(repo_root)
            if not included(relative):
                continue
            if _link(source):
                raise ValueError(f"Source links are unsupported: {source}")
            if source.is_file():
                output = destination / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, output)
                count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parents[1]
    parser.add_argument("--dest", type=Path, default=root / "infra/lambda")
    args = parser.parse_args()
    print(f"Staged {stage_sources(root, args.dest)} runtime source/assets into {args.dest}")


if __name__ == "__main__":
    main()
