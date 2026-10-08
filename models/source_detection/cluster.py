"""
models/source_detection/cluster.py
-----------------------------------
Spatial clustering of real NASA VIIRS fire detections into pollution sources.
Follows docs/members/pritam-models.md and docs/data-contracts.md.
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from models.common.geo import haversine_km

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_LIVE = _REPO_ROOT / "data" / "live"


def cluster_fires(fires: list[dict[str, Any]], eps_km: float = 18.0, min_samples: int = 2) -> list[list[dict[str, Any]]]:
    """
    Cluster fire points based on haversine distance (pure Python DBSCAN-style).
    Points within eps_km are grouped into the same cluster.
    """
    n = len(fires)
    visited = [False] * n
    clusters: list[list[dict[str, Any]]] = []

    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True

        # Find all neighbors within eps_km
        neighbors = []
        for j in range(n):
            dist = haversine_km(fires[i]["lat"], fires[i]["lon"], fires[j]["lat"], fires[j]["lon"])
            if dist <= eps_km:
                neighbors.append(j)

        if len(neighbors) < min_samples:
            # Noise / isolated fire, can be grouped as single point if high FRP or dropped
            continue

        cluster_indices = set(neighbors)
        queue = list(neighbors)

        while queue:
            curr = queue.pop(0)
            if not visited[curr]:
                visited[curr] = True
                curr_neighbors = []
                for k in range(n):
                    dist = haversine_km(fires[curr]["lat"], fires[curr]["lon"], fires[k]["lat"], fires[k]["lon"])
                    if dist <= eps_km:
                        curr_neighbors.append(k)
                if len(curr_neighbors) >= min_samples:
                    for cn in curr_neighbors:
                        if cn not in cluster_indices:
                            cluster_indices.add(cn)
                            queue.append(cn)

        clusters.append([fires[idx] for idx in cluster_indices])

    return clusters


def detect_sources(fires_data: dict[str, Any], aqi_data: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Transform raw VIIRS fires into structured pollution sources matching data-contracts.md.
    """
    raw_fires = fires_data.get("fires", [])
    # Filter nominal/high confidence fires
    valid_fires = [f for f in raw_fires if f.get("confidence") in ("nominal", "high", "h", "n")]
    if not valid_fires:
        valid_fires = raw_fires

    clusters = cluster_fires(valid_fires, eps_km=18.0, min_samples=2)

    sources: list[dict[str, Any]] = []

    for i, cluster in enumerate(clusters, start=1):
        fire_count = len(cluster)
        total_frp = sum(float(f.get("frp_mw", 0.0)) for f in cluster)

        # FRP-weighted centroid
        if total_frp > 0:
            c_lat = sum(f["lat"] * float(f.get("frp_mw", 1.0)) for f in cluster) / total_frp
            c_lon = sum(f["lon"] * float(f.get("frp_mw", 1.0)) for f in cluster) / total_frp
        else:
            c_lat = sum(f["lat"] for f in cluster) / fire_count
            c_lon = sum(f["lon"] for f in cluster) / fire_count

        # Compute radius containing 90% of fires
        distances = sorted([haversine_km(c_lat, c_lon, f["lat"], f["lon"]) for f in cluster])
        idx_90 = min(len(distances) - 1, int(0.9 * len(distances)))
        radius_km = max(4.0, round(distances[idx_90], 1))

        # Time range
        times = sorted([f.get("acq_time", "") for f in cluster if f.get("acq_time")])
        first_seen = times[0] if times else datetime.now(timezone.utc).isoformat()
        last_seen = times[-1] if times else first_seen

        # Emission strength: normalized curve 1 - exp(-FRP / 150)
        emission_strength = round(min(1.0, 1.0 - math.exp(-total_frp / 150.0)), 3)

        # Confidence: combine fire count, proportion of high confidence, and FRP
        high_conf_count = sum(1 for f in cluster if f.get("confidence") in ("high", "h"))
        conf_ratio = high_conf_count / fire_count if fire_count else 0.5
        confidence = round(min(0.98, max(0.65, 0.60 + 0.25 * conf_ratio + min(0.15, fire_count * 0.01))), 2)

        # Agricultural zone check: Punjab/Haryana (lat 29.0-32.5, lon 74.0-77.0)
        is_agri = 28.8 <= c_lat <= 32.5 and 73.8 <= c_lon <= 77.2
        source_type = "stubble_burning" if is_agri else "industrial_fire"

        sources.append({
            "id": f"src_{i:03d}",
            "type": source_type,
            "lat": round(c_lat, 5),
            "lon": round(c_lon, 5),
            "fire_count": fire_count,
            "total_frp_mw": round(total_frp, 1),
            "radius_km": radius_km,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "confidence": confidence,
            "emission_strength": emission_strength,
        })

    # Sort descending by emission strength
    sources.sort(key=lambda s: s["emission_strength"], reverse=True)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "generated_at": generated_at,
        "sources": sources,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    fires_path = _DATA_LIVE / "fires.json"
    if not fires_path.exists():
        logger.error("Missing %s", fires_path)
        raise SystemExit(1)

    with fires_path.open() as f:
        fires_data = json.load(f)

    aqi_path = _DATA_LIVE / "aqi.json"
    aqi_data = json.load(aqi_path.open()) if aqi_path.exists() else None

    result = detect_sources(fires_data, aqi_data)
    out_path = _DATA_LIVE / "sources.json"
    with out_path.open("w") as f:
        json.dump(result, f, indent=2)

    logger.info("Generated %s with %d detected sources", out_path, len(result["sources"]))


if __name__ == "__main__":
    main()
