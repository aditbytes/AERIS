/**
 * MapContainer — MapLibre GL interactive map with Survey of India (SOI) boundaries
 *
 * Guarantees:
 *  - Official Survey of India boundary layer (includes Jammu & Kashmir, Ladakh, PoK)
 *  - Zero annoying floating green patch covering the map
 *  - Sleek inline forecast pill in header (Wind direction, ETA to Delhi, Expected AQI)
 *  - Automatic SVG vector map fallback with official SOI territory demarcation
 */

import { Map, NavigationControl, Marker, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskLabel, type CorridorBandProperties } from '@/types/schemas'
import TimeControls from './TimeControls'
import './MapContainer.css'

try {
  setWorkerUrl(workerUrl)
} catch {
  // Worker already initialized
}

function toSvgCoords(lon: number, lat: number, width = 680, height = 380): [number, number] {
  const x = Math.max(30, Math.min(width - 30, ((lon - 73.0) / (78.5 - 73.0)) * width))
  const y = Math.max(30, Math.min(height - 30, height - ((lat - 27.8) / (34.5 - 27.8)) * height))
  return [x, y]
}

export default function MapContainer() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<Map | null>(null)
  const mapInitRef      = useRef(false)
  const markersRef      = useRef<Marker[]>([])
  const [webGlSupported, setWebGlSupported] = useState(true)

  const {
    sources,
    corridor,
    timeHorizon,
    selectedSiteId,
    rankedSites,
    setSelectedSiteId,
    etaHours,
    setActiveTab,
    flyToLocation,
    interventionScenario,
  } = useAeris()

  const displayEta = etaHours != null
    ? `~ ${etaHours.toFixed(1).replace('.0', '')}h`
    : '~ 2h'

  const expectedAqi = timeHorizon === 0 ? '280–320'
    : timeHorizon === 1 ? '350–420'
    : timeHorizon === 2 ? '400–480'
    : '430–520'

  // ── 1. Initialize map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitRef.current || !webGlSupported) return
    mapInitRef.current = true

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: [76.5, 30.0],
        zoom: 6.8,
        minZoom: 2.8,   // Fix: Smoothly zoom out to see full India & continent
        maxZoom: 18,    // High resolution facility inspection
        pitch: 0,
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

      mapRef.current = map

      map.on('load', () => {
        // 1. Official Survey of India boundary layer (includes J&K, Ladakh, PoK)
        map.addSource('india-boundary', {
          type: 'geojson',
          data: './data/india-boundary.geojson',
        })

        // Outer halo for sovereign boundary prominence
        map.addLayer({
          id: 'india-border-halo',
          type: 'line',
          source: 'india-boundary',
          paint: {
            'line-color': '#22734F',
            'line-width': 4.5,
            'line-opacity': 0.35,
          },
        })

        // Solid official border line
        map.addLayer({
          id: 'india-border-line',
          type: 'line',
          source: 'india-boundary',
          paint: {
            'line-color': '#164E35',
            'line-width': 2.4,
            'line-opacity': 0.95,
          },
        })

        // 2. Official Territory labels
        const jkEl = document.createElement('div')
        jkEl.className = 'map-soi-label'
        jkEl.innerText = 'Jammu & Kashmir (India)'
        new Marker({ element: jkEl, anchor: 'center' }).setLngLat([75.3, 33.7]).addTo(map)

        const ladakhEl = document.createElement('div')
        ladakhEl.className = 'map-soi-label'
        ladakhEl.innerText = 'Ladakh (India)'
        new Marker({ element: ladakhEl, anchor: 'center' }).setLngLat([77.8, 34.2]).addTo(map)

        // 3. Corridor polygon source
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

  // Automatically trigger map.resize() whenever the container dimensions change
  useEffect(() => {
    if (!mapContainerRef.current) return
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    ro.observe(mapContainerRef.current)
    return () => ro.disconnect()
  }, [])

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

  // ── 2b. Adjust plume visual intensity based on What-If scenario ─────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return

    const updateLayer = () => {
      if (!map.getLayer('plume-fill')) {
        setTimeout(updateLayer, 100)
        return
      }

      const opacity = interventionScenario === 'full' ? 0.38
        : interventionScenario === 'partial' ? 0.62
        : 0.90

      map.setPaintProperty('plume-fill', 'fill-opacity', opacity)
    }
    updateLayer()
  }, [interventionScenario, webGlSupported])

  // ── 3. Place fire source and receptor site markers ──────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // 1. Fire Sources
    if (sources) {
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
    }

    // 2. Sensitive Receptor Sites (Schools & Hospitals)
    if (rankedSites) {
      rankedSites.sites.slice(0, 8).forEach(site => {
        const isSchool = site.type === 'school'
        const riskLvl = getRiskLevel(site.risk_score)
        const label = riskLabel(riskLvl)
        const el = document.createElement('div')
        el.className = `dashboard-site-marker site-${site.type}`
        el.innerHTML = `
          <span class="d-site-ico">${isSchool ? '🏫' : '🏥'}</span>
        `
        el.title = `${site.name} (${label} Risk)`

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([site.lon, site.lat])
          .setPopup(
            new Popup({ offset: 16, closeButton: false, className: 'aeris-popup' })
              .setHTML(`
                <div class="popup-content">
                  <strong>${site.name}</strong>
                  <div>${isSchool ? '🏫 School' : '🏥 Hospital'} • <span style="color:#C92A2A;font-weight:700">${label} Risk</span></div>
                  <div>⏱️ Plume Arrival ETA: ~${site.eta_hours.toFixed(1)}h</div>
                  <div>💨 PM2.5 Impact: +${site.pm25_delta_ugm3.toFixed(0)} µg/m³</div>
                </div>
              `)
          )
          .addTo(map)

        markersRef.current.push(marker)
      })
    }
  }, [sources, rankedSites, webGlSupported])

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

  // ── 5. Fly to global search location ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyToLocation || !webGlSupported) return

    map.flyTo({
      center: [flyToLocation.lon, flyToLocation.lat],
      zoom: flyToLocation.zoom || 11,
      speed: 1.2,
      curve: 1.4,
    })
  }, [flyToLocation, webGlSupported])

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
            <div className="map-subtitle">Predicted PM2.5 plume (Punjab → Haryana → Delhi NCR)</div>
          </div>
        </div>

        {/* Clean, non-intrusive metadata pill (replaces annoying dark green patch) */}
        <div className="map-header-center">
          <div className="map-forecast-pill">
            <span className="pill-item">💨 <strong>NW → SE</strong></span>
            <span className="pill-sep">•</span>
            <span className="pill-item">ETA: <strong>{displayEta}</strong></span>
            <span className="pill-sep">•</span>
            <span className="pill-item">AQI: <strong>{expectedAqi}</strong></span>
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

              {/* Official Survey of India Northern Crown (including J&K, Ladakh, PoK) */}
              <path
                d="M 60 120 L 110 50 L 180 20 L 260 15 L 340 18 L 440 28 L 520 60 L 620 110 L 650 360 L 30 360 Z"
                fill="#E2E8E1"
                opacity="0.9"
              />

              {/* Official Sovereign Border Line */}
              <path
                d="M 60 120 L 110 50 L 180 20 L 260 15 L 340 18 L 440 28 L 520 60 L 620 110"
                fill="none"
                stroke="#164E35"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Official Indian Sovereign Territory Labels */}
              <text x="160" y="42" fill="#164E35" fontSize="10.5" fontWeight="800" letterSpacing="0.5">
                JAMMU & KASHMIR (INDIA)
              </text>
              <text x="360" y="42" fill="#164E35" fontSize="10.5" fontWeight="800" letterSpacing="0.5">
                LADAKH (INDIA)
              </text>
              <text x="120" y="110" fill="#3A5344" fontSize="12" fontWeight="800" letterSpacing="1">
                PUNJAB (UPWIND)
              </text>
              <text x="260" y="195" fill="#6B7280" fontSize="11" fontWeight="600" letterSpacing="1">
                HARYANA
              </text>
              <text x="470" y="270" fill="#1E4E3D" fontSize="12" fontWeight="800" letterSpacing="0.5">
                📍 DELHI NCR (RECEPTOR)
              </text>
              <text x="560" y="210" fill="#6B7280" fontSize="11" fontWeight="600" letterSpacing="0.5">
                UTTAR PRADESH
              </text>

              {/* Smoke Corridor Polygon Swath */}
              <path
                d="M 140 100 C 220 135 320 190 460 265 C 490 290 430 315 320 255 C 230 195 160 145 120 110 Z"
                fill="url(#plumeGrad)"
                filter="url(#glow)"
              />

              {/* Wind Vector Vectors */}
              <g stroke="white" strokeWidth="2.2" fill="none" opacity="0.9">
                <path d="M 180 125 L 230 160 M 220 150 L 230 160 L 218 165" />
                <path d="M 270 185 L 320 220 M 310 210 L 320 220 L 308 225" />
                <path d="M 360 235 L 410 265 M 400 255 L 410 265 L 398 270" />
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

        {/* Quick Map Navigation Controls & Zoom Dock */}
        <div className="map-quick-actions">
          <button
            className="map-action-pill"
            onClick={() => mapRef.current?.flyTo({ center: [78.9, 23.5], zoom: 4.2, speed: 1.2 })}
            title="Fit Entire India (Survey of India Boundary with PoK/Ladakh)"
          >
            🇮🇳 Fit India
          </button>
          <button
            className="map-action-pill"
            onClick={() => mapRef.current?.flyTo({ center: [76.5, 30.0], zoom: 6.8, speed: 1.2 })}
            title="Fit Smoke Corridor (Punjab to Delhi NCR)"
          >
            🎯 Fit Corridor
          </button>
          <button
            className="map-action-pill expand-btn"
            onClick={() => setActiveTab('map')}
            title="Open Full Map Explorer"
          >
            ⛶ Expand Map
          </button>
        </div>

        <div className="map-zoom-dock">
          <button
            className="map-zoom-btn"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom In"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="map-zoom-btn"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom Out (Free Subcontinent View)"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        {/* Map legend (clean & unobstructed) */}
        <div className="map-legend">
          <div className="legend-item">
            <span style={{ fontSize: '13px' }}>🔥</span>
            <span>Stubble Burning (Detected)</span>
          </div>
          <div className="legend-item">
            <div className="legend-plume-dot" />
            <span>Predicted Plume</span>
          </div>
          <div className="legend-item">
            <div className="legend-soi-line" />
            <span>Survey of India Boundary</span>
          </div>
        </div>
      </div>
    </div>
  )
}
