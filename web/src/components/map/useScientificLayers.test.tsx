/// <reference types="node" />
import { readFileSync } from 'node:fs'
import type { Map as LibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { CorridorGeoJSONSchema } from '../../types/schemas'
import { buildObservationHeatmap } from './heatmap'
import { useScientificLayers } from './useScientificLayers'

function fakeMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Map<string, unknown>()
  const listeners = new Map<string, Set<() => void>>()
  const removals: string[] = []
  const map = {
    isStyleLoaded: vi.fn(() => true), getStyle: vi.fn((): object | undefined => ({ version: 8, sources: {}, layers: [] })), getSource: (name: string) => sources.get(name), getLayer: (name: string) => layers.get(name),
    addSource: vi.fn((name: string) => sources.set(name, { setData: vi.fn() })),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((name: string) => { removals.push(name); layers.delete(name) }),
    removeSource: vi.fn((name: string) => { removals.push(name); sources.delete(name) }),
    setLayoutProperty: vi.fn(), setPaintProperty: vi.fn(), setStyle: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => { const list = listeners.get(event) ?? new Set(); list.add(listener); listeners.set(event, list) }),
    off: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
  }
  return { map, ref: { current: map as unknown as LibreMap }, sources, layers, listeners, removals }
}

describe('scientific map layer lifecycle', () => {
  const corridor = CorridorGeoJSONSchema.parse(JSON.parse(readFileSync('public/data/corridor.geojson', 'utf8')))
  const heatmap = buildObservationHeatmap(null, Date.parse('2026-10-09T00:00:00Z'))
  const options = { mode: 'satellite' as const, corridor, horizon: 2, heatmap, heatmapEnabled: false, opacity: 0.7, supported: true }
  it('restores actual corridor and all milestones after a style recreates its sources', () => {
    const f = fakeMap()
    const { unmount } = renderHook(() => useScientificLayers(f.ref, options))
    expect(f.sources.get('corridor')!.setData.mock.calls[0][0].features.length).toBeGreaterThan(0)
    f.sources.clear(); f.layers.clear()
    for (const callback of f.listeners.get('style.load')!) callback()
    expect(f.sources.get('corridor')!.setData.mock.calls[0][0].features.length).toBeGreaterThan(0)
    expect(f.sources.get('corridor-eta')!.setData.mock.calls[0][0].features.length).toBeGreaterThan(0)
    unmount()
    expect([...f.listeners.values()].every(list => list.size === 0)).toBe(true)
  })
  it('hides every plume layer without changing basemap or leaving outlines/ETA visible', () => {
    const f = fakeMap()
    const { rerender } = renderHook(({ showPlume }) => useScientificLayers(f.ref, { ...options, showPlume }), { initialProps: { showPlume: true } })
    rerender({ showPlume: false })
    for (const id of ['plume-fill', 'plume-line', 'plume-centerline', 'corridor-eta-circles', 'corridor-eta-labels']) {
      expect(f.map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', 'none')
    }
    expect(f.map.setStyle).not.toHaveBeenCalled()
  })
  it('removes the observation layer before its source when disabled', () => {
    const f = fakeMap()
    const observed = { ...heatmap, samples: 1 }
    const { rerender } = renderHook(({ enabled }) => useScientificLayers(f.ref, { ...options, heatmap: observed, heatmapEnabled: enabled }), { initialProps: { enabled: true } })
    expect(f.sources.has('observed-pm25')).toBe(true)
    rerender({ enabled: false })
    expect(f.removals).toEqual(['observed-pm25-cells', 'observed-pm25'])
    expect(f.sources.has('observed-pm25')).toBe(false)
  })
  it('applies current heatmap, opacity and horizon while initialized style sources are still loading', () => {
    const f = fakeMap()
    const observed = buildObservationHeatmap({ generated_at: '2026-10-09T00:00:00Z', stations: [{ id: 'test-only', name: 'Pending-source regression', lat: 29, lon: 77, pm25: 0, observed_at: '2026-10-09T00:00:00Z', source: 'test-only' }] }, Date.parse('2026-10-09T00:00:00Z'))
    const { rerender, unmount } = renderHook(({ enabled, opacity, horizon }) => useScientificLayers(f.ref, { ...options, heatmap: observed, heatmapEnabled: enabled, opacity, horizon }), { initialProps: { enabled: false, opacity: 0.7, horizon: 2 } })
    // MapLibre reports isStyleLoaded=false while a source worker or tile load
    // is pending, even though its initialized stylesheet permits layer edits.
    f.map.isStyleLoaded.mockReturnValue(false)
    rerender({ enabled: true, opacity: 0.7, horizon: 2 })
    expect(f.sources.has('observed-pm25')).toBe(true)
    rerender({ enabled: true, opacity: 0.4, horizon: 4 })
    expect(f.map.setPaintProperty).toHaveBeenLastCalledWith('observed-pm25-cells', 'fill-opacity', 0.4)
    const rendered = f.sources.get('corridor')!.setData.mock.calls.at(-1)![0]
    expect(rendered.features.some((feature: { properties: { kind: string; hour_from: number } }) => feature.properties.kind === 'band' && feature.properties.hour_from === 4)).toBe(true)
    expect(rendered.features.every((feature: { properties: { kind: string; hour_from: number } }) => feature.properties.kind === 'centerline' || feature.properties.hour_from <= 4)).toBe(true)
    // No data/idle listener may feed every completion back into another setData.
    expect([...f.listeners.keys()].sort()).toEqual(['load', 'style.load'])
    unmount()
    expect([...f.listeners.values()].every(list => list.size === 0)).toBe(true)
  })
  it('waits for stylesheet initialization before adding sources', () => {
    const f = fakeMap()
    f.map.isStyleLoaded.mockReturnValue(false)
    f.map.getStyle.mockReturnValue(undefined)
    renderHook(() => useScientificLayers(f.ref, options))
    expect(f.map.addSource).not.toHaveBeenCalled()
    f.map.getStyle.mockReturnValue({ version: 8, sources: {}, layers: [] })
    for (const callback of f.listeners.get('style.load')!) callback()
    expect(f.sources.has('corridor')).toBe(true)
  })
})
