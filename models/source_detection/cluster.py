"""Local fire-cluster source detection; see README.md for assumptions and formulas."""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN

from models.common.geo import EARTH_RADIUS_KM

logger = logging.getLogger(__name__)
_REPO_ROOT = Path(__file__).resolve().parents[2]
_CONFIDENCE_LEVELS = {"low": 0, "nominal": 1, "high": 2}
_NOISE_POLICIES = ("drop", "individual_minor_sources")


@dataclass(frozen=True)
class SourceDetectionParams:
    """Uncalibrated baseline parameters. as_of=None uses the snapshot time."""

    window_hours: float = 24.0
    eps_km: float = 7.5
    min_samples: int = 3
    min_confidence: str = "nominal"
    noise_policy: str = "drop"
    frp_scale_mw: float = 500.0
    confidence_count_scale: float = 10.0
    as_of: datetime | None = None
    # WGS84 [west, south, east, north]; a regional proxy, not a land-use map.
    agricultural_bbox: tuple[float, float, float, float] = (73.8, 28.8, 77.2, 32.5)

    def __post_init__(self) -> None:
        for name in ("window_hours", "eps_km", "frp_scale_mw", "confidence_count_scale"):
            if _number(getattr(self, name), name) <= 0:
                raise ValueError(f"{name} must be positive")
        if not isinstance(self.min_samples, int) or isinstance(self.min_samples, bool) or self.min_samples < 1:
            raise ValueError("min_samples must be a positive integer")
        if not isinstance(self.min_confidence, str) or self.min_confidence not in _CONFIDENCE_LEVELS:
            raise ValueError("min_confidence must be low, nominal or high")
        if not isinstance(self.noise_policy, str) or self.noise_policy not in _NOISE_POLICIES:
            raise ValueError(f"noise_policy must be one of {_NOISE_POLICIES}")
        if self.as_of is not None:
            if not isinstance(self.as_of, datetime) or self.as_of.utcoffset() is None:
                raise ValueError("as_of must be a timezone-aware datetime")
        _validate_bbox(self.agricultural_bbox, "agricultural_bbox")


