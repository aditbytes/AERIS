import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AerisState } from '@/services/dataContext'
import type { ActionsFile, RankedSite, Source } from '@/types/schemas'
import SourceBreakdown from '@/components/analytics/SourceBreakdown'
import AqiForecast12h from '@/components/analytics/AqiForecast12h'
import WhatIfWeAct from '@/components/analytics/WhatIfWeAct'
import RecommendedActions from '@/components/analytics/RecommendedActions'
import AnalyticsView from '@/components/views/AnalyticsView'
import FireSourcesView from '@/components/views/FireSourcesView'
import PopulationRiskView from '@/components/views/PopulationRiskView'
import WindWeatherView, { weatherPath } from '@/components/views/WindWeatherView'
import ActionsWorkbenchView from '@/components/views/ActionsWorkbenchView'
import SettingsView from '@/components/views/SettingsView'
import Header from '@/components/layout/Header'
import AqiKpiCard from '@/components/kpi/AqiKpiCard'
import MetricGrid from '@/components/kpi/MetricGrid'
import TopAffectedAreas from '@/components/sites/TopAffectedAreas'
import ActionsModal from '@/components/agent/ActionsModal'
import { actionKey, clearActionChecklist, parseChecklist } from '@/components/agent/actionChecklist'
import { buildCsv, csvCell, downloadText } from '@/components/views/csv'

let state: AerisState
vi.mock('@/services/dataContext', () => ({ useAeris: () => state }))
const STAMP = '2026-10-09T10:00:00Z'
const NOW = Date.parse('2026-10-09T10:30:00Z')
// Explicit isolated cases; no fixtures or fabricated values enter production.
const source = (overrides: Partial<Source> = {}): Source => ({ id: 'candidate-1', type: 'candidate', lat: 30, lon: 76, fire_count: 2, total_frp_mw: 100, radius_km: 3, first_seen: STAMP, last_seen: STAMP, confidence: .6, emission_strength: .5, ...overrides })
const site = (overrides: Partial<RankedSite> = {}): RankedSite => ({ rank: 1, site_id: 'site-1', name: 'Isolated test school', type: 'school', lat: 29, lon: 77, occupancy: null, eta_hours: 2, pm25_delta_ugm3: 10, risk_score: .2, source_id: 'candidate-1', ...overrides })
const actions = (): ActionsFile => ({ generated_at: STAMP, summary: 'Isolated model advisory', actions: [{ priority: 1, site_id: 'site-1', who: 'Test recipient', action: 'Review conditions', reason: 'Isolated heuristic case', deadline_hours: 2 }], authority_actions: [{ who: 'Test authority', action: 'Review report', reason: 'Isolated advisory' }] })

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  localStorage.clear()
  clearActionChecklist()
  state = {
    sources: { generated_at: STAMP, sources: [] }, corridor: { type: 'FeatureCollection', generated_at: STAMP, features: [] },
    rankedSites: { generated_at: STAMP, exposed_population: { estimate: 0, low: 0, high: 0, data_available: false }, sites: [] },
    actions: actions(), aqi: { generated_at: STAMP, stations: [] }, wind: null,
    loading: false, refreshing: false, hasData: true, error: null, staleFeeds: [], feedErrors: {},
    avgAqi: null, exposedPopulation: null, activeExposedPopulation: null, avertedExposures: null,
    etaHours: null, activeTab: 'dashboard', showActionsModal: false, isSidebarCollapsed: true,
    interventionScenario: 'none', basemapMode: 'satellite', selectedSiteId: null,
    searchTerm: '', timeHorizon: 2, flyToLocation: null,
    setInterventionScenario: vi.fn(), setActiveTab: vi.fn(), setSelectedSiteId: vi.fn(), setFlyToLocation: vi.fn(),
    setShowActionsModal: vi.fn(), refreshData: vi.fn(), setBasemapMode: vi.fn(), toggleSidebar: vi.fn(), setSidebarCollapsed: vi.fn(), setSearchTerm: vi.fn(), setTimeHorizon: vi.fn(),
  }
})

