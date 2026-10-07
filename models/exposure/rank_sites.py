"""
models/exposure/rank_sites.py
------------------------------
Exposure ranking: intersect corridor.geojson with sites.geojson and
population.json to produce ranked_sites.json.

Formula (from docs/members/meenal-data-exposure.md):
  vulnerability:
    hospitals ×1.5, schools ×1.3, scaled by log(occupancy) and child/elderly factor
  risk_score = clip(pm25_delta/200 · vulnerability · urgency, 0, 1)
    where urgency is higher for smaller eta_hours

  Exposed population:
    sum of pop cells inside corridor bands with risk ≥ threshold
    low/high by varying threshold ±25%

STATUS: Blocked pending corridor.geojson from Pritam.
  No real corridor.geojson exists in the repository at this time.
  This module provides the interface and formula implementation ready for
  integration, but does NOT fabricate a corridor or exposure values.

Usage (when corridor.geojson exists):
  python -m models.exposure.rank_sites --live

Inputs:
  data/live/corridor.geojson  — from Pritam
  data/live/sites.geojson     — from this ingest module
  data/live/population.json   — from this ingest module

Output:
  data/live/ranked_sites.json
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_LIVE = _REPO_ROOT / "data" / "live"


# ---------------------------------------------------------------------------
# Scoring formula
# ---------------------------------------------------------------------------

def vulnerability_weight(site_type: str, occupancy: int | None) -> float:
    """
    Compute vulnerability multiplier for a site.

    hospitals ×1.5, schools ×1.3, scaled by log(occupancy).
    Occupancy defaults to 150 for hospitals and 800 for schools
    only for the scoring weight (not stored in the output).
    """
    base_occ = 150 if site_type == "hospital" else 800
    occ = occupancy if (occupancy is not None and occupancy > 0) else base_occ
    type_factor = 1.5 if site_type == "hospital" else 1.3
    return type_factor * math.log1p(occ)


def urgency_factor(eta_hours: float) -> float:
    """
    Urgency increases as ETA decreases.
    urgency = 1 / (1 + eta_hours)  (approaches 1 for ETA=0, approaches 0 for large ETA)
    """
    return 1.0 / (1.0 + max(0.0, eta_hours))


def risk_score(
    pm25_delta: float,
    site_type: str,
    occupancy: int | None,
    eta_hours: float,
) -> float:
    """
    Compute risk score ∈ [0, 1] for a site in a corridor band.

      risk_score = clip(pm25_delta/200 · vulnerability · urgency, 0, 1)
    """
    vuln = vulnerability_weight(site_type, occupancy)
    urg = urgency_factor(eta_hours)
    raw = (pm25_delta / 200.0) * vuln * urg
    return max(0.0, min(1.0, raw))


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def rank_sites(
    corridor: dict[str, Any],
    sites: dict[str, Any],
    population: dict[str, Any],
    risk_threshold: float = 0.3,
) -> dict[str, Any]:
    """
    Intersect corridor bands with sites and population to produce ranked_sites.json.

    This function requires shapely. It will NOT be called until corridor.geojson
    exists from Pritam.

    Parameters
    ----------
    corridor:   corridor.geojson FeatureCollection (Pritam's output)
    sites:      sites.geojson FeatureCollection (this module's output)
    population: population.json dict (this module's output)
    risk_threshold: minimum risk to count a corridor band

    Returns
    -------
    dict in the ranked_sites.json contract format
    """
    from models.common.geo import point_in_polygon

    try:
        from shapely.geometry import Point, shape
        from shapely.strtree import STRtree
        has_shapely = True
    except ImportError:
        has_shapely = False

    features = corridor.get("features", [])
    band_features = [f for f in features if f.get("properties", {}).get("kind") == "band"]

    # Pre-extract coordinate rings for fast ray-casting fallback
    band_rings = []
    for f in band_features:
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [])
        if coords and isinstance(coords[0], list):
            band_rings.append(coords[0])
        else:
            band_rings.append([])

    if has_shapely:
        band_shapes = [shape(f["geometry"]) for f in band_features]
        band_tree = STRtree(band_shapes)
    else:
        band_shapes = []
        band_tree = None

    site_features = sites.get("features", [])
    ranked: list[dict[str, Any]] = []

    for site_feat in site_features:
        props = site_feat.get("properties", {})
        coords = site_feat.get("geometry", {}).get("coordinates", [None, None])
        lon, lat = coords[0], coords[1]
        if lon is None or lat is None:
            continue

        if has_shapely and band_tree is not None:
            pt = Point(lon, lat)
            hits = band_tree.query(pt)
            containing_bands = [band_features[i] for i in hits if band_shapes[i].contains(pt)]
        else:
            containing_bands = [
                band_features[i]
                for i, ring in enumerate(band_rings)
                if ring and point_in_polygon(lon, lat, ring)
            ]

        if not containing_bands:
            continue  # site not in any corridor band

        # ETA = earliest band's hour_from
        eta = min(
            b["properties"].get("hour_from", 0) for b in containing_bands
        )
        # pm25_delta = maximum across containing bands
        pm25_delta = max(
            b["properties"].get("pm25_delta_ugm3", 0.0) for b in containing_bands
        )
        source_id = containing_bands[0]["properties"].get("source_id", "")

        score = risk_score(
            pm25_delta,
            props.get("type", "school"),
            props.get("occupancy"),
            float(eta),
        )

        ranked.append({
            "site_id": props["id"],
            "name": props.get("name", ""),
            "type": props.get("type", "school"),
            "lat": lat,
            "lon": lon,
            "occupancy": props.get("occupancy"),
            "eta_hours": float(eta),
            "pm25_delta_ugm3": pm25_delta,
            "risk_score": round(score, 4),
            "source_id": source_id,
        })

    # Sort descending by risk_score
    ranked.sort(key=lambda x: x["risk_score"], reverse=True)
    for i, s in enumerate(ranked, start=1):
        s["rank"] = i

    # Exposed population: sum cells inside bands with risk >= threshold
    pop_cells = population.get("cells", [])
    exposed_pop = 0

    if has_shapely:
        band_shapes_threshold = [
            band_shapes[i]
            for i, f in enumerate(band_features)
            if f["properties"].get("risk", 0.0) >= risk_threshold
        ]
        for cell in pop_cells:
            pt = Point(cell["lon"], cell["lat"])
            for bs in band_shapes_threshold:
                if bs.contains(pt):
                    exposed_pop += cell["pop"]
                    break
    else:
        threshold_rings = [
            band_rings[i]
            for i, f in enumerate(band_features)
            if band_rings[i] and f["properties"].get("risk", 0.0) >= risk_threshold
        ]
        for cell in pop_cells:
            c_lon, c_lat = cell["lon"], cell["lat"]
            for ring in threshold_rings:
                if point_in_polygon(c_lon, c_lat, ring):
                    exposed_pop += cell["pop"]
                    break

    # ±25% allowance for population-data error
    low = int(exposed_pop * 0.75)
    high = int(exposed_pop * 1.25)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "generated_at": generated_at,
        "exposed_population": {
            "estimate": exposed_pop,
            "low": low,
            "high": high,
        },
        "sites": ranked,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cli() -> None:
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(
        description="Rank vulnerable sites by exposure (requires corridor.geojson from Pritam)"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Read inputs from data/live/",
    )
    args = parser.parse_args()

    if args.live:
        corridor_path = _DATA_LIVE / "corridor.geojson"
        sites_path = _DATA_LIVE / "sites.geojson"
        pop_path = _DATA_LIVE / "population.json"

        if not corridor_path.exists():
            logger.error(
                "corridor.geojson not found at %s.\n"
                "This file is produced by Pritam's plume model and does not yet exist.\n"
                "Run the exposure ranking after Pritam delivers corridor.geojson.",
                corridor_path,
            )
            raise SystemExit(1)

        with corridor_path.open() as f:
            corridor = json.load(f)
        with sites_path.open() as f:
            sites_data = json.load(f)
        with pop_path.open() as f:
            pop = json.load(f)

        result = rank_sites(corridor, sites_data, pop)
        out_path = _DATA_LIVE / "ranked_sites.json"
        with out_path.open("w") as f:
            json.dump(result, f, indent=2)
        n = len(result["sites"])
        exp = result["exposed_population"]["estimate"]
        print(f"Wrote {out_path} ({n} ranked sites, {exp:,} exposed population estimate)")


if __name__ == "__main__":
    _cli()
