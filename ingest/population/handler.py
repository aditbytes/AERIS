"""
ingest/population/handler.py
-----------------------------
Lambda-compatible handler and CLI for the WorldPop population pipeline.

CLI:
  python -m ingest.population.build_population
  python -m ingest.population.build_population --bbox 73.5,28.0,77.5,32.5 --force-download
"""

from __future__ import annotations

import argparse
import logging
from typing import Any

from ingest.common import storage
from ingest.population.build_population import DEFAULT_BBOX, build_population

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point."""
    bbox = event.get("bbox", DEFAULT_BBOX)
    logger.info("lambda_handler: bbox=%s", bbox)
    result = build_population(bbox=bbox)
    if not result["cells"]:
        raise RuntimeError("WorldPop clip produced no cells; keeping existing data")
    location = storage.write_reference("population", result)
    logger.info("lambda_handler: wrote %s with %d cells", location, len(result["cells"]))
    return {"location": location, "count": len(result["cells"])}


def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Build WorldPop population grid and write data/live/population.json"
    )
    parser.add_argument(
        "--bbox",
        default=",".join(str(x) for x in DEFAULT_BBOX),
        help="west,south,east,north (default: %(default)s)",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Re-download the WorldPop GeoTIFF even if it already exists in data/raw/",
    )
    args = parser.parse_args()
    bbox = [float(x) for x in args.bbox.split(",")]
    try:
        result = build_population(bbox=bbox, force_download=args.force_download)
        if not result["cells"]:
            raise RuntimeError("WorldPop clip produced no cells; keeping existing data")
    except Exception as exc:
        import sys
        print(f"ERROR: {exc}", file=sys.stderr)
        print("No data written; existing snapshot preserved.", file=sys.stderr)
        sys.exit(1)
    out = storage.write_json("population", result)
    total_pop = sum(c["pop"] for c in result["cells"])
    print(f"Wrote {out} ({len(result['cells'])} cells, total pop {total_pop:,})")


if __name__ == "__main__":
    _cli()
