/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AqiFileSchema, CorridorGeoJSONSchema, RankedSitesFileSchema, type AqiFile } from '../../types/schemas'
import { buildObservationHeatmap, cellsInBounds, observationBounds, pm25Color, validCoordinate } from './heatmap'
import HeatmapControls from './HeatmapControls'
import SvgFallbackMap, { projectPosition } from './SvgFallbackMap'
import { etaMilestones, corridorAtHorizon } from './mapData'

const now = Date.parse('2026-10-09T12:00:00Z')
const station = { id: 'test_station', name: 'Isolated mathematical test station', lat: 28.61, lon: 77.21, pm25: 0, observed_at: '2026-10-09T11:30:00Z', source: 'test-only' }
function feed(stations: unknown[]) { return { generated_at: '2026-10-09T12:00:00Z', stations } as AqiFile }

describe('observed station heatmap', () => {
  it('preserves zero and longitude/latitude order with no invented samples', () => {
    const result = buildObservationHeatmap(feed([station]), now)
    expect(result.samples).toBe(1)
    expect(result.geojson.features[0].properties.mean).toBe(0)
    expect(result.geojson.features[0].geometry.coordinates[0]).toEqual([[77.2, 28.6], [77.3, 28.6], [77.3, 28.7], [77.2, 28.7], [77.2, 28.6]])
    expect(result.staleCount).toBe(0)
  })
  it('aggregates only colocated occupied cells and retains mixed timestamps', () => {
    const result = buildObservationHeatmap(feed([station, { ...station, id: 'b', pm25: 20, observed_at: '2026-10-08T11:30:00Z' }, { ...station, id: 'c', lon: 78.21, pm25: 90 }]), now)
    expect(result.geojson.features).toHaveLength(2)
    expect(observationBounds(result)).toEqual([77.2, 28.6, 78.3, 28.7])
    expect(observationBounds(buildObservationHeatmap(null, now))).toBeNull()
    expect(result.geojson.features[0].properties).toMatchObject({ mean: 10, count: 2, staleCount: 1, oldest: '2026-10-08T11:30:00.000Z', newest: '2026-10-09T11:30:00.000Z' })
    expect(result.sources).toEqual(['test-only'])
  })
  it.each([{ pm25: null }, { pm25: -1 }, { pm25: NaN }, { lat: 91 }, { lon: Infinity }, { observed_at: null }, { observed_at: '2026-09-31T10:00:00Z' }, { observed_at: '2026-10-09T10:00:00' }, { observed_at: '2026-10-10T10:00:00Z' }, { source: '' }])('rejects unsupported readings: %j', fields => {
    const result = buildObservationHeatmap(feed([{ ...station, ...fields }]), now)
    expect(result.samples).toBe(0)
    expect(result.rejected).toBe(1)
    expect(result.geojson.features).toEqual([])
  })
  it('does not double count repeated station records', () => {
    const result = buildObservationHeatmap(feed([station, station]), now)
    expect(result.samples).toBe(1)
    expect(result.duplicates).toBe(1)
  })
  it('retains the newest valid duplicate regardless of record order', () => {
    const old = { ...station, observed_at: '2026-10-08T11:30:00Z', pm25: 99, lon: 78.21 }
    for (const records of [[old, station], [station, old]]) {
      const result = buildObservationHeatmap(feed(records), now)
      expect(result.samples).toBe(1)
      expect(result.duplicates).toBe(1)
      expect(result.staleCount).toBe(0)
      expect(result.geojson.features[0].properties).toMatchObject({ mean: 0, count: 1, id: '772:286' })
    }
  })
  it('keeps means finite for valid values whose sum would overflow', () => {
    const result = buildObservationHeatmap(feed([{ ...station, pm25: 1e308 }, { ...station, id: 'b', pm25: 1e308 }]), now)
    expect(result.geojson.features[0].properties.mean).toBe(1e308)
    expect(result.geojson.features[0].properties.count).toBe(2)
  })
  it('keeps geographic bins stable while reporting viewport intersections', () => {
    const result = buildObservationHeatmap(feed([station, { ...station, id: 'b', lon: 78.21 }]), now)
    expect(cellsInBounds(result, [77, 28, 77.5, 29])).toHaveLength(1)
    expect(cellsInBounds(result, [75, 28, 76, 29])).toHaveLength(0)
    expect(result.geojson.features).toHaveLength(2)
  })
  it('uses the real runtime snapshot and marks its archived observation dates', () => {
    const aqi = AqiFileSchema.parse(JSON.parse(readFileSync('public/data/aqi.json', 'utf8')))
    const result = buildObservationHeatmap(aqi, now)
    expect(result.samples).toBe(59)
    expect(result.rejected).toBe(1)
    expect(result.staleCount).toBe(59)
    expect(result.sources).toEqual(['OpenAQ'])
    expect(Date.parse(result.newest!)).toBeLessThan(Date.parse(aqi.generated_at))
  })
  it('keeps color thresholds consistent and finite coordinates strict', () => {
    expect(pm25Color(0)).toBe('#440154')
    expect(pm25Color(10)).toBe('#440154')
    expect(pm25Color(10.01)).toBe('#414487')
    expect(pm25Color(235)).toBe('#fde725')
    expect(validCoordinate(0, 0)).toBe(true)
    expect(validCoordinate(null, 0)).toBe(false)
    expect(validCoordinate(0, NaN)).toBe(false)
  })
  it('supports keyboard controls and non-color legend/table values', () => {
    const toggle = vi.fn(), opacity = vi.fn()
    render(<HeatmapControls data={buildObservationHeatmap(feed([station]), now)} enabled onToggle={toggle} opacity={0.7} onOpacity={opacity} />)
    expect(screen.getByText('0.0')).toBeTruthy()
    const methodology = screen.getByText(/^Occupied 0\.1° cells only:/)
    expect(methodology.textContent).toContain('No interpolation; unsampled areas are unavailable.')
    expect(screen.getByText(/^Methodology & Observation Provenance/).closest('summary')).toBeTruthy()
    expect(screen.getByText('0–10 µg/m³')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Observed PM2.5 heatmap' }))
    expect(toggle).toHaveBeenCalledWith(false)
    fireEvent.change(screen.getByRole('slider', { name: 'Heatmap opacity' }), { target: { value: '0.5' } })
    expect(opacity).toHaveBeenCalledWith(0.5)
  })
  it('shows explicit loading, failure, and empty states', () => {
    const props = { data: buildObservationHeatmap(null, now), enabled: true, onToggle: vi.fn(), opacity: 0.7, onOpacity: vi.fn() }
    const { rerender } = render(<HeatmapControls {...props} loading />)
    expect(screen.getByRole('status', { name: 'Observation data status' }).textContent).toContain('Loading observations')
    rerender(<HeatmapControls {...props} error="Invalid AQI data" />)
    expect(screen.getByRole('status', { name: 'Observation data status' }).textContent).toContain('No valid geolocated')
    expect(screen.getByRole('status', { name: 'Observation data status' }).textContent).toContain('Invalid AQI data')
  })
})

describe('actual map data and static fallback', () => {
  const corridor = CorridorGeoJSONSchema.parse(JSON.parse(readFileSync('public/data/corridor.geojson', 'utf8')))
  it('filters bands by forecast-relative horizon and includes all sources milestones', () => {
    expect(corridorAtHorizon(corridor, 0).features.every(f => f.properties.kind === 'centerline' || f.properties.hour_from === 0)).toBe(true)
    const sourceIds = new Set(corridor.features.filter(f => f.properties.kind === 'centerline').map(f => f.properties.source_id))
    expect(new Set(etaMilestones(corridor).features.map(f => String(f.properties!.label).split(' ')[0]))).toEqual(sourceIds)
  })
  it('projects WGS84 coordinates north-up without clamping valid points', () => {
    expect(projectPosition([77, 29], [76, 28, 78, 30])).toEqual([340, 190])
    expect(projectPosition([0, 91], [76, 28, 78, 30])).toBeNull()
    expect(projectPosition([79, 29], [76, 28, 78, 30])![0]).toBeGreaterThan(660)
  })
  it('renders real polygon geometry and never a decorative plume for empty feeds', () => {
    const { container, rerender } = render(<SvgFallbackMap sources={null} rankedSites={null} scopeFilter="all" corridor={corridor} horizon={0} />)
    expect(container.querySelectorAll('path[data-kind="band"]').length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toContain('WebGL unavailable')
    rerender(<SvgFallbackMap sources={null} rankedSites={null} scopeFilter="all" />)
    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(screen.getByText('No valid geospatial data available.')).toBeTruthy()
  })
  it('discloses the static overview facility limit using the actual ranked feed', () => {
    const rankedSites = RankedSitesFileSchema.parse(JSON.parse(readFileSync('public/data/ranked_sites.json', 'utf8')))
    render(<SvgFallbackMap sources={null} rankedSites={rankedSites} scopeFilter="all" />)
    expect(screen.getByText(`Showing the first 12 of ${rankedSites.sites.length} ranked facilities. The facility table contains the full list.`)).toBeTruthy()
  })
})
