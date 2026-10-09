"""Remove reviewed dependency test suites and bytecode from generated artifacts."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

# Preserve runtime libraries, numpy.testing and private testing helpers. Only
# these packages' tests directories are excluded; SDK assets/metadata stay intact.
TEST_PACKAGES = ("numpy", "scipy", "sklearn", "shapely", "certifi")


def prune_artifact(root: Path) -> None:
    if root.is_symlink() or getattr(root, "is_junction", lambda: False)():
        raise ValueError(f"Artifact root must not be a link: {root}")
    root = root.resolve()
    if not root.is_dir() or root == root.parent:
        raise ValueError(f"Expected a generated artifact directory: {root}")
    directories = []
    for path in root.rglob("*"):
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
            raise ValueError(f"Artifact links are unsupported: {path}")
        relative = path.relative_to(root)
        if path.is_dir() and (path.name == "__pycache__" or
                              (relative.parts[0] in TEST_PACKAGES and path.name == "tests")):
            directories.append(path)
    # Lambda handlers call Python APIs, not these optional console entry points.
    if (root / "bin").is_dir():
        directories.append(root / "bin")
    # Verify every resolved target remains in the explicit artifact directory
    # before deleting any of them, then remove deepest directories first.
    if any(not path.resolve().is_relative_to(root) for path in directories):
        raise ValueError("Pruning target escapes the artifact directory")
    for path in sorted(directories, key=lambda item: len(item.parts), reverse=True):
        shutil.rmtree(path)
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in {".pyc", ".pyo"}:
            if not path.resolve().is_relative_to(root):
                raise ValueError(f"Bytecode target escapes artifact: {path}")
            path.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    prune_artifact(parser.parse_args().artifact)
