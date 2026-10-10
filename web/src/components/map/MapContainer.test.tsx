import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { AerisState } from '@/services/dataContext'
import { WindFileSchema, type WindFile } from '@/types/schemas'
import MapContainer from './MapContainer'

let state: AerisState
vi.mock('@/services/dataContext', () => ({ useAeris: () => state, useTimeHorizon: () => state }))
vi.mock('./useScientificLayers', () => ({ useScientificLayers: vi.fn() }))
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    on() { return this }
    off() { return this }
    loaded() { return false }
    remove() {}
    resize() {}
  },
  Marker: class {},
  Popup: class {},
}))
const STAMP = '2026-10-10T06:00:00Z'
const NOW = Date.parse('2026-10-10T06:30:00Z')
// Explicit unit cases; never production feed defaults.
function wind(speed = 5, direction = 90): WindFile {
  return { generated_at: STAMP, source: 'test-forecast', points: [{ lat: 29, lon: 77, hours: [{ t: '2026-10-10T07:00:00Z', u_ms: -speed, v_ms: 0, speed_ms: speed, dir_from_deg: direction, pblh_m: null }] }] }
}
const flow = () => screen.getByRole('region', { name: 'Wind forecast sample' })
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  state = {
    sources: null, aqi: null, wind: null, corridor: null, rankedSites: null,
    loading: false, feedErrors: {}, staleFeeds: [], timeHorizon: 2, basemapMode: 'satellite',
    flyToLocation: null, selectedSiteId: null, etaHours: null,
    setTimeHorizon: vi.fn(), setActiveTab: vi.fn(), setSelectedSiteId: vi.fn(), setBasemapMode: vi.fn(),
  } as unknown as AerisState
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('map wind sample integrity', () => {
  it.each([
    ['missing', null, 'Wind unavailable: feed missing.'],
    ['empty grid', { generated_at: STAMP, source: 'test-forecast', points: [] }, 'Wind unavailable: no forecast samples.'],
    ['empty hours', { generated_at: STAMP, source: 'test-forecast', points: [{ lat: 29, lon: 77, hours: [] }] }, 'Wind unavailable: no forecast samples.'],
  ] as const)('does not invent speed or direction for %s', (_, value, message) => {
    state.wind = value as WindFile | null
    render(<MapContainer />)
    expect(flow().textContent).toContain(message)
    expect(flow().textContent).not.toMatch(/18|km\/h|SE Airflow/)
  })
  it.each([NaN, Infinity, -1])('rejects invalid speed %s', speed => {
    state.wind = wind(speed)
    render(<MapContainer />)
    expect(flow().textContent).toContain('Wind unavailable: invalid forecast data.')
    expect(flow().textContent).not.toContain('km/h')
  })
  it.each([NaN, -1, 361])('rejects invalid direction %s', direction => {
    state.wind = wind(5, direction)
    render(<MapContainer />)
    expect(flow().textContent).toContain('Wind unavailable: invalid forecast data.')
  })
  it('rejects incomplete sample fields instead of substituting a direction', () => {
    state.wind = wind()
    delete (state.wind.points[0].hours[0] as unknown as Record<string, unknown>).dir_from_deg
    render(<MapContainer />)
    expect(flow().textContent).toContain('Wind unavailable: invalid forecast data.')
  })
  it('does not round a positive wind sample to calm or print an overflowing conversion', () => {
    state.wind = wind(0.001)
    const view = render(<MapContainer />)
    expect(within(flow()).getByText('<0.1 km/h')).toBeTruthy()
    expect(flow().textContent).toContain('Wind from E')
    state.wind = wind(Number.MAX_VALUE)
    view.rerender(<MapContainer />)
    expect(flow().textContent).toContain('Wind unavailable: invalid forecast data.')
    expect(flow().textContent).not.toContain('Infinity')
  })
  it('preserves valid calm zero and does not claim a meaningful calm direction', () => {
    state.wind = wind(0)
    render(<MapContainer />)
    expect(within(flow()).getByText('0.0 km/h')).toBeTruthy()
    expect(flow().textContent).toContain('Calm; direction undefined')
    expect(flow().textContent).not.toContain('Wind from')
  })
  it.each([[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']] as const)('converts sample speed and labels meteorological FROM direction %s', (direction, compass) => {
    state.wind = wind(5, direction)
    render(<MapContainer />)
    expect(within(flow()).getByText('18.0 km/h')).toBeTruthy()
    expect(flow().textContent).toContain(`Wind from ${compass} (${direction}°)`)
    expect(flow().textContent).toContain('2026-10-10T07:00:00Z')
    expect(flow().textContent).toContain('29, 77')
    expect(flow().textContent).toContain('test-forecast')
    expect(flow().textContent).not.toContain('SE Airflow Vector')
  })
  it('preserves the producer partial-coverage flag through runtime validation', () => {
    state.wind = WindFileSchema.parse({ ...wind(), coverage_complete: false })
    render(<MapContainer />)
    expect(flow().textContent).toContain('Incomplete wind coverage')
    expect(within(flow()).getByText('18.0 km/h')).toBeTruthy()
  })
  it('distinguishes unknown coverage from successful batch retrieval without claiming plume coverage', () => {
    state.wind = wind()
    const view = render(<MapContainer />)
    expect(flow().textContent).toContain('Wind coverage unknown')
    state.wind = WindFileSchema.parse({ ...wind(), coverage_complete: true })
    view.rerender(<MapContainer />)
    expect(flow().textContent).toContain('All retrieval batches succeeded; plume coverage not established')
  })
  it('retains the first available sample while reporting empty grid points as incomplete', () => {
    state.wind = WindFileSchema.parse({ ...wind(), coverage_complete: true, points: [{ lat: 30, lon: 76, hours: [] }, ...wind().points] })
    render(<MapContainer />)
    expect(flow().textContent).toContain('Incomplete wind coverage')
    expect(within(flow()).getByText('18.0 km/h')).toBeTruthy()
  })
  it('reports mismatched grid timestamps as incomplete even when retrieval batches succeeded', () => {
    const later = wind().points[0]
    later.hours[0].t = '2026-10-10T08:00:00Z'
    state.wind = WindFileSchema.parse({ ...wind(), coverage_complete: true, points: [...wind().points, later] })
    render(<MapContainer />)
    expect(flow().textContent).toContain('Incomplete wind coverage')
    expect(flow().textContent).not.toContain('All retrieval batches succeeded')
  })
  it.each(['aged', 'server-stale'] as const)('labels %s wind captures and preserves actual sample values', condition => {
    state.wind = wind()
    if (condition === 'aged') state.wind.generated_at = '2026-10-09T06:00:00Z'
    else state.staleFeeds = [{ label: 'wind', stale: true, status: 'stale', generatedAt: STAMP, ageSeconds: 1800 }]
    render(<MapContainer />)
    expect(flow().textContent).toContain('Stale wind capture')
    expect(within(flow()).getByText('18.0 km/h')).toBeTruthy()
  })
  it('labels a past forecast sample separately from a recent capture and a failed refresh', () => {
    state.wind = wind()
    state.wind.points[0].hours[0].t = '2026-10-09T07:00:00Z'
    state.feedErrors = { wind: 'Network unavailable' }
    render(<MapContainer />)
    expect(flow().textContent).toContain('Past forecast sample')
    expect(flow().textContent).toContain('Network unavailable. Retained forecast sample shown.')
  })
  it('shows initial loading with no fabricated sample', () => {
    state.loading = true
    render(<MapContainer />)
    expect(flow().textContent).toContain('Loading wind data')
    expect(flow().textContent).not.toContain('km/h')
  })
  it('does not invent a receptor ETA and preserves a genuine zero', () => {
    const view = render(<MapContainer />)
    expect(screen.getByText('ETA unavailable')).toBeTruthy()
    expect(screen.queryByText(/3\.2h ETA/)).toBeNull()
    state.etaHours = 0
    view.rerender(<MapContainer />)
    expect(screen.getByText('~0.0h ETA')).toBeTruthy()
    state.etaHours = NaN
    view.rerender(<MapContainer />)
    expect(screen.getByText('ETA unavailable')).toBeTruthy()
  })
})
