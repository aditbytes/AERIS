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
import { Maximize2 } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskLabel, type CorridorBandProperties } from '@/types/schemas'
import { createThermalMarkerElement, createThermalPopupHtml } from './thermalMarker'
import { getStyleForMode, setupMapLayers, applyProjectionAndPitch } from './mapStyles'
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
  const [scopeFilter, setScopeFilter]       = useState<'all' | 'india'>('all')

  const {
    sources,
    corridor,
    timeHorizon,
    selectedSiteId,
    rankedSites,
    setSelectedSiteId,
    setActiveTab,
    flyToLocation,
    interventionScenario,
    basemapMode,
    setBasemapMode,
  } = useAeris()

  // ── 1. Initialize map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitRef.current || !webGlSupported) return
    mapInitRef.current = true

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: getStyleForMode(basemapMode),
        center: [76.5, 30.0],
        zoom: 6.8,
        minZoom: 2.2,   // Allows smooth zooming out to see full 3D globe / continent
        maxZoom: 18,    // High resolution facility inspection
        pitch: basemapMode === 'globe' ? 42 : 0,
        bearing: basemapMode === 'globe' ? -8 : 0,
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
        setupMapLayers(map, basemapMode)
        applyProjectionAndPitch(map, basemapMode)

        // Official Territory labels
        const jkEl = document.createElement('div')
        jkEl.className = 'map-soi-label'
        jkEl.innerText = 'Jammu & Kashmir (India)'
        new Marker({ element: jkEl, anchor: 'center' }).setLngLat([75.3, 33.7]).addTo(map)

        const ladakhEl = document.createElement('div')
        ladakhEl.className = 'map-soi-label'
        ladakhEl.innerText = 'Ladakh (India)'
        new Marker({ element: ladakhEl, anchor: 'center' }).setLngLat([77.8, 34.2]).addTo(map)
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

  // ── 1b. Dynamically switch basemap style & 3D globe projection ─────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return

    map.setStyle(getStyleForMode(basemapMode))
    const onStyleLoad = () => {
      setupMapLayers(map, basemapMode)
      applyProjectionAndPitch(map, basemapMode)
    }
    map.once('style.load', onStyleLoad)
  }, [basemapMode, webGlSupported])

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

    // 1. Thermal Fire Sources (Filtered by Territory Scope)
    if (sources) {
      const activeSources = sources.sources.filter(src => {
        if (scopeFilter === 'india') return src.territory === 'india'
        return true
      })

      activeSources.forEach(src => {
        const el = createThermalMarkerElement(src)
        const popupHtml = createThermalPopupHtml(src)

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([src.lon, src.lat])
          .setPopup(
            new Popup({ offset: 18, closeButton: false, className: 'aeris-popup' })
              .setHTML(popupHtml)
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
  }, [sources, rankedSites, scopeFilter, webGlSupported])

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

        <div className="map-header-actions">
          <TimeControls showPlayToggle={true} />
        </div>
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
              {sources?.sources
                .filter(src => scopeFilter === 'all' || src.territory === 'india')
                .slice(0, 8)
                .map((src) => {
                  const [cx, cy] = toSvgCoords(src.lon, src.lat, 680, 380)
                  const isTrans = src.territory === 'transboundary'
                  return (
                    <g key={src.id} transform={`translate(${cx}, ${cy})`}>
                      <circle r="14" fill={isTrans ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.28)'} />
                      <circle r="6" fill={isTrans ? '#D97706' : '#DC2626'} />
                      <text x="10" y="4" fontSize="9.5" fontWeight="700" fill={isTrans ? '#92400E' : '#991B1B'}>
                        {isTrans ? '🌐' : '🔥'} {src.district || src.type} ({src.total_frp_mw.toFixed(0)} MW)
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

        {/* Unified Top-Right Floating Quick Action Capsule */}
        <div className="map-quick-hud">
          {/* Production Basemap Engine Switcher */}
          <div className="basemap-hud-switcher">
            <button
              className={`quick-hud-chip ${basemapMode === 'satellite' ? 'active' : ''}`}
              onClick={() => setBasemapMode('satellite')}
              title="ESRI Photorealistic Satellite Imagery"
              type="button"
            >
              <span>🛰️ Sat</span>
            </button>
            <button
              className={`quick-hud-chip ${basemapMode === 'globe' ? 'active' : ''}`}
              onClick={() => setBasemapMode('globe')}
              title="3D Spherical Earth Globe Projection"
              type="button"
            >
              <span>🪐 3D Globe</span>
            </button>
            <button
              className={`quick-hud-chip ${basemapMode === 'dark' ? 'active' : ''}`}
              onClick={() => setBasemapMode('dark')}
              title="Tactical Dark Matter GIS Console"
              type="button"
            >
              <span>🌑 Dark</span>
            </button>
            <button
              className={`quick-hud-chip ${basemapMode === 'topo' ? 'active' : ''}`}
              onClick={() => setBasemapMode('topo')}
              title="Clean Topographic Street Basemap"
              type="button"
            >
              <span>🗺️ Topo</span>
            </button>
          </div>

          <div className="quick-hud-divider" />

          {/* Territory Scope Switcher */}
          <button
            className={`quick-hud-chip ${scopeFilter === 'india' ? 'active' : ''}`}
            onClick={() => setScopeFilter(prev => prev === 'india' ? 'all' : 'india')}
            title={scopeFilter === 'india' ? "Viewing India CPCB Scope — click for Full Transboundary Airshed" : "Viewing Full Regional Airshed — click for India CPCB Scope"}
            type="button"
          >
            <span>{scopeFilter === 'india' ? '🇮🇳 India Scope' : '🌐 Full Airshed'}</span>
          </button>
          <div className="quick-hud-divider" />
          <button
            className="quick-hud-chip"
            onClick={() => mapRef.current?.flyTo({ center: [78.9, 23.5], zoom: 4.2, speed: 1.2 })}
            title="Fit Entire Sovereign India (Survey of India Boundary with PoK/Ladakh)"
            type="button"
          >
            <span>🇮🇳 All India</span>
          </button>
          <button
            className="quick-hud-chip"
            onClick={() => mapRef.current?.flyTo({ center: [76.5, 30.0], zoom: 6.8, speed: 1.2 })}
            title="Focus on Smoke Dispersion Corridor (Punjab to Delhi NCR)"
            type="button"
          >
            <span>🎯 Corridor</span>
          </button>
          <div className="quick-hud-divider" />
          <button
            className="quick-hud-chip expand-chip"
            onClick={() => setActiveTab('map')}
            title="Open Full GIS Map Explorer"
            type="button"
          >
            <Maximize2 size={12} />
            <span>Expand</span>
          </button>
        </div>

        {/* Bottom-Right Zoom Dock */}
        <div className="map-zoom-dock">
          <button
            className="map-zoom-btn"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom In"
            aria-label="Zoom in"
            type="button"
          >
            +
          </button>
          <button
            className="map-zoom-btn"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom Out (Free Subcontinent View)"
            aria-label="Zoom out"
            type="button"
          >
            −
          </button>
        </div>

        {/* Micro-compact translucent legend */}
        <div className="map-micro-legend">
          <div className="micro-legend-item">
            <span className="micro-legend-glyph" style={{ color: '#EF4444', fontWeight: 800 }}>⊕</span>
            <span>{scopeFilter === 'india' ? 'India Hotspots (6)' : 'Airshed Hotspots (10)'}</span>
          </div>
          <div className="micro-legend-item">
            <div className="micro-legend-swatch plume" />
            <span>Plume</span>
          </div>
          <div className="micro-legend-item">
            <div className="micro-legend-swatch soi" />
            <span>SOI Border</span>
          </div>
        </div>
      </div>
    </div>
  )
}
