"""
ingest/firms/handler.py
-----------------------
Lambda-compatible handler for the FIRMS fire fetcher.

Interface required by docs/members/meenal-data-exposure.md:
  lambda_handler(event, context) → dict

The handler calls the pure fetch_fires() function and writes the result
via storage.write_json().

Local CLI:
  python -m ingest.firms.handler
"""

from __future__ import annotations

import argparse
import logging
import sys
from typing import Any

from ingest.common import secrets, storage
from ingest.firms.fetch_fires import DEFAULT_BBOX, DEFAULT_DAY_RANGE, DEFAULT_SOURCES, fetch_fires

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    AWS Lambda entry point.

    event may contain:
      bbox       : [west, south, east, north]
      day_range  : int
      sources    : list[str]

    Writes the fires.json contract object to bronze/fires/ and returns a summary.
    On failure, raises — nothing is written, existing data is untouched, and
    Lambda retries then sends the event to the dead-letter queue.
    """
    bbox = event.get("bbox", DEFAULT_BBOX)
    day_range = int(event.get("day_range", DEFAULT_DAY_RANGE))
    sources = event.get("sources", DEFAULT_SOURCES)

    logger.info("lambda_handler: bbox=%s day_range=%d sources=%s", bbox, day_range, sources)
    result = fetch_fires(
        bbox=bbox,
        day_range=day_range,
        sources=sources,
        key=secrets.get_secret("FIRMS_MAP_KEY"),
    )
    location = storage.write_bronze("fires", result)
    logger.info("lambda_handler: wrote %s with %d detections", location, len(result["fires"]))
    return {"location": location, "count": len(result["fires"])}


def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch NASA FIRMS active-fire detections and write data/live/fires.json"
    )
    parser.add_argument(
        "--bbox",
        default=",".join(str(x) for x in DEFAULT_BBOX),
        help="west,south,east,north (default: %(default)s)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAY_RANGE,
        help="Day range 1–10 (default: %(default)s)",
    )
    parser.add_argument(
        "--sources",
        default=",".join(DEFAULT_SOURCES),
        help="Comma-separated FIRMS source ids (default: %(default)s)",
    )
    args = parser.parse_args()

    bbox = [float(x) for x in args.bbox.split(",")]
    sources = [s.strip() for s in args.sources.split(",")]
    result = fetch_fires(bbox=bbox, day_range=args.days, sources=sources)
    out = storage.write_json("fires", result)
    print(f"Wrote {out} ({len(result['fires'])} fires)")


if __name__ == "__main__":
    _cli()
