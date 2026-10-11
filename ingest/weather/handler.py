"""
ingest/weather/handler.py
--------------------------
Lambda-compatible handler for the wind fetcher.

CLI:
  python -m ingest.weather.handler
  python -m ingest.weather.handler --bbox 73.5,28.0,77.5,32.5 --step 0.25
"""

from __future__ import annotations

import argparse
import logging
from typing import Any

from ingest.common import storage
from ingest.weather.fetch_wind import DEFAULT_BBOX, DEFAULT_STEP_DEG, fetch_wind

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point."""
    bbox = event.get("bbox", DEFAULT_BBOX)
    step_deg = float(event.get("step_deg", DEFAULT_STEP_DEG))
    logger.info("lambda_handler: bbox=%s step_deg=%s", bbox, step_deg)
    result = fetch_wind(bbox=bbox, step_deg=step_deg)
    if not any(p.get("hours") for p in result["points"]):
        raise RuntimeError("Open-Meteo returned no grid points; keeping existing data")
    location = storage.write_bronze("wind", result)
    logger.info("lambda_handler: wrote %s with %d grid points", location, len(result["points"]))
    return {"location": location, "count": len(result["points"])}


def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Open-Meteo wind data and write data/live/wind.json"
    )
    parser.add_argument(
        "--bbox",
        default=",".join(str(x) for x in DEFAULT_BBOX),
        help="west,south,east,north (default: %(default)s)",
    )
    parser.add_argument(
        "--step",
        type=float,
        default=DEFAULT_STEP_DEG,
        help="Grid spacing in degrees (default: %(default)s)",
    )
    args = parser.parse_args()
    bbox = [float(x) for x in args.bbox.split(",")]
    result = fetch_wind(bbox=bbox, step_deg=args.step)
    if not any(p.get("hours") for p in result["points"]):
        parser.exit(1, "No usable wind samples; existing snapshot preserved.\n")
    out = storage.write_json("wind", result)
    print(f"Wrote {out} ({len(result['points'])} grid points)")


if __name__ == "__main__":
    _cli()
