"""
One-time upload of a real snapshot from data/live/ to s3://<bucket>/reference/<name>/.

Used for datasets too heavy to build in Lambda (population needs rasterio and a
~1 GB WorldPop GeoTIFF). The snapshot must carry ``generated_at`` and ``source``
from the run that produced it; nothing is altered on the way up.

Usage:
  AERIS_S3_BUCKET=aeris-<account>-data python3 scripts/load_reference.py population
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.common import storage  # noqa: E402

GEOJSON = {"sites"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("name", choices=["population", "sites"])
    args = parser.parse_args()
    geojson = args.name in GEOJSON

    os.environ["AERIS_STORAGE"] = "local"
    obj = storage.read_json(args.name, geojson=geojson)
    if not obj.get("source"):
        raise SystemExit(f"data/live/{args.name} has no 'source' stamp; refusing to upload")
    count = len(obj.get("cells") or obj.get("features") or [])
    if not count:
        raise SystemExit(f"data/live/{args.name} is empty; refusing to upload")

    os.environ["AERIS_STORAGE"] = "s3"
    loc = storage.write_reference(args.name, obj, geojson=geojson)
    print(f"Uploaded {count} records (generated_at {obj['generated_at']}) to {loc}")


if __name__ == "__main__":
    main()
