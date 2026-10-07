# AERIS — Data Contracts

> ⚠️ **No demo data.** AERIS uses **only real data** from live sources. Do not create, hand-write, mock or hard-code sample, demo, placeholder or fabricated data — not in code, not in the UI, not in tests, and not as a "fallback". If a live source is unavailable, return an error and show an error state. The only offline files allowed are **real snapshots** that the fetchers captured from live sources into `data/live/` (each stamped with its source and fetch time). Tests may use small captured real API responses, labelled as such.

The shared file formats every member codes against. Change one only via PR and tell the downstream owner. All times are ISO-8601 UTC. Coordinates are WGS84 (`lat`, `lon`). Real snapshots live in `data/live/`. The JSON blocks below only illustrate each format; their values are placeholders and are **never** to be used as data.

```
fires.json ─┐
aqi.json   ─┼─► sources.json ─► corridor.geojson ─┐
wind.json  ─┘                                      ├─► ranked_sites.json ─► actions.json ─► UI
sites.geojson, population.json ────────────────────┘
```

## `fires.json` (Meenal)
```json
{
  "generated_at": "2026-10-10T06:00:00Z",
  "source": "NASA FIRMS VIIRS_SNPP_NRT",
  "bbox": [73.5, 28.0, 77.5, 32.5],
  "fires": [
    {"id": "f_001", "lat": 30.91, "lon": 75.85, "acq_time": "2026-10-10T05:42:00Z",
     "frp_mw": 18.4, "brightness_k": 351.2, "confidence": "high"}
  ]
}
```

## `aqi.json` (Meenal)
```json
{
  "generated_at": "2026-10-10T06:00:00Z",
  "stations": [
    {"id": "DL_ANAND_VIHAR", "name": "Anand Vihar", "lat": 28.647, "lon": 77.316,
     "pm25": 182.0, "pm10": 310.0, "aqi": 342, "observed_at": "2026-10-10T05:30:00Z"}
  ]
}
```

## `wind.json` (Meenal)
Point forecasts on a coarse grid (about 0.25°), hourly for 0–48 h.
```json
{
  "generated_at": "2026-10-10T06:00:00Z",
  "source": "Open-Meteo GFS",
  "points": [
    {"lat": 30.75, "lon": 75.75,
     "hours": [{"t": "2026-10-10T06:00:00Z", "u_ms": 3.1, "v_ms": 2.4,
                "speed_ms": 3.9, "dir_from_deg": 232, "pblh_m": 420}]}
  ]
}
```
`u_ms` is eastward, `v_ms` northward. `dir_from_deg` is the compass direction the wind blows **from**.

## `sites.geojson` (Meenal)
GeoJSON `FeatureCollection` of `Point`s.
```json
{"type": "Feature", "geometry": {"type": "Point", "coordinates": [77.21, 28.61]},
 "properties": {"id": "s_0001", "name": "Govt Girls Sr Sec School", "type": "school",
                "occupancy": 1200, "source": "OSM"}}
```
`type` is `school` or `hospital`. `occupancy` is students or beds (null if unknown).

## `population.json` (Meenal)
```json
{"cell_km": 1.0, "cells": [{"lat": 28.61, "lon": 77.21, "pop": 18400}]}
```

## `sources.json` (Pritam)
```json
{
  "generated_at": "2026-10-10T06:05:00Z",
  "sources": [
    {"id": "src_001", "type": "stubble_burning", "lat": 30.9, "lon": 75.8,
     "fire_count": 42, "total_frp_mw": 610.3, "radius_km": 12.0,
     "first_seen": "2026-10-10T03:10:00Z", "last_seen": "2026-10-10T05:42:00Z",
     "confidence": 0.91, "emission_strength": 0.74}
  ]
}
```
`emission_strength` is normalised 0–1.

## `corridor.geojson` (Pritam)
`FeatureCollection` of `Polygon`s, one per source and time band, plus one `LineString` centreline per source.
```json
{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": ["..."]},
 "properties": {"kind": "band", "source_id": "src_001", "hour_from": 0, "hour_to": 2,
                "risk": 0.82, "pm25_delta_ugm3": 95.0}}
{"type": "Feature", "geometry": {"type": "LineString", "coordinates": ["..."]},
 "properties": {"kind": "centerline", "source_id": "src_001",
                "points_eta_hours": [0, 1, 2, 3]}}
```
`risk` is 0–1 and `pm25_delta_ugm3` is the forecast PM2.5 increase from the source's smoke at that band.

## `ranked_sites.json` (Meenal)
```json
{
  "generated_at": "2026-10-10T06:10:00Z",
  "exposed_population": {"estimate": 1200000, "low": 900000, "high": 1500000},
  "sites": [
    {"rank": 1, "site_id": "s_0042", "name": "AIIMS Delhi", "type": "hospital",
     "lat": 28.567, "lon": 77.21, "occupancy": 2200,
     "eta_hours": 1.8, "pm25_delta_ugm3": 110.0, "risk_score": 0.93,
     "source_id": "src_001"}
  ]
}
```

## `actions.json` (Saba)
```json
{
  "generated_at": "2026-10-10T06:12:00Z",
  "summary": "Smoke from Punjab will reach Delhi in about 2 hours...",
  "actions": [
    {"priority": 1, "site_id": "s_0042", "who": "Hospital administrator",
     "action": "Switch to filtered air in ICU wards; postpone elective outdoor activity",
     "reason": "ETA 1.8 h, forecast PM2.5 +110 µg/m³, 2,200 beds",
     "deadline_hours": 1.0}
  ],
  "authority_actions": [
    {"who": "DPCC / CAQM", "action": "Issue GRAP-aligned advisory for north-west Delhi",
     "reason": "1.2M people in corridor"}
  ]
}
```
