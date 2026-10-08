"""Strict, ordered features for a steady-weather, single-source point surrogate."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from models.plume.advect import number

FEATURE_NAMES = ["wind_speed_ms", "sin_wind_toward", "cos_wind_toward",
                 "downwind_m", "crosswind_m", "forecast_hours", "pblh_m",
                 "source_emission_strength", "source_radius_m"]
FEATURE_UNITS = ["m/s", "1", "1", "m", "m", "hour", "m", "1", "m"]
FEATURE_RANGES = [[0, 6], [-1, 1], [-1, 1], [-100000, 350000],
                  [-100000, 100000], [1, 12], [50, 3000], [0.05, 1], [0, 15000]]
TARGET_NAME = "pm25_delta_ugm3"
DATA_TYPE = "BASELINE_SIMULATED"
SCOPE = "STEADY_WEATHER_SINGLE_SOURCE_HOURLY_EMISSIONS_POINT"
CASE_NAMES = {"u_ms", "v_ms", "forecast_hours", "pblh_m",
              "source_emission_strength", "source_radius_m"}


def validate_features(instances: Any, feature_names: Any) -> np.ndarray:
    if feature_names != FEATURE_NAMES:
        raise ValueError("feature_names must match the recorded feature order exactly")
    if not isinstance(instances, list) or not 1 <= len(instances) <= 100000:
        raise ValueError("instances must contain 1..100000 feature rows")
    rows = []
    for row in instances:
        if not isinstance(row, list) or len(row) != len(FEATURE_NAMES):
            raise ValueError("Invalid feature count")
        values = [number(value, name) for value, name in zip(row, FEATURE_NAMES)]
        for value, name, (low, high) in zip(values, FEATURE_NAMES, FEATURE_RANGES):
            if not low <= value <= high:
                raise ValueError(f"{name} outside supported range [{low}, {high}]")
        speed, sine, cosine = values[:3]
        if speed == 0:
            if sine != 0 or cosine != 0:
                raise ValueError("Calm wind requires zero direction features")
        elif not math.isclose(sine * sine + cosine * cosine, 1, abs_tol=1e-8):
            raise ValueError("Wind direction features must have unit length")
        if not values[5].is_integer():
            raise ValueError("forecast_hours must be a whole hour")
        rows.append(values)
    return np.asarray(rows, dtype=float)


def construct_features(case: dict, east_m: float, north_m: float) -> list[float]:
    if not isinstance(case, dict) or set(case) != CASE_NAMES:
        raise ValueError("Steady-weather case requires exactly the documented inputs")
    u, v = number(case["u_ms"], "u_ms"), number(case["v_ms"], "v_ms")
    east, north = number(east_m, "east_m"), number(north_m, "north_m")
    speed = math.hypot(u, v)
    sine, cosine = (u / speed, v / speed) if speed else (0.0, 0.0)
    sx, sy = (sine, cosine) if speed else (0.0, 1.0)
    row = [speed, sine, cosine, east * sx + north * sy,
           east * sy - north * sx, case["forecast_hours"], case["pblh_m"],
           case["source_emission_strength"], case["source_radius_m"]]
    return validate_features([row], FEATURE_NAMES)[0].tolist()
