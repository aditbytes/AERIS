import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AerisState } from '@/services/dataContext'
import type { RankedSite } from '@/types/schemas'
import MapExplorerView from './MapExplorerView'
import { getThermalSeverity } from './thermalMarker'

const activeMarkers = vi.hoisted(() => new Set<HTMLElement>())
let state: AerisState
vi.mock('@/services/dataContext', () => ({ useAeris: () => state }))
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
  Marker: class {
    element: HTMLElement
    constructor({ element }: { element: HTMLElement }) { this.element = element }
    setLngLat() { return this }
    addTo() { activeMarkers.add(this.element); return this }
    remove() { activeMarkers.delete(this.element); return this }
  },
}))

function site(index: number, type: RankedSite['type']): RankedSite {
  return { rank: index + 1, site_id: `test-site-${index}`, name: `Test ${type} ${index}`, type, lat: 29, lon: 77, occupancy: null, eta_hours: index / 2, pm25_delta_ugm3: 10, risk_score: 0.2, source_id: 'test-source' }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  activeMarkers.clear()
  state = {
    sources: null, corridor: null, aqi: null, wind: null,
    rankedSites: { generated_at: '2026-10-10T06:00:00Z', exposed_population: { estimate: 0, low: 0, high: 0, data_available: false }, sites: [] },
    loading: false, feedErrors: {}, timeHorizon: 2, basemapMode: 'satellite', flyToLocation: null,
    exposedPopulation: null, etaHours: null,
    setTimeHorizon: vi.fn(), setShowActionsModal: vi.fn(), setSelectedSiteId: vi.fn(), setBasemapMode: vi.fn(),
  } as unknown as AerisState
})
afterEach(() => vi.unstubAllGlobals())

describe('map explorer facility visibility', () => {
  it('states the same FRP tier boundaries used by the source markers', () => {
    render(<MapExplorerView />)
    expect(getThermalSeverity(200)).toBe('severe')
    expect(screen.getByText('Severe (≥200 MW)')).toBeTruthy()
    expect(getThermalSeverity(50)).toBe('high')
    expect(screen.getByText('High (50–<200 MW)')).toBeTruthy()
    expect(getThermalSeverity(49.99)).toBe('moderate')
    expect(screen.getByText('Moderate (<50 MW)')).toBeTruthy()
  })
  it.each([
    ['school', 'hospital', /Sensitive Schools/],
    ['hospital', 'school', /Hospitals & Clinics/],
  ] as const)('applies the %s visibility filter before limiting the remaining %s markers', async (firstType, remainingType, filterLabel) => {
    state.rankedSites!.sites = [
      ...Array.from({ length: 12 }, (_, index) => site(index, firstType)),
      ...Array.from({ length: 13 }, (_, index) => site(index + 12, remainingType)),
    ]
    const { unmount } = render(<MapExplorerView />)
    expect([...activeMarkers].map(element => element.title)).toEqual(state.rankedSites!.sites.slice(0, 12).map(value => `${value.name} (Low Risk · ~${value.eta_hours.toFixed(1)}h arrival)`))
    await userEvent.click(screen.getByRole('button', { name: /^Layers/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: filterLabel }))
    expect([...activeMarkers].map(element => element.title)).toEqual(state.rankedSites!.sites.slice(12, 24).map(value => `${value.name} (Low Risk · ~${value.eta_hours.toFixed(1)}h arrival)`))
    unmount()
    expect(activeMarkers.size).toBe(0)
  })
})