def _number(value: Any, where: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{where} must be a finite JSON number")
    try:
        result = float(value)
    except OverflowError as exc:
        raise ValueError(f"{where} must be finite") from exc
    if not math.isfinite(result):
        raise ValueError(f"{where} must be finite")
    return result


def _coordinates(record: dict[str, Any], where: str) -> tuple[float, float]:
    lat = _number(record.get("lat"), f"{where}.lat")
    lon = _number(record.get("lon"), f"{where}.lon")
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError(f"{where}: lat/lon outside WGS84 ranges")
    return lat, lon


def _validate_bbox(value: Any, where: str) -> None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError(f"{where} must be [west, south, east, north]")
    west, south, east, north = (_number(v, where) for v in value)
    if not (-180 <= west <= east <= 180 and -90 <= south <= north <= 90):
        raise ValueError(f"{where} must be ordered WGS84 bounds")


def _parse_time(value: Any, where: str) -> datetime:
    if not isinstance(value, str) or "T" not in value:
        raise ValueError(f"{where} must be a timezone-aware ISO-8601 timestamp")
    try:
        result = datetime.fromisoformat(value)
        if result.utcoffset() is None:
            raise ValueError("missing timezone")
        return result.astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise ValueError(f"{where} must be a timezone-aware ISO-8601 timestamp") from exc


def _utc_string(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_snapshot(fires: Any) -> tuple[datetime, list[dict[str, Any]]]:
    if not isinstance(fires, dict):
        raise ValueError("fires must be a parsed fires.json object")
    generated_at = _parse_time(fires.get("generated_at"), "generated_at")
    if not isinstance(fires.get("source"), str) or not fires["source"].strip():
        raise ValueError("source must identify the captured fire feed")
    _validate_bbox(fires.get("bbox"), "bbox")
    if not isinstance(fires.get("fires"), list):
        raise ValueError("fires.fires must be a list (missing input is not an empty snapshot)")

    validated = []
    for i, record in enumerate(fires["fires"]):
        where = f"fires[{i}]"
        if not isinstance(record, dict):
            raise ValueError(f"{where} must be an object")
        if not isinstance(record.get("id"), str) or not record["id"].strip():
            raise ValueError(f"{where}.id must be a nonempty string")
        lat, lon = _coordinates(record, where)
        frp = _number(record.get("frp_mw"), f"{where}.frp_mw")
        brightness = _number(record.get("brightness_k"), f"{where}.brightness_k")
        if frp < 0 or brightness < 0:
            raise ValueError(f"{where}: frp_mw and brightness_k must be nonnegative")
        acquired = _parse_time(record.get("acq_time"), f"{where}.acq_time")
        if acquired > generated_at:
            raise ValueError(f"{where}.acq_time is after snapshot generated_at")
        confidence = record.get("confidence")
        if not isinstance(confidence, str) or confidence not in _CONFIDENCE_LEVELS:
            raise ValueError(f"{where}.confidence must be low, nominal or high (normalized by ingestion)")
        validated.append({**record, "lat": lat, "lon": lon, "frp_mw": frp,
                          "acq_time": _utc_string(acquired)})
    return generated_at, validated


def _fire_key(fire: dict[str, Any]) -> tuple[Any, ...]:
    return (fire["lat"], fire["lon"], fire.get("acq_time", ""),
            fire.get("id", ""), fire.get("frp_mw", 0), fire.get("confidence", ""))


_DEFAULT_PARAMS = SourceDetectionParams()


def cluster_fires(
    fires: list[dict[str, Any]],
    eps_km: float = _DEFAULT_PARAMS.eps_km,
    min_samples: int = _DEFAULT_PARAMS.min_samples,
    *,
    noise_policy: str = "drop",
) -> list[list[dict[str, Any]]]:
    """DBSCAN on [latitude, longitude] radians, with eps_km / Earth radius."""
    SourceDetectionParams(eps_km=eps_km, min_samples=min_samples, noise_policy=noise_policy)
    if not isinstance(fires, list):
        raise ValueError("cluster_fires requires a list of coordinate records")
    for i, fire in enumerate(fires):
        if not isinstance(fire, dict):
            raise ValueError(f"fires[{i}] must be an object")
        _coordinates(fire, f"fires[{i}]")
    if not fires:
        return []
    # Canonical order makes DBSCAN's assignment of ambiguous border points repeatable.
    ordered = sorted(fires, key=_fire_key)
    coords = np.radians([[fire["lat"], fire["lon"]] for fire in ordered])
    labels = DBSCAN(eps=eps_km / EARTH_RADIUS_KM, min_samples=min_samples,
                    metric="haversine", algorithm="ball_tree").fit_predict(coords)
    clusters = [[fire for fire, label in zip(ordered, labels) if label == cluster_id]
                for cluster_id in sorted(set(labels) - {-1})]
    if noise_policy == "individual_minor_sources":
        clusters.extend([[fire] for fire, label in zip(ordered, labels) if label == -1])
    return clusters


def _spherical_centroid(cluster: list[dict[str, Any]]) -> tuple[float, float]:
    # Scale weights to avoid overflow in FRP * coordinate products.
    max_frp = max(fire["frp_mw"] for fire in cluster)
    weights = [fire["frp_mw"] / max_frp if max_frp > 0 else 1.0 for fire in cluster]
    vectors = []
    for fire in cluster:
        lat, lon = math.radians(fire["lat"]), math.radians(fire["lon"])
        vectors.append((math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)))
    x, y, z = (math.fsum(w * vector[i] for w, vector in zip(weights, vectors)) for i in range(3))
    if math.sqrt(x * x + y * y + z * z) <= 1e-12 * math.fsum(weights):
        raise ValueError("Cluster has no well-defined spherical centroid (near-antipodal extent)")
    return math.degrees(math.atan2(z, math.hypot(x, y))), math.degrees(math.atan2(y, x))


def _radius_km(cluster: list[dict[str, Any]], lat: float, lon: float) -> float:
    distances = []
    phi = math.radians(lat)
    for fire in cluster:
        phi_fire = math.radians(fire["lat"])
        a = (math.sin((phi_fire - phi) / 2) ** 2
             + math.cos(phi) * math.cos(phi_fire) * math.sin(math.radians(fire["lon"] - lon) / 2) ** 2)
        distances.append(2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, max(0.0, a)))))
    # Nearest rank: the smallest observed radius enclosing at least 90% of fires.
    return sorted(distances)[math.ceil(0.9 * len(distances)) - 1]


def _source_metrics(cluster: list[dict[str, Any]], as_of: datetime,
                    params: SourceDetectionParams) -> dict[str, Any]:
    try:
        total_frp = math.fsum(fire["frp_mw"] for fire in cluster)
    except OverflowError as exc:
        raise ValueError("Cluster total_frp_mw exceeds the finite numeric range") from exc
    lat, lon = _spherical_centroid(cluster)
    times = [_parse_time(fire["acq_time"], "acq_time") for fire in cluster]
    count_component = -math.expm1(-len(cluster) / params.confidence_count_scale)
    high_share = sum(fire["confidence"] == "high" for fire in cluster) / len(cluster)
    recency = math.fsum(max(0.0, 1 - (as_of - t).total_seconds() / (params.window_hours * 3600))
                       for t in times) / len(cluster)
    confidence = 0.4 * count_component + 0.3 * high_share + 0.3 * recency
    west, south, east, north = params.agricultural_bbox
    is_agricultural_season = south <= lat <= north and west <= lon <= east and max(times).month in (10, 11)
    return {
        "type": "stubble_burning" if is_agricultural_season else "fire",
        "lat": lat,
        "lon": lon,
        "fire_count": len(cluster),
        "total_frp_mw": total_frp,
        "radius_km": _radius_km(cluster, lat, lon),
        "first_seen": _utc_string(min(times)),
        "last_seen": _utc_string(max(times)),
        "confidence": min(1.0, max(0.0, confidence)),
        "emission_strength": min(1.0, max(0.0, -math.expm1(-total_frp / params.frp_scale_mw))),
    }


