/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AerisProvider, useAeris } from '@/services/dataContext'

const feeds = vi.hoisted(() => ({
  getSources: vi.fn(), getCorridor: vi.fn(), getRankedSites: vi.fn(),
  getActions: vi.fn(), getAqi: vi.fn(), getWind: vi.fn(),
}))
vi.mock('@/services/api', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/api')>(), ...feeds,
}))
function fixture(file: string) { return JSON.parse(readFileSync(`public/data/${file}`, 'utf8')) }
function Probe() {
  const state = useAeris()
  return <>
    <output data-testid="summary">{JSON.stringify({
      loading: state.loading, refreshing: state.refreshing, hasData: state.hasData,
      error: state.error, feedErrors: state.feedErrors, avgAqi: state.avgAqi,
      pm25: state.aqi?.stations[0]?.pm25, population: state.exposedPopulation,
      sourceCount: state.sources?.sources.length, wind: Boolean(state.wind),
      staleFeeds: state.staleFeeds,
    })}</output>
    <button type="button" onClick={state.refreshData}>Refresh data</button>
  </>
}
function summary() { return JSON.parse(screen.getByTestId('summary').textContent!) }
function mount() { return render(<AerisProvider><Probe /></AerisProvider>) }

beforeEach(() => {
  for (const mock of Object.values(feeds)) mock.mockReset()
  feeds.getSources.mockResolvedValue(fixture('sources.json'))
  feeds.getCorridor.mockResolvedValue(fixture('corridor.geojson'))
  feeds.getRankedSites.mockResolvedValue(fixture('ranked_sites.json'))
  feeds.getActions.mockResolvedValue(fixture('actions.json'))
  feeds.getAqi.mockResolvedValue(fixture('aqi.json'))
  feeds.getWind.mockResolvedValue(fixture('wind.json'))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('data lifecycle and availability', () => {
  it('preserves valid zero AQI and distinguishes missing population from zero', async () => {
    const aqi = fixture('aqi.json')
    aqi.stations = [{ ...aqi.stations[0], aqi: 0, pm25: 0 }]
    feeds.getAqi.mockResolvedValue(aqi)
    const ranked = fixture('ranked_sites.json')
    ranked.exposed_population = { estimate: 0, low: 0, high: 0, data_available: false }
    feeds.getRankedSites.mockResolvedValue(ranked)
    mount()
    await waitFor(() => expect(summary().loading).toBe(false))
    expect(summary()).toMatchObject({ hasData: true, avgAqi: 0, pm25: 0, population: null })
    ranked.exposed_population.data_available = true
    feeds.getRankedSites.mockResolvedValue({ ...ranked })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await waitFor(() => expect(summary().refreshing).toBe(false))
    expect(summary().population).toBe(0)
  })
  it('loads available feeds independently and reports an unavailable wind feed', async () => {
    feeds.getWind.mockRejectedValue(new Error('Unable to retrieve wind data. Retry to recover.'))
    mount()
    await waitFor(() => expect(summary().loading).toBe(false))
    expect(summary()).toMatchObject({ hasData: true, wind: false, sourceCount: 10 })
    expect(summary().feedErrors.wind).toContain('Unable to retrieve wind')
    expect(summary().error).toContain('Unavailable feeds: wind')
  })
  it('keeps the observed AQI average finite when summing finite readings would overflow', async () => {
    const aqi = fixture('aqi.json')
    aqi.stations = [{ ...aqi.stations[0], aqi: 1e308 }, { ...aqi.stations[0], id: 'second-test-station', aqi: 1e308 }]
    feeds.getAqi.mockResolvedValue(aqi)
    mount()
    await waitFor(() => expect(summary().loading).toBe(false))
    expect(summary().avgAqi).toBe(1e308)
  })
  it('retains the last real result on transient refresh failure and clears errors after retry', async () => {
    mount()
    await waitFor(() => expect(summary().loading).toBe(false))
    const prior = summary().pm25
    feeds.getAqi.mockRejectedValueOnce(new Error('Network unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await waitFor(() => expect(summary().feedErrors.aqi).toBe('Network unavailable'))
    expect(summary()).toMatchObject({ loading: false, pm25: prior, hasData: true })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await waitFor(() => expect(summary().error).toBeNull())
    expect(summary().feedErrors).toEqual({})
  })
  it('shows an honest all-feeds unavailable state without invented data', async () => {
    for (const mock of Object.values(feeds)) mock.mockRejectedValue(new Error('No real result'))
    mount()
    await waitFor(() => expect(summary().loading).toBe(false))
    expect(summary()).toMatchObject({ hasData: false, avgAqi: null, population: null, wind: false })
    expect(Object.keys(summary().feedErrors)).toHaveLength(6)
  })
  it('supersedes older refreshes even when a fetch implementation ignores cancellation', async () => {
    let resolveOld!: (value: unknown) => void
    feeds.getAqi.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    mount()
    await waitFor(() => expect(feeds.getAqi).toHaveBeenCalledTimes(1))
    const oldSignal = feeds.getAqi.mock.calls[0][0] as AbortSignal
    const latest = fixture('aqi.json')
    latest.stations[0].pm25 = 42
    feeds.getAqi.mockResolvedValue(latest)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }))
    await waitFor(() => expect(summary().pm25).toBe(42))
    expect(oldSignal.aborted).toBe(true)
    const old = fixture('aqi.json')
    old.stations[0].pm25 = 999
    await act(async () => { resolveOld(old); await Promise.resolve() })
    expect(summary().pm25).toBe(42)
  })
  it('cancels pending requests when the provider unmounts', async () => {
    feeds.getAqi.mockImplementationOnce(() => new Promise(() => {}))
    const rendered = mount()
    await waitFor(() => expect(feeds.getAqi).toHaveBeenCalledTimes(1))
    const signal = feeds.getAqi.mock.calls[0][0] as AbortSignal
    rendered.unmount()
    expect(signal.aborted).toBe(true)
  })
  it('supports StrictMode effect cleanup without committing cancelled responses', async () => {
    render(<StrictMode><AerisProvider><Probe /></AerisProvider></StrictMode>)
    await waitFor(() => expect(summary().loading).toBe(false))
    expect(summary().hasData).toBe(true)
    expect((feeds.getSources.mock.calls[0][0] as AbortSignal).aborted).toBe(true)
  })
  it('keeps retained observation freshness during a partial refresh until the new data commits', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
    const api = await vi.importActual<typeof import('@/services/api')>('@/services/api')
    const retained = fixture('aqi.json')
    retained.generated_at = '2026-10-09T10:00:00Z'
    const latest = fixture('aqi.json')
    latest.generated_at = '2026-10-09T12:00:50Z'
    latest.stations[0].pm25 = 42
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => retained })
      .mockResolvedValueOnce({ ok: true, json: async () => latest }))
    feeds.getAqi.mockImplementation(signal => api.getAqi(signal))
    await act(async () => { mount(); await Promise.resolve() })
    expect(summary().loading).toBe(false)
    expect(summary().staleFeeds.find((feed: { label: string }) => feed.label === 'aqi').generatedAt).toBe(retained.generated_at)

    await act(async () => { await vi.advanceTimersByTimeAsync(50_000) })
    let resolveWind!: (value: unknown) => void
    feeds.getWind.mockImplementationOnce(() => new Promise(resolve => { resolveWind = resolve }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh data' })); await Promise.resolve() })
    expect(summary().refreshing).toBe(true)
    expect(api.getStaleFeeds().some(feed => feed.label === 'aqi')).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(summary().pm25).toBe(retained.stations[0].pm25)
    expect(summary().staleFeeds.find((feed: { label: string }) => feed.label === 'aqi').generatedAt).toBe(retained.generated_at)

    await act(async () => { resolveWind(fixture('wind.json')); await Promise.resolve() })
    expect(summary().refreshing).toBe(false)
    expect(summary().pm25).toBe(42)
    expect(summary().staleFeeds.some((feed: { label: string }) => feed.label === 'aqi')).toBe(false)
  })
})
