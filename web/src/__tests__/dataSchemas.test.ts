/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ActionsFileSchema, AqiFileSchema, AqiStationSchema, CorridorGeoJSONSchema,
  RankedSitesFileSchema, SourcesFileSchema, TimestampSchema, WindFileSchema,
} from '@/types/schemas'

const time = '2026-10-07T18:00:00Z'
const station = { id: 'test-observation', name: 'Mathematical test', lat: 28, lon: 77, pm25: 0, aqi: 0, observed_at: time, source: 'MATHEMATICAL_TEST' }
const band = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[77, 28], [78, 28], [78, 29], [77, 28]]] },
  properties: { kind: 'band', source_id: 'test-source', hour_from: 0, hour_to: 2, risk: 0, pm25_delta_ugm3: 0 },
}

describe('real data contracts', () => {
  it.each([
    ['sources.json', SourcesFileSchema], ['corridor.geojson', CorridorGeoJSONSchema],
    ['ranked_sites.json', RankedSitesFileSchema], ['actions.json', ActionsFileSchema],
    ['aqi.json', AqiFileSchema], ['wind.json', WindFileSchema],
  ])('accepts the preserved real publication %s', (file, schema) => {
    const snapshot = JSON.parse(readFileSync(`public/data/${file}`, 'utf8'))
    expect(() => schema.parse(snapshot)).not.toThrow()
  })

  it('preserves corridor analysis and input capture times', () => {
    const parsed = CorridorGeoJSONSchema.parse({ type: 'FeatureCollection', generated_at: time, forecast_start: time, wind_generated_at: time, features: [band] })
    expect(parsed.forecast_start).toBe(time)
    expect(parsed.wind_generated_at).toBe(time)
    expect(parsed.generated_at).toBe(time)
  })
  it('accepts zero measurements and missing readings without fabricating values', () => {
    expect(AqiStationSchema.parse(station).pm25).toBe(0)
    const missing = AqiStationSchema.parse({ ...station, pm25: null, aqi: null, observed_at: null })
    expect(missing.pm25).toBeNull()
    expect(missing.observed_at).toBeNull()
    expect(AqiFileSchema.parse({ generated_at: time, stations: [] }).stations).toEqual([])
  })
  it.each([{ lat: 91 }, { lon: -181 }, { lat: NaN }, { lon: Infinity }, { pm25: -1 }, { pm25: Infinity }, { observed_at: '2026-10-07T18:00:00' }])('rejects unsafe station fields %j', invalid => {
    expect(AqiStationSchema.safeParse({ ...station, ...invalid }).success).toBe(false)
  })
  it.each(['not-a-date', '2026-02-30T12:00:00Z', '2026-10-07', '2026-10-07T18:00:00'])('rejects invalid or timezone-free time %s', invalid => {
    expect(TimestampSchema.safeParse(invalid).success).toBe(false)
  })
  it('rejects missing, unclosed, and out-of-range geometry and mismatched feature kind', () => {
    for (const geometry of [null, { type: 'Polygon', coordinates: [] }, { type: 'Polygon', coordinates: [[[77, 28], [78, 28], [78, 29], [77, 29]]] }, { type: 'Polygon', coordinates: [[[181, 28], [78, 28], [78, 29], [181, 28]]] }, { type: 'LineString', coordinates: [[77, 28], [78, 29]] }]) {
      expect(CorridorGeoJSONSchema.safeParse({ type: 'FeatureCollection', generated_at: time, features: [{ ...band, geometry }] }).success).toBe(false)
    }
  })
  it('rejects centreline frame counts that do not match coordinates', () => {
    expect(CorridorGeoJSONSchema.safeParse({ type: 'FeatureCollection', generated_at: time, features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[77, 28], [78, 29]] }, properties: { kind: 'centerline', source_id: 'test-source', points_eta_hours: [0] } }] }).success).toBe(false)
  })
  it('validates wind fields while preserving unavailable PBLH', () => {
    const wind = { generated_at: time, source: 'MATHEMATICAL_TEST', points: [{ lat: 28, lon: 77, hours: [{ t: time, u_ms: 0, v_ms: 0, speed_ms: 0, dir_from_deg: 0, pblh_m: null }] }] }
    expect(WindFileSchema.parse(wind).points[0].hours[0].pblh_m).toBeNull()
    expect(WindFileSchema.safeParse({ ...wind, points: [{ ...wind.points[0], hours: [{ ...wind.points[0].hours[0], speed_ms: -1 }] }] }).success).toBe(false)
    expect(WindFileSchema.safeParse({ ...wind, points: [{ ...wind.points[0], hours: [wind.points[0].hours[0], wind.points[0].hours[0]] }] }).success).toBe(false)
  })
})
