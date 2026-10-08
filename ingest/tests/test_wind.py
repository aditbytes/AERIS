"""
ingest/tests/test_wind.py
--------------------------
Tests for ingest/weather/fetch_wind.py.

Wind-vector conversion tests are pure mathematical — verified against the
documented formula:
  u = -speed * sin(dir_rad)
  v = -speed * cos(dir_rad)

Grid-building tests use small bboxes and check output properties.
Open-Meteo response parsing tests use minimal format-correct response stubs
(not real weather observations).

Tests:
  - North wind → v < 0 (required by project spec)
  - East wind → u < 0 (blows FROM east, goes west)
  - South wind → v > 0
  - West wind → u > 0
  - Zero wind → u = v = 0
  - 45° (NE) wind — correct quadrant
  - Grid building: correct number of points, bbox coverage
  - Open-Meteo response parsing: timestamps, missing values skipped
  - Output schema validation
  - Upstream error propagation
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from ingest.weather.fetch_wind import (
    _parse_point_hourly,
    build_grid,
    fetch_wind,
    wind_components,
)


@pytest.mark.parametrize("api_time,expected", [
    ("2026-10-07T00:00", "2026-10-07T00:00:00Z"),
    ("2026-10-07T00:00:00Z", "2026-10-07T00:00:00Z"),
    ("2026-10-07T05:30:00+05:30", "2026-10-07T00:00:00Z"),
])
def test_wind_parser_utc_independent_of_host_timezone(monkeypatch, api_time, expected):
    """Mathematical time conversion, zero vectors; not atmospheric observations."""
    import ingest.weather.fetch_wind as fetch_wind_module

    class NonUtcHostDatetime(datetime):
        def astimezone(self, tz=None):
            # Reproduce naive astimezone interpretation on a host at UTC+05:30,
            # regardless of the platform where the regression test runs.
            if self.tzinfo is None:
                self = self.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
            return super().astimezone(tz)

    monkeypatch.setattr(fetch_wind_module, "datetime", NonUtcHostDatetime)
    result = _parse_point_hourly(0, 0, {"time": [api_time], "wind_speed_10m": [0],
                                      "wind_direction_10m": [0], "boundary_layer_height": [0]})
    assert result["hours"][0]["t"] == expected


# ---------------------------------------------------------------------------
# Wind-vector conversion — pure mathematical tests
# ---------------------------------------------------------------------------

class TestWindComponents:
    """
    These tests verify the meteorological convention:
      u = -speed * sin(dir_rad)  (eastward)
      v = -speed * cos(dir_rad)  (northward)

    where dir_from_deg is the compass direction the wind comes FROM.
    """

    def test_north_wind_v_negative(self):
        """A north wind (from north = 0°) must give v < 0 (blowing southward)."""
        u, v = wind_components(10.0, 0.0)
        assert math.isclose(u, 0.0, abs_tol=1e-9), f"u={u} should be 0"
        assert v == pytest.approx(-10.0)

    def test_south_wind_v_positive(self):
        """A south wind (from south = 180°) blows northward → v > 0."""
        u, v = wind_components(10.0, 180.0)
        assert math.isclose(u, 0.0, abs_tol=1e-9), f"u={u} should be 0"
        assert v == pytest.approx(10.0)

    def test_east_wind_u_negative(self):
        """An east wind (from east = 90°) blows westward → u < 0."""
        u, v = wind_components(10.0, 90.0)
        assert u == pytest.approx(-10.0)
        assert math.isclose(v, 0.0, abs_tol=1e-9), f"v={v} should be 0"

    def test_west_wind_u_positive(self):
        """A west wind (from west = 270°) blows eastward → u > 0."""
        u, v = wind_components(10.0, 270.0)
        assert u == pytest.approx(10.0)
        assert math.isclose(v, 0.0, abs_tol=1e-9), f"v={v} should be 0"

    def test_zero_speed(self):
        """Zero-speed wind gives zero components regardless of direction."""
        u, v = wind_components(0.0, 45.0)
        assert u == 0.0
        assert v == 0.0

    def test_northeast_wind_quadrant(self):
        """NE wind (from 45°) → u < 0 and v < 0 (blowing SW)."""
        u, v = wind_components(10.0, 45.0)
        assert u < 0
        assert v < 0

    def test_southwest_wind_quadrant(self):
        """SW wind (from 225°) → u > 0 and v > 0 (blowing NE)."""
        u, v = wind_components(10.0, 225.0)
        assert u > 0
        assert v > 0

    def test_speed_preserved(self):
        """sqrt(u² + v²) must equal speed for any direction."""
        for speed in [0.0, 1.0, 5.5, 10.0]:
            for deg in [0, 45, 90, 135, 180, 225, 270, 315]:
                u, v = wind_components(speed, float(deg))
                recovered = math.sqrt(u ** 2 + v ** 2)
                assert recovered == pytest.approx(speed, abs=1e-9), (
                    f"Speed not preserved at dir={deg}°: got {recovered}"
                )


# ---------------------------------------------------------------------------
# Grid building
# ---------------------------------------------------------------------------

class TestBuildGrid:
    def test_small_bbox_count(self):
        """2° × 2° bbox at 1° step → 3×3 = 9 points."""
        grid = build_grid([0.0, 0.0, 2.0, 2.0], step_deg=1.0)
        assert len(grid) == 9

    def test_bbox_coverage(self):
        """All points must be within [west, east] × [south, north]."""
        bbox = [73.5, 28.0, 77.5, 32.5]
        grid = build_grid(bbox, step_deg=0.5)
        w, s, e, n = bbox
        for lat, lon in grid:
            assert s - 1e-6 <= lat <= n + 1e-6
            assert w - 1e-6 <= lon <= e + 1e-6

    def test_default_step(self):
        """Default 0.25° step on project bbox should give > 200 points."""
        grid = build_grid([73.5, 28.0, 77.5, 32.5], step_deg=0.25)
        assert len(grid) > 200

    def test_single_point_bbox(self):
        grid = build_grid([76.0, 28.5, 76.0, 28.5], step_deg=0.25)
        assert len(grid) == 1
        assert grid[0] == (28.5, 76.0)


# ---------------------------------------------------------------------------
# Open-Meteo response parsing
# ---------------------------------------------------------------------------

# Minimal Open-Meteo response stub (two hours, one grid point)
# Format mirrors the documented API schema.
_OM_SINGLE_POINT = {
    "latitude": 28.0,
    "longitude": 73.5,
    "hourly": {
        "time": ["2026-10-07T00:00", "2026-10-07T01:00"],
        "wind_speed_10m": [5.0, 3.0],
        "wind_direction_10m": [180.0, 90.0],
        "boundary_layer_height": [500.0, None],
    },
}


class TestFetchWind:
    def test_single_point_parsed(self):
        with patch("ingest.weather.fetch_wind._fetch_batch", return_value=[_OM_SINGLE_POINT]):
            result = fetch_wind(
                bbox=[73.5, 28.0, 73.5, 28.0],  # single point
                step_deg=0.25,
                forecast_days=2,
            )
        assert len(result["points"]) == 1
        point = result["points"][0]
        assert point["lat"] == pytest.approx(28.0)
        assert point["lon"] == pytest.approx(73.5)
        # First hour: south wind (180°) → v > 0
        h0 = point["hours"][0]
        assert h0["v_ms"] > 0
        assert h0["pblh_m"] == pytest.approx(500.0)

    def test_missing_hour_skipped(self):
        """Hours with None speed/direction should be skipped, not raise."""
        stub = {
            "latitude": 28.0,
            "longitude": 73.5,
            "hourly": {
                "time": ["2026-10-07T00:00"],
                "wind_speed_10m": [None],
                "wind_direction_10m": [None],
                "boundary_layer_height": [None],
            },
        }
        with patch("ingest.weather.fetch_wind._fetch_batch", return_value=[stub]):
            result = fetch_wind(bbox=[73.5, 28.0, 73.5, 28.0], step_deg=0.25)
        assert result["points"][0]["hours"] == []

    def test_upstream_error_raises(self):
        from ingest.common.http import UpstreamError
        with patch("ingest.weather.fetch_wind._fetch_batch", side_effect=UpstreamError("Open-Meteo", 503, "err")):
            with pytest.raises(UpstreamError):
                fetch_wind(bbox=[73.5, 28.0, 73.5, 28.0], step_deg=0.25)

    def test_output_schema_fields(self):
        with patch("ingest.weather.fetch_wind._fetch_batch", return_value=[_OM_SINGLE_POINT]):
            result = fetch_wind(bbox=[73.5, 28.0, 73.5, 28.0], step_deg=0.25)
        assert "generated_at" in result
        assert "source" in result
        assert "points" in result
        h = result["points"][0]["hours"][0]
        for field in ("t", "u_ms", "v_ms", "speed_ms", "dir_from_deg"):
            assert field in h

    def test_uv_convention_applied(self):
        """u = -speed*sin(dir), v = -speed*cos(dir) for each hour."""
        with patch("ingest.weather.fetch_wind._fetch_batch", return_value=[_OM_SINGLE_POINT]):
            result = fetch_wind(bbox=[73.5, 28.0, 73.5, 28.0], step_deg=0.25)
        hours = result["points"][0]["hours"]
        for h in hours:
            speed = h["speed_ms"]
            dir_rad = math.radians(h["dir_from_deg"])
            expected_u = -speed * math.sin(dir_rad)
            expected_v = -speed * math.cos(dir_rad)
            assert h["u_ms"] == pytest.approx(expected_u, abs=1e-3)
            assert h["v_ms"] == pytest.approx(expected_v, abs=1e-3)
