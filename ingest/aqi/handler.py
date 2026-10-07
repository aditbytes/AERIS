"""
ingest/aqi/handler.py
---------------------
Lambda-compatible handler for the AQI fetcher.

CLI:
  python -m ingest.aqi.handler
  python -m ingest.aqi.handler --bbox 73.5,28.0,77.5,32.5
"""

from __future__ import annotations

import argparse
import logging
from typing import Any

from ingest.common import storage
from ingest.aqi.fetch_aqi import DEFAULT_BBOX, fetch_aqi

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
    result = fetch_aqi(bbox=bbox)
    storage.write_json("aqi", result)
    logger.info("lambda_handler: wrote aqi.json with %d stations", len(result["stations"]))
    return result


def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch AQI data (OpenAQ + CPCB) and write data/live/aqi.json"
    )
    parser.add_argument(
        "--bbox",
        default=",".join(str(x) for x in DEFAULT_BBOX),
        help="west,south,east,north (default: %(default)s)",
    )
    args = parser.parse_args()
    bbox = [float(x) for x in args.bbox.split(",")]
    result = fetch_aqi(bbox=bbox)
    out = storage.write_json("aqi", result)
    print(f"Wrote {out} ({len(result['stations'])} stations)")


if __name__ == "__main__":
    _cli()
