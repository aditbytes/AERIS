"""Invalid provider rows are skipped; finite zero measurements remain valid."""
import pytest
from ingest.firms.fetch_fires import _parse_csv
from ingest.weather.fetch_wind import _parse_point_hourly, fetch_wind
from ingest.common.http import UpstreamError


@pytest.mark.parametrize("lat,frp,time", [("Infinity", "1", "1200"), ("91", "1", "1200"), ("29", "-1", "1200"), ("29", "Infinity", "1200"), ("29", "1", ""), ("29", "1", "2560")])
def test_firms_bad_row_does_not_abort_valid_rows_or_fabricate_midnight(lat, frp, time):
    header = "latitude,longitude,frp,bright_ti4,acq_date,acq_time,confidence\n"
    bad = f"{lat},77,{frp},300,2026-10-10,{time},n\n"
    good = "29,77,0,300,2026-10-10,1200,n\n"
    rows = _parse_csv(header + bad + good, "BOUNDARY_TEST")
    assert len(rows) == 1 and rows[0]["frp_mw"] == 0
    assert rows[0]["acq_time"] == "2026-10-10T12:00:00Z"


@pytest.mark.parametrize("confidence", ["x", "", "unknown"])
def test_firms_unknown_confidence_is_not_promoted_to_nominal(confidence):
    body = f"latitude,longitude,frp,bright_ti4,acq_date,acq_time,confidence\n29,77,1,300,2026-10-10,1200,{confidence}\n"
    assert _parse_csv(body, "BOUNDARY_TEST") == []


@pytest.mark.parametrize("speed,direction,time", [(float("nan"), 0, "2026-10-10T12:00"), (float("inf"), 0, "2026-10-10T12:00"), (-1, 0, "2026-10-10T12:00"), (1, 361, "2026-10-10T12:00"), (1, 0, "invalid")])
def test_wind_invalid_sample_is_not_emitted(speed, direction, time):
    hourly = {"time": [time, "2026-10-10T13:00"], "wind_speed_10m": [speed, 0], "wind_direction_10m": [direction, 0], "boundary_layer_height": [800, 800]}
    point = _parse_point_hourly(29, 77, hourly)
    assert len(point["hours"]) == 1
    assert point["hours"][0]["speed_ms"] == 0
    assert point["hours"][0]["t"] == "2026-10-10T13:00:00Z"


def test_wind_missing_frames_are_incomplete_even_when_batch_succeeds(monkeypatch):
    from ingest.weather import fetch_wind as module
    monkeypatch.setattr(module, "build_grid", lambda *a: [(29, 77)])
    monkeypatch.setattr(module, "_fetch_batch", lambda *a: [{"hourly": {"time": ["2026-10-10T12:00", "2026-10-10T13:00"], "wind_speed_10m": [0, None], "wind_direction_10m": [0, 0], "boundary_layer_height": [800, 800]}}])
    result = fetch_wind()
    assert result["coverage_complete"] is True
    assert result["usable_hourly_coverage_complete"] is False
    assert result["points_incomplete"] == 1


def test_wind_all_empty_points_block_publication(monkeypatch):
    from ingest.weather import fetch_wind as module
    from ingest.weather import handler
    monkeypatch.setattr(module, "build_grid", lambda *a: [(29, 77)])
    monkeypatch.setattr(module, "_fetch_batch", lambda *a: [{"hourly": {}}])
    result = fetch_wind()
    assert result["usable_hourly_coverage_complete"] is False
    monkeypatch.setattr(handler, "fetch_wind", lambda **kw: result)
    with pytest.raises(RuntimeError, match="keeping existing data"):
        handler.lambda_handler({}, None)
