import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AerisState } from '@/services/dataContext'
import type { CorridorGeoJSON } from '@/types/schemas'
import AqiForecast12h from './AqiForecast12h'

let state: AerisState
vi.mock('@/services/dataContext', () => ({ useAeris: () => state }))
const STAMP = '2026-10-10T06:00:00Z'
const NOW = Date.parse('2026-10-10T06:30:00Z')
// Isolated test cases, never published as measurements or model output.
function band(delta: number, from = 0, to = 2, source = 'test-source'): CorridorGeoJSON['features'][number] {
  return {
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[76, 29], [77, 29], [77, 30], [76, 29]]] },
    properties: { kind: 'band', source_id: source, hour_from: from, hour_to: to, risk: 0.2, pm25_delta_ugm3: delta },
  }
}
function corridor(features: CorridorGeoJSON['features']): CorridorGeoJSON {
  return { type: 'FeatureCollection', generated_at: STAMP, forecast_start: STAMP, features }
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  state = {
    avgAqi: null, aqi: null, corridor: null, timeHorizon: 2,
    setTimeHorizon: vi.fn(), loading: false, feedErrors: {}, staleFeeds: [],
  } as unknown as AerisState
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('reported plume band peaks and observed AQI', () => {
  it.each([
    ['missing', null, 'Plume band peaks unavailable: corridor feed missing.'],
    ['empty', corridor([]), 'Plume band peaks unavailable: no band features.'],
    ['centreline only', corridor([{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[76, 29], [77, 30]] }, properties: { kind: 'centerline', source_id: 'test-source', points_eta_hours: [0, 2] } }]), 'Plume band peaks unavailable: no band features.'],
  ] as const)('does not invent values for %s input', (_, input, message) => {
    state.corridor = input
    const { container } = render(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain(message)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(/Peak.*151/)).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.queryByText(/115m|NIGHT INVERSION TRAP/)).toBeNull()
  })
  it.each([NaN, Infinity, -1])('rejects invalid band delta %s', delta => {
    state.corridor = corridor([band(delta)])
    render(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain('invalid corridor data')
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('rejects an incomplete band and an invalid interval rather than guessing values', () => {
    const input = corridor([band(5)])
    delete (input.features[0].properties as unknown as Record<string, unknown>).pm25_delta_ugm3
    state.corridor = input
    const view = render(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain('invalid corridor data')
    state.corridor = corridor([band(5, 2, 2)])
    view.rerender(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain('invalid corridor data')
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('retains valid zero peaks and zero observed AQI without a fabricated trajectory', () => {
    state.corridor = corridor([band(0)])
    state.avgAqi = 0
    const { container } = render(<AqiForecast12h />)
    expect(screen.getByText('Largest reported band peak: +0 µg/m³')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByRole('cell', { name: '+0' })).toBeTruthy()
    expect(screen.getByText('Reported station average: 0 AQI.')).toBeTruthy()
    expect(screen.getByText(/Trajectory unavailable: band peaks are not a receptor time series/)).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })
  it('reports maxima for actual intervals without averaging sources, inserting bands, or scaling peaks', async () => {
    state.corridor = corridor([band(0.125, 4, 8), band(7, 0, 2), band(11.75, 0, 2, 'other-test-source')])
    render(<AqiForecast12h />)
    const table = screen.getByRole('table', { name: /Largest reported source-band peak by forecast interval/ })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByRole('row', { name: '0–2h +11.75' })).toBeTruthy()
    expect(within(table).getByRole('row', { name: '4–8h +0.125' })).toBeTruthy()
    expect(within(table).queryByRole('row', { name: /2–4h|8–24h/ })).toBeNull()
    expect(screen.getByText('Largest reported band peak: +11.75 µg/m³')).toBeTruthy()
    const horizon = screen.getByRole('button', { name: '4–8h' })
    horizon.focus()
    await userEvent.keyboard('{Enter}')
    expect(state.setTimeHorizon).toHaveBeenCalledWith(4)
    expect(screen.getByRole('button', { name: '2–4h' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('discloses missing forecast reference time instead of treating capture time as forecast start', () => {
    state.corridor = { type: 'FeatureCollection', generated_at: STAMP, features: [band(4)] }
    render(<AqiForecast12h />)
    expect(screen.getByText('Forecast start unavailable; intervals are forecast-relative.')).toBeTruthy()
  })
  it.each(['aged', 'server-stale', 'expired'] as const)('labels retained %s model data', condition => {
    state.corridor = corridor([band(5)])
    if (condition === 'aged') state.corridor.generated_at = '2026-10-09T06:00:00Z'
    if (condition === 'server-stale') state.staleFeeds = [{ label: 'corridor', stale: true, status: 'stale', generatedAt: STAMP, ageSeconds: 1800 }]
    if (condition === 'expired') state.corridor.forecast_start = '2026-10-09T06:00:00Z'
    render(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toMatch(/Stale model capture|Expired model forecast/)
    expect(screen.getByText('Largest reported band peak: +5 µg/m³')).toBeTruthy()
  })
  it('advances freshness without a new feed and retains values when a refresh fails', () => {
    vi.useFakeTimers()
    let clock = NOW
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    state.corridor = corridor([band(5)])
    const view = render(<AqiForecast12h />)
    clock += 91 * 60_000
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain('Stale model capture')
    state.feedErrors = { corridor: 'Network unavailable' }
    view.rerender(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain('Network unavailable. Retained model data shown.')
    expect(screen.getByText('Largest reported band peak: +5 µg/m³')).toBeTruthy()
  })
  it('shows loading separately from unavailable data', () => {
    state.loading = true
    render(<AqiForecast12h />)
    expect(screen.getByRole('status', { name: 'Plume data status' }).textContent).toContain('Loading corridor data')
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('preserves real station readings and discloses stale observation time despite a fresh capture', async () => {
    state.avgAqi = 0
    state.aqi = { generated_at: STAMP, stations: [{ id: 'test-station', name: 'Zero observation test', lat: 29, lon: 77, aqi: 0, pm25: 0, source: 'test-only', observed_at: '2026-10-09T06:00:00Z' }] }
    render(<AqiForecast12h />)
    await userEvent.click(screen.getByRole('button', { name: 'Stations (1)' }))
    expect(screen.getByText('0.0 µg/m³')).toBeTruthy()
    const observationTime = screen.getByText('2026-10-09T06:00:00Z')
    expect(observationTime.tagName).toBe('TIME')
    expect(observationTime.getAttribute('datetime')).toBe('2026-10-09T06:00:00Z')
    expect(observationTime.parentElement!.textContent).toBe('Stale observation: 2026-10-09T06:00:00Z')
    expect(screen.queryByText(/Live Airshed/)).toBeNull()
  })
  it('rejects invalid station values and does not render an invalid derived average', async () => {
    state.avgAqi = NaN
    state.aqi = { generated_at: STAMP, stations: [{ id: 'test-station', name: 'Invalid case', lat: 29, lon: 77, aqi: NaN, pm25: -1, source: 'test-only' }] }
    const { container } = render(<AqiForecast12h />)
    await userEvent.click(screen.getByRole('button', { name: 'Stations (0)' }))
    expect(screen.getByRole('status', { name: 'Station data status' }).textContent).toContain('Invalid station data')
    expect(screen.getByText('Reported station average: unavailable.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('shows stored partial-failure metadata on both tabs while preserving zero and ambiguous time', async () => {
    state.avgAqi = 0
    state.aqi = { generated_at: STAMP, source: 'CPCB/data.gov.in', coverage_complete: false,
      fetch_status: 'PARTIAL', sources_failed: ['OpenAQ'], sources_with_readings: ['CPCB/data.gov.in'],
      source_fetch_status: { OpenAQ: 'FAILED', 'CPCB/data.gov.in': 'SUCCESS' },
      stations: [{ id: 'ISOLATED_ZERO_TEST', name: 'Isolated zero test', lat: 29, lon: 77,
        aqi: 0, pm25: 0, observed_at: null, source_timestamp: '10-10-2026 07:00:00', source: 'CPCB/data.gov.in' }] }
    render(<AqiForecast12h />)
    const coverage = screen.getByRole('region', { name: 'AQI source and coverage' })
    expect(coverage.textContent).toContain('Partial AQI feed: known fetch gaps')
    expect(coverage.textContent).toContain('Sources with fetch failures (including partial failures): OpenAQ')
    expect(coverage.textContent).toContain('Source identity: CPCB/data.gov.in')
    expect(coverage.textContent).toContain('not subsequent ingestion attempts')
    await userEvent.click(screen.getByRole('button', { name: 'Stations (1)' }))
    expect(screen.getByRole('region', { name: 'AQI source and coverage' }).textContent).toContain('extent of regional coverage is unknown')
    expect(screen.getByText('0.0 µg/m³')).toBeTruthy()
    expect(screen.getByText('Source: CPCB/data.gov.in.')).toBeTruthy()
    const sourceTime = screen.getByText('Source time (timezone unavailable or ambiguous): 10-10-2026 07:00:00')
    expect(sourceTime.querySelector('time')).toBeNull()
  })
  it.each(['COMPLETE', 'FAILED', 'UNAVAILABLE', 'UNKNOWN'] as const)('keeps empty %s input unavailable and identifies its known fetch outcome', fetchStatus => {
    state.aqi = { generated_at: STAMP, source: 'none', stations: [], fetch_status: fetchStatus, coverage_complete: null, sources_with_readings: [] }
    render(<AqiForecast12h />)
    const coverage = screen.getByRole('region', { name: 'AQI source and coverage' })
    expect(coverage.textContent).toContain('AQI readings unavailable')
    expect(coverage.textContent).toContain('empty result does not establish clean air')
    expect(coverage.textContent).toContain('Sources with readings: none')
    const expected = { COMPLETE: 'Requested fetches succeeded', FAILED: 'Requested fetches failed',
      UNAVAILABLE: 'Providers were not configured', UNKNOWN: 'Fetch outcome unknown' }
    expect(coverage.textContent).toContain(expected[fetchStatus])
    expect(screen.getByText('Reported station average: unavailable.')).toBeTruthy()
  })
  it('reports unknown legacy coverage and does not infer request success from readings', () => {
    state.avgAqi = 0
    state.aqi = { generated_at: STAMP, stations: [{ id: 'ISOLATED_ZERO_TEST', name: 'Isolated test', lat: 29, lon: 77, aqi: 0, source: 'TEST_ONLY' }] }
    render(<AqiForecast12h />)
    const coverage = screen.getByRole('region', { name: 'AQI source and coverage' })
    expect(coverage.textContent).toContain('AQI coverage unknown')
    expect(coverage.textContent).toContain('Fetch outcome unknown')
    expect(screen.getByText('Reported station average: 0 AQI.')).toBeTruthy()
  })
  it('separates successful requested fetches from unknown regional coverage', () => {
    state.aqi = { generated_at: STAMP, stations: [{ id: 'ISOLATED_ZERO_TEST', name: 'Isolated test', lat: 29, lon: 77, aqi: 0, source: 'TEST_ONLY' }],
      fetch_status: 'COMPLETE', coverage_complete: null, source_fetch_status: { TEST_ONLY: 'SUCCESS' } }
    render(<AqiForecast12h />)
    expect(screen.getByRole('region', { name: 'AQI source and coverage' }).textContent).toContain('Requested fetches succeeded; this does not establish regional coverage')
    expect(screen.getByRole('region', { name: 'AQI source and coverage' }).textContent).toContain('AQI coverage unknown')
  })
  it('discloses externally reported completeness without certifying observation quality', () => {
    state.aqi = { generated_at: STAMP, stations: [{ id: 'ISOLATED_ZERO_TEST', name: 'Isolated test', lat: 29, lon: 77, aqi: 0, source: 'TEST_ONLY' }], coverage_complete: true }
    render(<AqiForecast12h />)
    expect(screen.getByRole('region', { name: 'AQI source and coverage' }).textContent).toContain('Producer reports complete AQI coverage; regional completeness and observation quality are not independently verified')
  })
})
