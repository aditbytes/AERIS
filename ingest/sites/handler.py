"""
ingest/sites/handler.py
------------------------
Lambda-compatible handler for the OSM sites fetcher.

CLI:
  python -m ingest.sites.handler
  python -m ingest.sites.handler --bbox 76.5,28.0,77.8,29.2
"""

from __future__ import annotations

import argparse
import logging
from typing import Any

from ingest.common import storage
from ingest.sites.fetch_sites import DEFAULT_BBOX, fetch_sites

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
    result = fetch_sites(bbox=bbox)
    storage.write_json("sites", result, geojson=True)
    n = len(result.get("features", []))
    logger.info("lambda_handler: wrote sites.geojson with %d features", n)
    return result


def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch OSM schools/hospitals and write data/live/sites.geojson"
    )
    parser.add_argument(
        "--bbox",
        default=",".join(str(x) for x in DEFAULT_BBOX),
        help="west,south,east,north (default: %(default)s)",
    )
    args = parser.parse_args()
    bbox = [float(x) for x in args.bbox.split(",")]
    result = fetch_sites(bbox=bbox)
    out = storage.write_json("sites", result, geojson=True)
    n = len(result.get("features", []))
    print(f"Wrote {out} ({n} features)")


if __name__ == "__main__":
    _cli()
