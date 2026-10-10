"""Boundary probes use labelled test inputs, never replace captured data."""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from ingest.aqi import fetch_aqi as aqi
from ingest.population import build_population as population


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf"), -1, True])
def test_aqi_formula_rejects_invalid_boundary_input(value):
    with pytest.raises(ValueError):
        aqi.compute_pm25_aqi(value)


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "bad", -1])
def test_cpcb_invalid_readings_are_unavailable_not_severe(monkeypatch, value):
    response = MagicMock()
    response.json.return_value = {"records": [{"latitude": 28.5, "longitude": 77, "station": "BOUNDARY_TEST", "pm25": value, "aqi": value}]}
    monkeypatch.setattr(aqi, "get", lambda *a, **kw: response)
    station = aqi.fetch_cpcb([76, 28, 78, 29], "TEST_KEY")[0]
    assert station["pm25"] is None and station["aqi"] is None


def test_cpcb_valid_zeros_and_ambiguous_timestamp_are_preserved(monkeypatch):
    response = MagicMock()
    response.json.return_value = {"records": [{"latitude": 0, "longitude": 0, "station": "ZERO_TEST", "pm2_5": 0, "aqi": 0, "last_update": "01-10-2026 12:00:00", "pollutant_min": 99}]}
    monkeypatch.setattr(aqi, "get", lambda *a, **kw: response)
    station = aqi.fetch_cpcb([-1, -1, 1, 1], "TEST_KEY")[0]
    assert station["lat"] == station["lon"] == station["pm25"] == station["aqi"] == 0
    assert station["observed_at"] is None
    assert station["source_timestamp"] == "01-10-2026 12:00:00"
    assert station["aqi_method"] == "PROVIDER_REPORTED"


def test_total_aqi_unavailability_is_explicit(monkeypatch):
    monkeypatch.setattr(aqi, "fetch_openaq", lambda *a: [])
    monkeypatch.setattr(aqi, "fetch_cpcb", lambda *a: [])
    result = aqi.fetch_aqi()
    assert result["data_status"] == "UNAVAILABLE_OR_EMPTY"
    assert result["coverage_complete"] is None


@pytest.mark.parametrize("lat", [None, float("nan"), float("inf"), 91, "invalid"])
def test_openaq_invalid_coordinates_are_excluded_before_sensor_fetch(monkeypatch, lat):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    monkeypatch.setattr(aqi, "_fetch_openaq_locations", lambda *args, **kw: [{"id": 1, "coordinates": {"latitude": lat, "longitude": 77}, "datetimeLast": {"utc": now}, "sensors": [{"id": 2, "parameter": {"name": "pm25"}}]}])
    def forbidden(*args, **kwargs):
        raise AssertionError("Invalid coordinates must not trigger a measurement request")
    monkeypatch.setattr(aqi, "_fetch_location_latest", forbidden)
    assert aqi.fetch_openaq([76, 28, 78, 29], "TEST_KEY") == []


def test_aqi_all_null_readings_cannot_refresh_a_snapshot(tmp_path, monkeypatch):
    from ingest.aqi import handler

    path = tmp_path / "aqi.json"
    original = (Path(__file__).resolve().parents[2] / "data/live/aqi.json").read_bytes()
    path.write_bytes(original)
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(handler, "fetch_aqi", lambda **kw: {"generated_at": "2026-10-10T00:00:00Z", "stations": [{"pm25": None, "pm10": None, "aqi": None}]})
    monkeypatch.setattr(handler.secrets, "get_secret", lambda key: "TEST_KEY")
    with pytest.raises(RuntimeError, match="keeping existing data"):
        handler.lambda_handler({}, None)
    assert path.read_bytes() == original


def test_interrupted_worldpop_download_preserves_cached_raster(tmp_path, monkeypatch):
    cached = tmp_path / "worldpop.tif"
    cached.write_bytes(b"EXISTING_CACHE_PRESERVATION_TEST")
    response = MagicMock()
    def chunks(**kwargs):
        yield b"PARTIAL_DOWNLOAD_TEST"
        raise OSError("interrupted stream")
    response.iter_content.side_effect = chunks
    monkeypatch.setattr(population, "http_get", lambda *a, **kw: response)
    with pytest.raises(OSError):
        population._download_worldpop(cached)
    assert cached.read_bytes() == b"EXISTING_CACHE_PRESERVATION_TEST"
    assert list(tmp_path.iterdir()) == [cached]
    response.close.assert_called_once()


def test_empty_population_cli_preserves_previous_snapshot(tmp_path, monkeypatch):
    from ingest.population import handler

    path = tmp_path / "population.json"
    raw = (Path(__file__).resolve().parents[2] / "data/live/population.json").read_bytes()
    path.write_bytes(raw)
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.setattr(handler, "build_population", lambda **kw: {"generated_at": "2026-10-10T00:00:00Z", "cells": []})
    monkeypatch.setattr("sys.argv", ["population-test"])
    with pytest.raises(SystemExit) as error:
        handler._cli()
    assert error.value.code == 1
    assert path.read_bytes() == raw
