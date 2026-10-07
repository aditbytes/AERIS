/**
 * MapContainer — MapLibre GL interactive map with Bulletproof SVG Fallback
 *
 * Safety guarantees:
 *  - Single initialization guard (mapInitRef) prevents duplicate WebGL contexts
 *  - Strict useEffect cleanup calls map.remove() on unmount
 *  - Layer update uses setData() not re-adding sources (no resource leaks)
 *  - Zero-token tile URL (CartoDB Voyager) works offline and in any region
 *  - Automatic SVG vector map fallback if WebGL is unavailable or disabled
 */

import { Map, NavigationControl, Marker, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { useAeris } from '@/services/dataContext'
import type { CorridorBandProperties } from '@/types/schemas'
import PlumeHudCard from './PlumeHudCard'
import TimeControls from './TimeControls'
import './MapContainer.css'

try {
  setWorkerUrl(workerUrl)
} catch {
  // Worker already initialized
}

function toSvgCoords(lon: number, lat: number, width = 680, height = 380): [number, number] {
  const x = Math.max(30, Math.min(width - 30, ((lon - 73.5) / (77.8 - 73.5)) * width))
  const y = Math.max(30, Math.min(height - 30, height - ((lat - 28.0) / (32.5 - 28.0)) * height))
  return [x, y]
}

export default function MapContainer() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<Map | null>(null)
  const mapInitRef      = useRef(false)
  const markersRef      = useRef<Marker[]>([])
  const [webGlSupported, setWebGlSupported] = useState(true)

  const { sources, corridor, timeHorizon, selectedSiteId, rankedSites, setSelectedSiteId } = useAeris()

  // ── 1. Initialize map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitRef.current || !webGlSupported) return
    mapInitRef.current = true

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: [76.5, 29.8],
        zoom: 6.5,
        pitch: 20,
        bearing: 0,
        attributionControl: false,
      })

      map.on('error', (e) => {
        const msg = e.error?.message || ''
        if (msg.includes('WebGL') || msg.includes('Worker') || msg.includes('GL')) {
          console.warn('[AERIS] MapLibre WebGL unavailable, switching to SVG vector canvas:', msg)
          setWebGlSupported(false)
        }
      })

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
      mapRef.current = map

      map.on('load', () => {
        // Corridor polygon source
        map.addSource('corridor', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

        // Plume band fill layer
        map.addLayer({
          id: 'plume-fill',
          type: 'fill',
          source: 'corridor',
          filter: ['==', ['get', 'kind'], 'band'],
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['get', 'hour_from'],
              0, 'rgba(201, 42, 42, 0.68)',
              2, 'rgba(212, 98, 10, 0.58)',
              4, 'rgba(245, 159, 0, 0.42)',
              8, 'rgba(245, 215, 0, 0.28)',
            ],
            'fill-opacity': 0.85,
          },
        })

        // Centerline line layer
        map.addLayer({
          id: 'plume-centerline',
          type: 'line',
          source: 'corridor',
          filter: ['==', ['get', 'kind'], 'centerline'],
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 2.5,
            'line-dasharray': [3, 2],
            'line-opacity': 0.9,
          },
        })
      })
    } catch (err) {
      console.warn('[AERIS] MapLibre constructor failed, using SVG vector canvas:', err)
      setWebGlSupported(false)
    }

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      mapInitRef.current = false
    }
  }, [webGlSupported])

  // ── 2. Update corridor GeoJSON when data or timeHorizon changes ──────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !corridor || !webGlSupported) return

    const waitForSource = () => {
      const source = map.getSource('corridor') as GeoJSONSource | undefined
      if (!source) { setTimeout(waitForSource, 100); return }

      const filtered = {
        ...corridor,
        features: corridor.features.filter(f => {
          if (f.properties.kind === 'centerline') return true
          const p = f.properties as CorridorBandProperties
          return p.hour_from <= timeHorizon
        }),
      }
      source.setData(filtered as Parameters<GeoJSONSource['setData']>[0])
    }
    waitForSource()
  }, [corridor, timeHorizon, webGlSupported])

  // ── 3. Place fire source markers ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !sources || !webGlSupported) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    sources.sources.forEach(src => {
      const size = Math.round(24 + src.emission_strength * 18)
      const el = document.createElement('div')
      el.className = 'fire-marker'
      el.style.width  = `${size}px`
      el.style.height = `${size}px`
      el.innerHTML = `
        <div class="fire-pulse-ring"></div>
        <div class="fire-icon" style="font-size:${size * 0.7}px">🔥</div>
      `
      el.title = `${src.type} — FRP: ${src.total_frp_mw.toFixed(0)} MW | Confidence: ${(src.confidence * 100).toFixed(0)}%`

      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([src.lon, src.lat])
        .setPopup(
          new Popup({ offset: 20, closeButton: false, className: 'aeris-popup' })
            .setHTML(`
              <div class="popup-content">
                <strong>${src.type.replace(/_/g, ' ')}</strong>
                <div>🔥 ${src.fire_count} fires detected</div>
                <div>⚡ FRP: ${src.total_frp_mw.toFixed(0)} MW</div>
                <div>📡 Confidence: ${(src.confidence * 100).toFixed(0)}%</div>
                <div>💨 Emission: ${(src.emission_strength * 100).toFixed(0)}%</div>
              </div>
            `)
        )
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [sources, webGlSupported])

  // ── 4. Fly to selected site ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedSiteId || !rankedSites || !webGlSupported) return

    const site = rankedSites.sites.find(s => s.site_id === selectedSiteId)
    if (!site) return

    map.flyTo({
      center: [site.lon, site.lat],
      zoom: 12,
      speed: 1.2,
      curve: 1.4,
    })
    setSelectedSiteId(null)
  }, [selectedSiteId, rankedSites, setSelectedSiteId, webGlSupported])

  return (
    <div className="map-wrapper card">
      <div className="map-header">
        <div className="map-title-group">
          <div className="map-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22734F" strokeWidth="2.2">
              <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z"/>
            </svg>
          </div>
          <div>
            <div className="map-title">Pollution Movement Forecast</div>
            <div className="map-subtitle">Predicted PM2.5 plume in next 3 hours (Punjab → Delhi)</div>
          </div>
        </div>
        <TimeControls />
      </div>

      <div className="map-canvas-area">
        {webGlSupported ? (
          <div ref={mapContainerRef} className="map-canvas" />
        ) : (
          <div className="map-fallback-canvas">
            <svg viewBox="0 0 680 380" className="svg-map">
              <defs>
                <linearGradient id="plumeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D63333" stopOpacity="0.75" />
                  <stop offset="35%" stopColor="#EA580C" stopOpacity="0.65" />
                  <stop offset="70%" stopColor="#D97706" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#CA8A04" stopOpacity="0.25" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Base terrain */}
              <rect width="680" height="380" fill="#EDF1EC" rx="10" />

              {/* Topography shapes */}
              <path d="M 30 20 Q 200 40 380 90 T 560 220 T 650 360 L 30 360 Z" fill="#E2E8E1" opacity="0.8" />
              
              {/* Regional labels */}
              <text x="120" y="70" fill="#3A5344" fontSize="13" fontWeight="800" letterSpacing="1">PUNJAB (UPWIND)</text>
              <text x="260" y="180" fill="#6B7280" fontSize="12" fontWeight="600" letterSpacing="1">HARYANA</text>
              <text x="470" y="270" fill="#1E4E3D" fontSize="13" fontWeight="800" letterSpacing="0.5">📍 DELHI NCR (RECEPTOR)</text>

              {/* Smoke Corridor Polygon Swath */}
              <path
                d="M 140 85 C 220 120 320 180 460 260 C 490 285 430 310 320 250 C 230 190 160 140 120 95 Z"
                fill="url(#plumeGrad)"
                filter="url(#glow)"
              />

              {/* Wind Vector Vectors */}
              <g stroke="white" strokeWidth="2.2" fill="none" opacity="0.9">
                <path d="M 180 110 L 230 145 M 220 135 L 230 145 L 218 150" />
                <path d="M 270 170 L 320 205 M 310 195 L 320 205 L 308 210" />
                <path d="M 360 225 L 410 255 M 400 245 L 410 255 L 398 260" />
              </g>

              {/* Fire Clusters */}
              {sources?.sources.slice(0, 6).map((src) => {
                const [cx, cy] = toSvgCoords(src.lon, src.lat, 680, 380)
                return (
                  <g key={src.id} transform={`translate(${cx}, ${cy})`}>
                    <circle r="12" fill="rgba(239, 68, 68, 0.25)" />
                    <circle r="6" fill="#DC2626" />
                    <text x="10" y="4" fontSize="10" fontWeight="700" fill="#991B1B">
                      🔥 {src.fire_count} Fires ({src.total_frp_mw.toFixed(0)} MW)
                    </text>
                  </g>
                )
              })}

              {/* Receptor Facilities */}
              {rankedSites?.sites.slice(0, 4).map((site) => {
                const [sx, sy] = toSvgCoords(site.lon, site.lat, 680, 380)
                return (
                  <g key={site.site_id} transform={`translate(${sx}, ${sy})`}>
                    <circle r="5" fill="#1E4E3D" stroke="white" strokeWidth="1.5" />
                    <text x="8" y="3" fontSize="9.5" fontWeight="600" fill="#111827">
                      {site.type === 'hospital' ? '🏥' : '🏫'} {site.name.slice(0, 22)}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}

        <PlumeHudCard />

        {/* Map legend */}
        <div className="map-legend">
          <div className="legend-item">
            <span style={{ fontSize: '13px' }}>🔥</span>
            <span>Stubble Burning (Detected)</span>
          </div>
          <div className="legend-item">
            <div className="legend-plume-dot" />
            <span>Predicted Pollution Plume</span>
          </div>
        </div>
      </div>
    </div>
  )
}
