"""Explicit historical provenance, pre-event backgrounds and frozen puff matches.

No captures are inferred from bare observations or model output. The manifest
must be independently assembled from real archives; this module never downloads.
"""

from __future__ import annotations

import hashlib
import math
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Protocol

from models.plume.advect import (
    Frame, LocalProjection, PlumeParams, Source, WindField, coordinates,
    number, parse_time, simulate_source, utc_string, validate_sources,
)
from models.plume.parameters import REAL_EVIDENCE, deterministic_json
from models.source_detection.cluster import detect_sources


def content_hash(value: Any) -> str:
    """Hash the canonical parsed payload, not its incidental file whitespace."""
    return hashlib.sha256(deterministic_json(value).encode("utf-8")).hexdigest()


def identity(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a nonempty string")
    return value


def provenance(value: Any, name: str, payload: Any = None) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("kind") != REAL_EVIDENCE:
        raise ValueError(f"{name}: real captured provenance required")
    for field in ("source", "capture_id", "archive_reference"):
        identity(value.get(field), f"{name}.{field}")
    if value.get("timing_verified") is not True:
        raise ValueError(f"{name}: timestamp provenance is unverified")
    deterministic_json(value)
    if payload is not None and value.get("content_sha256") != content_hash(payload):
        raise ValueError(f"{name}: captured payload digest mismatch")
    return dict(value)


@dataclass(frozen=True)
class EligibilityConfig:
    min_events: int = 3
    min_stations: int = 2
    min_training_observations: int = 4
    min_holdout_observations: int = 2
    holdout_fraction: float = 0.34
    min_background_observations: int = 3
    background_window_hours: float = 24.0
    matching_sigma: float = 2.0
    min_transport_m: float = 1000.0
    min_direction_cosine: float = 0.5
    max_events: int = 100
    max_observations: int = 10000

    def __post_init__(self) -> None:
        for name in ("min_events", "min_stations", "min_training_observations",
                     "min_holdout_observations", "min_background_observations",
                     "max_events", "max_observations"):
            value = getattr(self, name)
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                raise ValueError(f"{name} must be a positive integer")
        if self.min_events < 3 or self.min_stations < 2:
            raise ValueError("Automatic adoption requires at least three events and two stations")
        if self.min_training_observations < 4 or self.min_holdout_observations < 2:
            raise ValueError("Automatic adoption requires four training and two holdout observations")
        if not 0 < number(self.holdout_fraction, "holdout_fraction") < 1:
            raise ValueError("holdout_fraction must be in (0,1)")
        for name in ("background_window_hours", "matching_sigma", "min_transport_m"):
            if number(getattr(self, name), name) <= 0:
                raise ValueError(f"{name} must be positive")
        if not 0 < number(self.min_direction_cosine, "min_direction_cosine") <= 1:
            raise ValueError("min_direction_cosine must be in (0,1]")


@dataclass(frozen=True)
class Observation:
    id: str
    station_id: str
    lat: float
    lon: float
    period_start: datetime
    observed_at: datetime
    available_at: datetime
    pm25_ugm3: float
    provenance: dict[str, Any]


def parse_observation(value: dict[str, Any]) -> Observation:
    lat, lon = coordinates(value, "observation")
    start = parse_time(value.get("period_start"), "observation.period_start")
    end = parse_time(value.get("observed_at"), "observation.observed_at")
    available = parse_time(value.get("available_at"), "observation.available_at")
    if start > end or available < end:
        raise ValueError("Observation interval/availability timestamps are inconsistent")
    if value.get("unit") != "ug/m3" or value.get("observational") is not True:
        raise ValueError("Target must be observed PM2.5 in ug/m3, not AQI or model output")
    pm25 = number(value.get("pm25_ugm3"), "observation.pm25_ugm3")
    if pm25 < 0:
        raise ValueError("Observed PM2.5 must be nonnegative")
    return Observation(identity(value.get("id"), "observation.id"),
                       identity(value.get("station_id"), "station_id"), lat, lon,
                       start, end, available, pm25,
                       provenance(value.get("provenance"), "observation.provenance"))


@dataclass(frozen=True)
class Event:
    capture_id: str
    event_id: str
    source_event_time: datetime
    forecast_start: datetime
    sources: tuple[Source, ...]
    wind: dict[str, Any]
    provenance: dict[str, Any]
    fire_keys: frozenset[str] = frozenset()


def check_chronology(source_available: datetime, wind_available: datetime,
                     last_detection: datetime, forecast_start: datetime,
                     target_period_start: datetime | None = None) -> None:
    if max(source_available, wind_available, last_detection) >= forecast_start:
        raise ValueError("FUTURE_SOURCE_OR_WIND: source/wind must be available before prediction")
    if target_period_start is not None and target_period_start <= forecast_start:
        raise ValueError("TARGET_PRECEDES_FORECAST: target interval must follow prediction")


def parse_event(value: dict[str, Any]) -> Event:
    sources_data, wind, fires = value.get("sources"), value.get("wind"), value.get("fires")
    generated, sources = validate_sources(sources_data)
    if generated is None or not sources or any(s.emission_strength <= 0 for s in sources):
        raise ValueError("Event requires captured nonzero source states")
    start = parse_time(value.get("forecast_start"), "event.forecast_start")
    check_chronology(generated, parse_time(wind.get("generated_at"), "wind.generated_at"),
                     max(s.last_seen for s in sources), start)
    reconstructed = detect_sources(fires)
    if content_hash(reconstructed) != content_hash(sources_data):
        raise ValueError("Sources must be reproducible from the frozen real fire snapshot")
    event_time = parse_time(value.get("source_event_time"), "event.source_event_time")
    if event_time != min(parse_time(s["first_seen"], "first_seen") for s in sources_data["sources"]):
        raise ValueError("source_event_time must be the earliest contributing source detection")
    metadata = value.get("provenance", {})
    if metadata.get("event_group_verified") is not True:
        raise ValueError("Independent physical event grouping must be reviewed")
    checked = {name: provenance(metadata.get(name), f"event.{name}", payload)
               for name, payload in (("fires", fires), ("sources", sources_data), ("wind", wind))}
    field = WindField(wind, PlumeParams())
    if start < field.first_time or start >= field.last_time:
        raise ValueError("Forecast reference lacks covered real wind/PBLH")
    fire_keys = frozenset(content_hash({key: f.get(key) for key in ("lat", "lon", "acq_time", "satellite")})
                          for f in fires["fires"])
    return Event(identity(value.get("capture_id"), "event.capture_id"),
                 identity(value.get("event_id"), "event.event_id"), event_time, start,
                 tuple(sources), wind, checked, fire_keys)


@dataclass(frozen=True)
class BackgroundEstimate:
    value_ugm3: float
    observation_ids: tuple[str, ...]
    method: str


class BackgroundEstimator(Protocol):
    def __call__(self, candidates: tuple[Observation, ...]) -> BackgroundEstimate: ...


def pre_event_median(candidates: tuple[Observation, ...]) -> BackgroundEstimate:
    return BackgroundEstimate(float(statistics.median(o.pm25_ugm3 for o in candidates)),
                              tuple(o.id for o in candidates), "pre_event_station_median")


def estimate_background(target: Observation, observations: list[Observation], event: Event,
                        config: EligibilityConfig, estimator: BackgroundEstimator) -> BackgroundEstimate:
    cutoff = event.source_event_time
    candidates = tuple(sorted((o for o in observations
                              if o.station_id == target.station_id and o.id != target.id
                              and o.lat == target.lat and o.lon == target.lon
                              and o.observed_at - o.period_start == target.observed_at - target.period_start
                              and cutoff - timedelta(hours=config.background_window_hours) <= o.period_start
                              and o.observed_at < cutoff and o.available_at < event.forecast_start),
                             key=lambda o: (o.observed_at, o.id)))
    if len(candidates) < config.min_background_observations:
        raise ValueError("MISSING_BACKGROUND_HISTORY: insufficient independent pre-event station readings")
    # Plugins receive pre-event readings only, never target PM2.5.
    estimate = estimator(candidates)
    ids = set(estimate.observation_ids)
    if len(ids) < config.min_background_observations or len(ids) != len(estimate.observation_ids):
        raise ValueError("Background requires distinct independent readings")
    if not ids <= {o.id for o in candidates} or target.id in ids:
        raise ValueError("BACKGROUND_LEAKAGE: estimator referenced target/future/other-station data")
    if number(estimate.value_ugm3, "background") < 0 or not estimate.method:
        raise ValueError("Background must be a nonnegative, documented real-data estimate")
    used = [o.pm25_ugm3 for o in candidates if o.id in ids]
    if not min(used) <= estimate.value_ugm3 <= max(used):
        raise ValueError("Background estimate must remain within its cited pre-event readings")
    return estimate


@dataclass(frozen=True)
class Match:
    event: Event
    observation: Observation
    background: BackgroundEstimate
    source_ids: tuple[str, ...]
    hour_from: int
    hour_to: int
    transport_hours: tuple[float, ...]
    wind_at_station: tuple[float, float, float]

    @property
    def observed_delta(self) -> float:
        return self.observation.pm25_ugm3 - self.background.value_ugm3

    def to_dict(self) -> dict[str, Any]:
        o, e = self.observation, self.event
        return {"event_id": e.event_id, "capture_id": e.capture_id,
                "source_ids": list(self.source_ids), "source_event_time": utc_string(e.source_event_time),
                "forecast_start": utc_string(e.forecast_start), "observation_id": o.id,
                "station_id": o.station_id, "lat": o.lat, "lon": o.lon,
                "period_start": utc_string(o.period_start), "observed_at": utc_string(o.observed_at),
                "available_at": utc_string(o.available_at), "observed_pm25_ugm3": o.pm25_ugm3,
                "background_ugm3": self.background.value_ugm3, "observed_delta_ugm3": self.observed_delta,
                "background_method": self.background.method,
                "background_observation_ids": list(self.background.observation_ids),
                "transport_hours": list(self.transport_hours),
                "wind": dict(zip(("u_ms", "v_ms", "pblh_m"), self.wind_at_station)),
                "observation_provenance": o.provenance, "input_provenance": e.provenance}


def plausible_transport(source: Source, projection: LocalProjection, frames: list[Frame],
                        target: Observation, lo: int, hi: int,
                        config: EligibilityConfig) -> tuple[float, ...]:
    x, y = projection.forward.transform(target.lon, target.lat, errcheck=True)
    radius = math.hypot(x, y)
    if radius < config.min_transport_m or radius > projection.max_radius_m:
        return ()
    ages = []
    for frame in frames[lo:hi + 1]:
        for puff in frame.puffs:
            moved = math.hypot(puff.x_m, puff.y_m)
            if moved < config.min_transport_m or puff.age_hours <= 0:
                continue
            cosine = (x * puff.x_m + y * puff.y_m) / (radius * moved)
            if cosine >= config.min_direction_cosine and math.hypot(x - puff.x_m, y - puff.y_m) <= config.matching_sigma * puff.sigma_m:
                ages.append(puff.age_hours)
    return tuple(sorted(set(ages)))


def match_observations(events: list[Event], observations: list[Observation], config: EligibilityConfig,
                       estimator: BackgroundEstimator = pre_event_median) -> tuple[list[Match], list[dict[str, str]]]:
    """Freeze associations with baseline geometry before any parameter search."""
    matched, rejected, trajectories = [], [], {}
    for target in sorted(observations, key=lambda o: (o.observed_at, o.station_id, o.id)):
        choices = []
        for event in sorted(events, key=lambda e: (e.forecast_start, e.capture_id)):
            if target.observed_at <= event.forecast_start:
                continue  # These are background or earlier unrelated readings.
            try:
                if target.period_start <= event.forecast_start:
                    raise ValueError("TARGET_PRECEDES_FORECAST: observation interval overlaps prediction")
                hours = [(t - event.forecast_start).total_seconds() / 3600
                         for t in (target.period_start, target.observed_at)]
                if not all(h.is_integer() for h in hours) or not 1 <= hours[0] <= hours[1] <= 48:
                    raise ValueError("UNSUPPORTED_OBSERVATION_INTERVAL: require covered hourly frame boundaries, 1..48 h")
                lo, hi = map(int, hours)
                field = WindField(event.wind, PlumeParams())
                if target.observed_at > field.last_time:
                    raise ValueError("MISSING_WIND_COVERAGE")
                wind_at_station = field.interpolate(target.lat, target.lon, target.observed_at)
                sources, ages = [], []
                for source in event.sources:
                    key = (event.capture_id, source.id, hi)
                    if key not in trajectories:
                        trajectories[key] = simulate_source(source, field, event.forecast_start, hi, PlumeParams())
                    projection, frames = trajectories[key]
                    travel = plausible_transport(source, projection, frames, target, lo, hi, config)
                    if travel:
                        sources.append(source.id)
                        ages.extend(travel)
                if not sources:
                    raise ValueError("NOT_DOWNWIND: no baseline puff with plausible direction, distance and age")
                background = estimate_background(target, observations, event, config, estimator)
                choices.append(Match(event, target, background, tuple(sorted(sources)), lo, hi,
                                     tuple(sorted(set(ages))), wind_at_station))
            except (ValueError, OverflowError) as exc:
                rejected.append({"observation_id": target.id, "capture_id": event.capture_id, "reason": str(exc)})
        groups = {m.event.event_id for m in choices}
        if len(groups) > 1:
            rejected.append({"observation_id": target.id, "reason": "AMBIGUOUS_EVENT: multiple independent events"})
        elif choices:
            # Repeated captures of one event: latest eligible input, without consulting PM2.5.
            matched.append(sorted(choices, key=lambda m: (m.event.forecast_start, m.event.capture_id))[-1])
    target_ids = {m.observation.id for m in matched}
    clean = []
    for m in matched:
        if target_ids.intersection(m.background.observation_ids):
            rejected.append({"observation_id": m.observation.id, "reason": "BACKGROUND_TARGET_OVERLAP"})
        else:
            clean.append(m)
    return clean, rejected


def check_history_population(events: list[Event], observations: list[Observation],
                             config: EligibilityConfig, calibration_time: datetime) -> None:
    """Structural mathematics, independent of assertions about captured provenance."""
    if len({e.capture_id for e in events}) != len(events):
        raise ValueError("DUPLICATE_CAPTURE_ID")
    if len({o.id for o in observations}) != len(observations) or len({(o.station_id, o.observed_at) for o in observations}) != len(observations):
        raise ValueError("DUPLICATE_OBSERVATION: repeated publication copies are not independent evidence")
    for i, event in enumerate(events):
        for other in events[i + 1:]:
            if event.event_id != other.event_id and event.fire_keys & other.fire_keys:
                raise ValueError("SAME_FIRE_DIFFERENT_EVENTS: repeated captures must share physical event ID")
    if len({e.event_id for e in events}) < config.min_events:
        raise ValueError("INSUFFICIENT_EVENTS: protected chronological holdout NOT_AVAILABLE")
    stations: dict[str, list[Observation]] = {}
    for o in observations:
        stations.setdefault(o.station_id, []).append(o)
        if o.available_at > calibration_time:
            raise ValueError("Calibration timestamp precedes an input observation's availability")
    for readings in stations.values():
        ordered = sorted(readings, key=lambda o: (o.period_start, o.observed_at))
        if any(a.observed_at > b.period_start for a, b in zip(ordered, ordered[1:])):
            raise ValueError("OVERLAPPING_MEASUREMENTS: background/target intervals are not independent")
    if sum(len(rows) >= config.min_background_observations + 1 for rows in stations.values()) < config.min_stations:
        raise ValueError("MISSING_BACKGROUND_HISTORY: one-observation-per-station history cannot construct independent targets")


def chronological_split(matches: list[Match], config: EligibilityConfig) -> tuple[list[Match], list[Match]]:
    groups: dict[str, list[Match]] = {}
    for m in matches:
        groups.setdefault(m.event.event_id, []).append(m)
    if len(groups) < config.min_events:
        raise ValueError("INSUFFICIENT_EVENTS: chronological holdout NOT_AVAILABLE")
    ordered = sorted(groups, key=lambda key: (min(m.event.source_event_time for m in groups[key]), key))
    held_count = min(len(groups) - 2, max(1, math.ceil(len(groups) * config.holdout_fraction)))
    held_ids = set(ordered[-held_count:])
    train = [m for m in matches if m.event.event_id not in held_ids]
    holdout = [m for m in matches if m.event.event_id in held_ids]
    if max(m.observation.observed_at for m in train) >= min(m.event.forecast_start for m in holdout):
        raise ValueError("OVERLAPPING_EVENT_PERIODS: chronological protection unavailable")
    train_used = {i for m in train for i in (m.observation.id, *m.background.observation_ids)}
    held_used = {i for m in holdout for i in (m.observation.id, *m.background.observation_ids)}
    if train_used & held_used:
        raise ValueError("SPLIT_OBSERVATION_OVERLAP: backgrounds and targets must be disjoint across splits")
    if len(train) < config.min_training_observations or len(holdout) < config.min_holdout_observations:
        raise ValueError("INSUFFICIENT_OBSERVATIONS for fitting/protected evaluation")
    if len({m.observation.station_id for m in train}) < config.min_stations or len({m.observation.station_id for m in holdout}) < config.min_stations:
        raise ValueError("INSUFFICIENT_STATIONS in fitting/protected evaluation")
    return train, holdout
