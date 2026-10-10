import { act, renderHook } from '@testing-library/react'
import type { Map as LibreMap } from 'maplibre-gl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AqiFile } from '../../types/schemas'
import { useObservationHeatmap } from './useObservationHeatmap'

const aqi: AqiFile = {
  generated_at: '2026-10-10T06:00:00Z',
  stations: [{ id: 'test-only', name: 'Lifecycle regression', lat: 28.61, lon: 77.21, source: 'test-only', pm25: 0, observed_at: '2026-10-10T06:00:00Z' }],
}
function testMap() {
  const listeners = new Map<string, Set<() => void>>()
  const fitBounds = vi.fn()
  const map = {
    loaded: () => false, fitBounds,
    getBounds: () => ({ getWest: () => 77, getSouth: () => 28, getEast: () => 78, getNorth: () => 29 }),
    on: (event: string, listener: () => void) => { const list = listeners.get(event) ?? new Set(); list.add(listener); listeners.set(event, list) },
    off: (event: string, listener: () => void) => listeners.get(event)?.delete(listener),
  }
  return { ref: { current: map as unknown as LibreMap }, fitBounds, listeners }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('observation map lifecycle', () => {
  it('waits for initial map load before offering fit, then fits reported cell bounds', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-10T06:00:00Z')
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const map = testMap()
    const { result, unmount } = renderHook(() => useObservationHeatmap(aqi, map.ref, true))
    expect(result.current.fit).toBeUndefined()
    expect(map.fitBounds).not.toHaveBeenCalled()
    act(() => { for (const loaded of map.listeners.get('load')!) loaded() })
    act(() => result.current.fit!())
    expect(map.fitBounds).toHaveBeenCalledWith([[77.2, 28.6], [77.3, 28.7]], { padding: 35, maxZoom: 11, duration: 0 })
    unmount()
    expect(map.listeners.get('load')?.size).toBe(0)
  })
  it('updates stale observation age and cleans up viewport listeners and its clock', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-10T06:00:00Z')
    const map = testMap()
    const { result, unmount } = renderHook(() => useObservationHeatmap(aqi, map.ref, true))
    expect(result.current.data.staleCount).toBe(0)
    act(() => result.current.setEnabled(true))
    expect(result.current.bounds).toEqual([77, 28, 78, 29])
    expect(map.listeners.get('moveend')?.size).toBe(1)
    act(() => vi.advanceTimersByTime(91 * 60_000))
    expect(result.current.data.staleCount).toBe(1)
    act(() => result.current.setEnabled(false))
    expect(map.listeners.get('moveend')?.size).toBe(0)
    unmount()
    expect([...map.listeners.values()].every(set => set.size === 0)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