describe('scientific labels and missing/zero data', () => {
  it('does not invent a populated FRP donut when no candidates exist', () => {
    render(<SourceBreakdown />)
    expect(screen.getByText('No source candidates available.')).toBeTruthy()
    expect(screen.queryByText('70% FRP')).toBeNull()
    expect(screen.queryByText('1 MW Fire Radiative Power', { exact: false })).toBeNull()
  })
  it('keeps zero tier shares zero and accounts for unknown territory', async () => {
    state.sources!.sources = [source({ total_frp_mw: 300 })]
    render(<SourceBreakdown />)
    expect(screen.getByText('100% FRP')).toBeTruthy()
    expect(screen.getAllByText('0% FRP')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Airshed Scope' }))
    expect(screen.getByText(/Territory unavailable/)).toBeTruthy()
    expect(screen.getByText('100% FRP')).toBeTruthy()
    expect(screen.getAllByText('0% FRP')).toHaveLength(2)
  })
  it('reports zero total FRP without fabricating percentages', () => {
    state.sources!.sources = [source({ total_frp_mw: 0 })]
    render(<SourceBreakdown />)
    expect(screen.getByText(/Total FRP is zero/)).toBeTruthy()
    expect(screen.queryByText(/% FRP$/)).toBeNull()
  })
  it('does not convert an observed AQI baseline into an unsupported forecast', () => {
    state.avgAqi = 0
    render(<AqiForecast12h />)
    expect(screen.getByText('Reported station average: 0 AQI.')).toBeTruthy()
    expect(screen.getByText(/validated AQI forecasting contract is not provided/)).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('distinguishes missing population cells from calculated zero', () => {
    const view = render(<WhatIfWeAct />)
    expect(screen.getByText(/Population estimate unavailable/)).toBeTruthy()
    state.exposedPopulation = 0
    view.rerender(<WhatIfWeAct />)
    expect(screen.getByRole('button', { name: /No Action/ })).toBeTruthy()
    expect(view.container.innerHTML).not.toContain('NaN')
    expect(screen.getByText(/not measured effectiveness/)).toBeTruthy()
  })
  it('preserves zero counts in source/facility KPI cards', () => {
    render(<MetricGrid />)
    expect(screen.getAllByText('0')).toHaveLength(2)
    expect(screen.queryByText('Active Pollution Sources')).toBeNull()
  })
  it('uses observation wall-clock age despite a freshly generated file', () => {
    state.avgAqi = 0
    state.aqi!.stations = [{ id: 'station', name: 'Zero-valued case', lat: 29, lon: 77, aqi: 0, observed_at: '2020-01-01T00:00:00Z', source: 'Isolated test' }]
    render(<AqiKpiCard />)
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('Archived observations')).toBeTruthy()
    expect(screen.getByText('Good')).toBeTruthy()
  })
  it('shows unknown measurement age when timestamps are missing', () => {
    state.aqi!.stations = [{ id: 'station', name: 'Missing time', lat: 29, lon: 77, aqi: 20, source: 'Isolated test' }]
    state.avgAqi = 20
    render(<AqiKpiCard />)
    expect(screen.getByText('Observation age unknown')).toBeTruthy()
  })
  it('removes invented validation skill and demographic assumptions', () => {
    render(<AnalyticsView />)
    expect(screen.queryByText(/R²/)).toBeNull()
    expect(screen.getByText('Historical Model Validation')).toBeTruthy()
    expect(screen.getByText(/No observed\/model pairing/)).toBeTruthy()
    expect(screen.queryByText(/Children at Risk/)).toBeNull()
  })
  it('shows unavailable population, preserves zero capacity and labels low risk correctly', () => {
    state.rankedSites!.sites = [site({ occupancy: 0 })]
    render(<PopulationRiskView />)
    expect(screen.getByText('Unavailable')).toBeTruthy()
    const row = screen.getByText('Isolated test school').closest('tr')!
    expect(within(row).getByText('0')).toBeTruthy()
    expect(within(row).getByText('Low (0.20)').className).toContain('badge-l')
    expect(screen.queryByText('571K')).toBeNull()
  })
  it('makes facilities beyond the first 50 reachable and reports visible counts', async () => {
    state.rankedSites!.sites = Array.from({ length: 51 }, (_, index) => site({ site_id: `site-${index}`, name: `Facility ${index}`, rank: index + 1 }))
    render(<PopulationRiskView />)
    expect(screen.queryByText('Facility 50')).toBeNull()
    expect(screen.getByText(/Showing 50 of 51 matching facilities/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Show more facilities' }))
    expect(screen.getByText('Facility 50')).toBeTruthy()
    expect(screen.getByText(/Showing 51 of 51 matching facilities/)).toBeTruthy()
  })
  it('does not fabricate missing wind or a wind rose', () => {
    render(<WindWeatherView />)
    expect(screen.getByText(/Wind forecast unavailable/)).toBeTruthy()
    expect(screen.queryByText('2.80')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('handles one forecast frame, zero wind and null mixing height', () => {
    state.wind = { generated_at: STAMP, source: 'Isolated forecast', points: [{ lat: 28.5, lon: 77.2, hours: [{ t: STAMP, u_ms: 0, v_ms: 0, speed_ms: 0, dir_from_deg: 0, pblh_m: null }] }] }
    const view = render(<WindWeatherView />)
    expect(screen.getByText('0.00')).toBeTruthy()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
    expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(screen.getByText('N: 1 frames (100.0%)')).toBeTruthy()
  })
  it('does not bridge missing mixing height as zero', () => {
    expect(weatherPath([100, null, 0], 100)).toMatch(/^M50\.0,20\.0 M730\.0,185\.0$/)
  })
  it('normalizes FRP ranking against the actual maximum in unsorted data', () => {
    state.sources!.sources = [source({ id: 'low', total_frp_mw: 20 }), source({ id: 'high', total_frp_mw: 200 })]
    const view = render(<FireSourcesView />)
    const bars = view.container.querySelectorAll<HTMLElement>('.rank-fill')
    expect(bars[0].style.width).toBe('100%')
    expect(bars[1].style.width).toBe('10%')
    expect(screen.getAllByText('Scope unavailable')).toHaveLength(2)
  })
  it('labels source candidates and heuristic confidence without claiming sensor quality or observed plumes', () => {
    state.sources!.sources = [source({ confidence: .8 })]
    render(<FireSourcesView />)
    expect(screen.getByRole('heading', { name: 'Fire-Derived Source Candidates & Hotspot Clusters' })).toBeTruthy()
    expect(screen.getByText('Aggregated into 1 source candidate clusters')).toBeTruthy()
    expect(screen.getByText('Heuristic confidence score ≥ 0.80 (uncalibrated)')).toBeTruthy()
    expect(screen.queryByText(/thermal quality flag|major plumes|Primary Epicenter/)).toBeNull()
  })
  it('keeps a server-marked stale wind capture stale despite its recent generation time', () => {
    state.wind = { generated_at: STAMP, source: 'Isolated forecast', points: [] }
    state.staleFeeds = [{ label: 'wind', stale: true, generatedAt: STAMP, ageSeconds: 1800, status: 'stale' }]
    render(<WindWeatherView />)
    expect(screen.getByText(/File freshness: stale/)).toBeTruthy()
  })
})

describe('local checklist, navigation and dialog behavior', () => {
  it.each(['null', '[]', 'true', '"text"', '{bad'])('safely rejects corrupt checklist %s', raw => {
    expect(parseChecklist(raw)).toEqual({})
  })
  it('loads boolean checklist values without accepting fabricated default marks', () => {
    expect(parseChecklist('{"a":true,"b":0,"c":false}')).toEqual({ a: true, c: false })
    render(<RecommendedActions />)
    expect(screen.getByText(/0\/1 marked locally/)).toBeTruthy()
  })
  it('shares current checklist state and never assigns marks by reordered array index', async () => {
    render(<><ActionsWorkbenchView /><RecommendedActions /></>)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark recommendation for Test recipient locally' }))
    expect(screen.getByText(/1\/1 marked locally/)).toBeTruthy()
    expect(screen.getByText(/1 of 2 marked locally/)).toBeTruthy()
    expect(actionKey(STAMP, state.actions!.actions[0])).not.toBe(actionKey('2026-10-09T11:00:00Z', state.actions!.actions[0]))
    expect(screen.queryByText(/GRAP STAGE IV/)).toBeNull()
  })
  it('ignores old checklist marks when counting the current recommendations', () => {
    localStorage.setItem('aeris_action_checklist_v2', JSON.stringify({ old1: true, old2: true, old3: true }))
    render(<ActionsWorkbenchView />)
    expect(screen.getByText('0 of 2 marked locally (0%)')).toBeTruthy()
  })
  it('keeps checklist toggles functional when browser storage writes are blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Isolated quota failure') })
    render(<ActionsWorkbenchView />)
    const checkbox = screen.getByRole('checkbox', { name: 'Mark recommendation for Test recipient locally' })
    await userEvent.click(checkbox)
    expect(screen.getByText('1 of 2 marked locally (50%)')).toBeTruthy()
    await userEvent.click(checkbox)
    expect(screen.getByText('0 of 2 marked locally (0%)')).toBeTruthy()
  })
  it('makes the modal a dialog, traps keyboard focus, closes on Escape and restores the opener', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open recommendations'
    document.body.append(opener)
    opener.focus()
    state.showActionsModal = true
    const view = render(<ActionsModal />)
    expect(screen.getByRole('dialog', { name: 'AERIS Action Recommendations' })).toBeTruthy()
    const close = screen.getByRole('button', { name: 'Close modal' })
    expect(document.activeElement).toBe(close)
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Close$/ }))
    await userEvent.tab()
    expect(document.activeElement).toBe(close)
    await userEvent.keyboard('{Escape}')
    expect(state.setShowActionsModal).toHaveBeenCalledWith(false)
    state.showActionsModal = false
    view.rerender(<ActionsModal />)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
  it('does not use ranking publication time as the forecast origin for absolute arrival', () => {
    state.rankedSites!.sites = [site()]
    state.rankedSites!.generated_at = '2026-10-09T02:05:47Z'
    state.corridor!.forecast_start = '2026-10-07T18:00:00Z'
    const view = render(<TopAffectedAreas />)
    expect(screen.getByText('Forecast-relative ETA +2.0 h · Absolute arrival unavailable')).toBeTruthy()
    expect(screen.queryByText(/IST|arrival time passed/)).toBeNull()
    state.rankedSites!.generated_at = '2020-01-01T00:00:00Z'
    view.rerender(<TopAffectedAreas />)
    expect(screen.getByText('Forecast-relative ETA +2.0 h · Absolute arrival unavailable')).toBeTruthy()
  })
  it('opens the selected facility on the map with native keyboard activation', async () => {
    state.rankedSites!.sites = [site()]
    render(<TopAffectedAreas />)
    const button = screen.getByRole('button', { name: /Isolated test school.*open map/ })
    button.focus()
    await userEvent.keyboard(' ')
    expect(state.setSelectedSiteId).toHaveBeenCalledWith('site-1')
    expect(state.setActiveTab).toHaveBeenCalledWith('map')
    expect(state.setFlyToLocation).toHaveBeenCalledWith(expect.objectContaining({ lat: 29, lon: 77 }))
  })
  it('searches actual facilities and reports unmatched searches', async () => {
    state.rankedSites!.sites = [site()]
    render(<Header />)
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'not-a-place{Enter}')
    expect(screen.getByRole('status').textContent).toContain('No matching')
    await userEvent.clear(input)
    await userEvent.type(input, 'Isolated test school{Enter}')
    expect(state.setFlyToLocation).toHaveBeenCalledWith(expect.objectContaining({ name: 'Isolated test school' }))
    expect(state.setActiveTab).toHaveBeenCalledWith('map')
  })
  it('uses the oldest feed status and provides Escape recovery without invented alerts', async () => {
    state.sources!.generated_at = '2020-01-01T00:00:00Z'
    state.wind = { generated_at: STAMP, source: 'Isolated', points: [] }
    render(<Header />)
    expect(screen.getByText(/feeds stale \/ unavailable/)).toBeTruthy()
    const trigger = screen.getByRole('button', { name: 'Data feed status' })
    await userEvent.click(trigger)
    expect(screen.getByText('sources: stale')).toBeTruthy()
    expect(screen.queryByText(/Order No|676 MW|GRAP Stage/)).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('sources: stale')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('shows archived corridor status even when other loaded feeds are recent', async () => {
    state.corridor!.generated_at = '2020-01-01T00:00:00Z'
    state.wind = { generated_at: STAMP, source: 'Isolated', points: [] }
    render(<Header />)
    expect(screen.getByText(/1 feeds stale \/ unavailable/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Data feed status' }))
    expect(screen.getByText('corridor: stale')).toBeTruthy()
    expect(screen.getByText('sources: current')).toBeTruthy()
  })
  it('keeps reload responsive and resets all local checklist panels', async () => {
    render(<><SettingsView /><ActionsWorkbenchView /></>)
    await userEvent.click(screen.getByRole('button', { name: 'Mark All Locally' }))
    expect(screen.getByText('2 of 2 marked locally (100%)')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear local checklist' }))
    expect(screen.getByText('0 of 2 marked locally (0%)')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reload data' }))
    expect(state.refreshData).toHaveBeenCalledOnce()
  })
  it('reports all six feed statuses and honors retained server-stale metadata in settings', () => {
    state.staleFeeds = [{ label: 'aqi', stale: true, generatedAt: STAMP, ageSeconds: 1800, status: 'stale' }]
    render(<SettingsView />)
    const station = screen.getByText('Ground station observations').closest('.feed-item')!
    expect(within(station as HTMLElement).getByText('stale')).toBeTruthy()
    expect(screen.getByText('Modelled plume corridor')).toBeTruthy()
    expect(document.querySelectorAll('.feed-item')).toHaveLength(6)
  })
})

describe('safe, complete downloads', () => {
  it('quotes commas, quotes and newlines and protects formula text while preserving numeric zeros', () => {
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"')
    expect(csvCell('\t@command')).toBe('"\'\t@command"')
    expect(csvCell(-1)).toBe('"-1"')
    expect(buildCsv(['Name', 'Value'], [['A,"B"\nC', 0]])).toBe('"Name","Value"\r\n"A,""B""\nC","0"')
  })
  it('downloads a blob and releases its object URL', async () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:isolated-case'), revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadText('test.csv', 'isolated')
    expect(click).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download="test.csv"]')).toBeNull()
    act(() => { vi.runAllTimers() })
    expect(revoke).toHaveBeenCalledWith('blob:isolated-case')
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
