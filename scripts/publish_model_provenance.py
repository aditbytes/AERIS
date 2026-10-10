"""Publish metadata separately from captured bytes; --check detects stale metadata."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from models.common.provenance import describe_bytes, inspect_artifact

ROOT = Path(__file__).resolve().parents[1]


def publication(directory: Path) -> dict:
    artifacts = {}
    byte_variants = {}
    for kind, filename in (("sources", "sources.json"), ("corridor", "corridor.geojson")):
        companion = directory / f"{kind}.provenance.json"
        artifacts[kind] = inspect_artifact(directory / filename, kind,
                                           provenance_path=companion if companion.exists() else None)
        if artifacts[kind]["artifact_status"] == "ARCHIVED_LEGACY":
            # Git's existing text conversion produces two evidenced byte variants.
            # Describe both separately; never normalize or rewrite the data files.
            lf = (directory / filename).read_bytes().replace(b"\r\n", b"\n")
            artifacts[kind] = describe_bytes(lf, kind)
            byte_variants[kind] = [describe_bytes(lf.replace(b"\n", b"\r\n"), kind)]
            if any(v["artifact_status"] != "ARCHIVED_LEGACY" for v in [artifacts[kind], *byte_variants[kind]]):
                raise ValueError("Archive newline variant has not been independently registered")
    return {"schema_version": 1, "binding": "EXACT_UTF8_BYTES_NOT_SUPPLIER_AUTHENTICATION", "artifacts": artifacts, "byte_variants": byte_variants}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "web/public/data")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    target = args.directory / "model-provenance.json"
    body = (json.dumps(publication(args.directory), indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
    if args.check:
        if not target.exists() or json.loads(target.read_text(encoding="utf-8")) != json.loads(body):
            parser.exit(1, "Static model provenance is missing or out of date; regenerate it before building.\n")
    else:
        target.write_bytes(body)
    print(f"{'Verified' if args.check else 'Wrote'} {target}; model snapshots unchanged")


if __name__ == "__main__":
    main()