def detect_sources(
    fires: dict[str, Any],
    aqi: dict[str, Any] | None = None,
    params: SourceDetectionParams | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate and cluster a real parsed fires.json snapshot into sources.json.

    Invalid input raises ValueError; valid empty/fully filtered input returns no
    sources. Time defaults to fires['generated_at'], making this function pure
    and repeatable. AQI is accepted but unused: its contract lacks wind/history.
    """
    if params is None:
        params = SourceDetectionParams()
    elif isinstance(params, dict):
        try:
            params = SourceDetectionParams(**params)
        except TypeError as exc:
            raise ValueError(f"Invalid source-detection parameters: {exc}") from exc
    elif not isinstance(params, SourceDetectionParams):
        raise ValueError("params must be SourceDetectionParams, a parameter dict or None")
    generated_at, records = _validate_snapshot(fires)
    as_of = params.as_of.astimezone(timezone.utc) if params.as_of is not None else generated_at
    if any(_parse_time(fire["acq_time"], "acq_time") > as_of for fire in records):
        raise ValueError("A detection is after as_of; choose a reference time at or after acquisition")
    try:
        cutoff = as_of - timedelta(hours=params.window_hours)
    except OverflowError as exc:
        raise ValueError("window_hours exceeds the supported datetime range") from exc
    kept = [fire for fire in records
            if _parse_time(fire["acq_time"], "acq_time") >= cutoff
            and _CONFIDENCE_LEVELS[fire["confidence"]] >= _CONFIDENCE_LEVELS[params.min_confidence]]
    clusters = cluster_fires(kept, params.eps_km, params.min_samples, noise_policy=params.noise_policy)
    sources = [_source_metrics(cluster, as_of, params) for cluster in clusters]
    sources.sort(key=lambda source: (-source["total_frp_mw"], source["lat"], source["lon"],
                                     source["first_seen"], source["last_seen"], source["fire_count"]))
    for i, source in enumerate(sources, start=1):
        source["id"] = f"src_{i:03d}"
    return {"generated_at": _utc_string(as_of), "sources": sources}


def main(argv: list[str] | None = None) -> None:
    """Read local snapshots only. Never call a fetcher or the S3 storage backend."""
    parser = argparse.ArgumentParser(description="Detect sources from a captured real FIRMS snapshot")
    parser.add_argument("--live", action="store_true", required=True, help="Read local data/live/fires.json")
    parser.add_argument("--output", type=Path, help="Output path (default: sources.json beside fires.json)")
    parser.add_argument("--window-hours", type=float, default=_DEFAULT_PARAMS.window_hours)
    parser.add_argument("--eps-km", type=float, default=_DEFAULT_PARAMS.eps_km)
    parser.add_argument("--min-samples", type=int, default=_DEFAULT_PARAMS.min_samples)
    parser.add_argument("--min-confidence", choices=tuple(_CONFIDENCE_LEVELS), default=_DEFAULT_PARAMS.min_confidence)
    parser.add_argument("--noise-policy", choices=_NOISE_POLICIES, default=_DEFAULT_PARAMS.noise_policy)
    parser.add_argument("--frp-scale-mw", type=float, default=_DEFAULT_PARAMS.frp_scale_mw)
    parser.add_argument("--as-of", help="Aware ISO-8601 reference time (default: snapshot generated_at)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", "data/live"))
    if not data_dir.is_absolute():
        data_dir = _REPO_ROOT / data_dir
    fires_path = data_dir / "fires.json"
    out_path = args.output if args.output is not None else data_dir / "sources.json"
    try:
        if out_path.resolve() == fires_path.resolve():
            raise ValueError("Output must not overwrite the input fires.json snapshot")
        fires = json.loads(fires_path.read_text(encoding="utf-8"))
        params = SourceDetectionParams(window_hours=args.window_hours, eps_km=args.eps_km,
                                       min_samples=args.min_samples, min_confidence=args.min_confidence,
                                       noise_policy=args.noise_policy, frp_scale_mw=args.frp_scale_mw,
                                       as_of=_parse_time(args.as_of, "as_of") if args.as_of else None)
        result = detect_sources(fires, params=params)
        # Serialise before touching the output; invalid input preserves prior results.
        body = json.dumps(result, indent=2, allow_nan=False) + "\n"
        out_path.write_text(body, encoding="utf-8")
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Source detection failed: {exc}\n")
    logger.info("Snapshot %s (%s); reference %s; wrote %s with %d sources",
                fires_path, fires["generated_at"], result["generated_at"], out_path, len(result["sources"]))


if __name__ == "__main__":
    main()
