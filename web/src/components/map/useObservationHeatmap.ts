import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import type { Map } from 'maplibre-gl'
import type { AqiFile } from '../../types/schemas'
import { buildObservationHeatmap, observationBounds } from './heatmap'

export function useObservationHeatmap(aqi: AqiFile | null, mapRef: RefObject<Map | null>, supported: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [opacity, setOpacity] = useState(0.7)
  const [now, setNow] = useState(() => Date.now())
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !supported) return
    const loaded = () => setReady(true)
    map.on('load', loaded)
    if (map.loaded()) loaded()
    return () => { map.off('load', loaded) }
  }, [mapRef, supported])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const data = useMemo(() => buildObservationHeatmap(aqi, now), [aqi, now])
  const fit = useCallback(() => {
    const bounds = observationBounds(data)
    const map = mapRef.current
    if (!map || !bounds || !supported) return
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 35, maxZoom: 11, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 })
  }, [data, mapRef, supported])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !supported || !enabled) return
    const update = () => {
      const b = map.getBounds()
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
    }
    map.on('moveend', update)
    update()
    return () => { map.off('moveend', update) }
  }, [mapRef, supported, enabled])
  return { data, enabled, setEnabled, opacity, setOpacity, bounds, fit: ready ? fit : undefined }
}
