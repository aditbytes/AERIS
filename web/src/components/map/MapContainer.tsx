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
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Layers, Maximize2 } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskLabel, type CorridorBandProperties } from '@/types/schemas'
import { createThermalMarkerElement, createThermalPopupHtml } from './thermalMarker'
import { getStyleForMode, setupMapLayers, applyProjectionAndPitch, isValidSubcontinentCoord } from './mapStyles'
import TimeControls from './TimeControls'
import './MapContainer.css'

const SvgFallbackMap = lazy(() => import('./SvgFallbackMap'))

try {
  setWorkerUrl(workerUrl)
} catch {
  // Worker already initialized
}

export default function MapContainer() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<Map | null>(null)
  const mapInitRef      = useRef(false)
  const markersRef      = useRef<Marker[]>([])
  const [webGlSupported, setWebGlSupported] = useState(true)
  const [scopeFilter, setScopeFilter]       = useState<'all' | 'india'>('all')
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false)

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
        minZoom: 3.8,   // Constrain bounds to South Asia / Indian subcontinent
        maxZoom: 18,    // High resolution facility inspection
        maxBounds: [[58.0, 5.0], [100.0, 39.0]],
        pitch: basemapMode === 'globe' ? 32 : 0,
        bearing: basemapMode === 'globe' ? -6 : 0,
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

  // ── Auto-fit bounds to active corridor + sources + top receptors ──────────
  const hasFittedInitialBoundsRef = useRef(false)

  const fitAirshedBounds = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
    let count = 0

    const addPoint = (lon: number, lat: number) => {
      if (isValidSubcontinentCoord(lat, lon)) {
        minLon = Math.min(minLon, lon)
        minLat = Math.min(minLat, lat)
        maxLon = Math.max(maxLon, lon)
        maxLat = Math.max(maxLat, lat)
        count++
      }
    }

    // Include sources
    sources?.sources.forEach(s => addPoint(s.lon, s.lat))
    // Include top 8 receptors
    rankedSites?.sites.slice(0, 8).forEach(s => addPoint(s.lon, s.lat))
    // Include corridor coordinates
    corridor?.features.forEach(f => {
      if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
        f.geometry.coordinates.forEach((c: number[]) => addPoint(c[0], c[1]))
      }
    })

    if (count > 0 && minLon < maxLon && minLat < maxLat) {
      map.fitBounds(
        [[minLon, minLat], [maxLon, maxLat]],
        {
          padding: { top: 40, bottom: 40, left: 40, right: 40 },
          maxZoom: 9.5,
          duration: 900,
        }
      )
    }
  }, [sources, rankedSites, corridor])

  // Fit bounds automatically on first data availability
  useEffect(() => {
    if (hasFittedInitialBoundsRef.current || !mapRef.current || !webGlSupported) return
    if ((sources?.sources.length ?? 0) > 0 || (corridor?.features.length ?? 0) > 0) {
      fitAirshedBounds()
      hasFittedInitialBoundsRef.current = true
    }
  }, [sources, corridor, fitAirshedBounds, webGlSupported])

  // ── 2. Update corridor GeoJSON and ETA ticks when data or timeHorizon changes ──
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

      // Update centerline milestone ETA ticks (+2h, +4h, +8h, +12h, +18h, +24h)
      const etaSource = map.getSource('corridor-eta') as GeoJSONSource | undefined
      if (etaSource) {
        const centerline = corridor.features.find(f => f.properties.kind === 'centerline')
        type PointFeature = {
          type: 'Feature'
          geometry: { type: 'Point'; coordinates: number[] }
          properties: { eta: number; label: string }
        }
        const etaFeatures: PointFeature[] = []
        if (centerline && Array.isArray(centerline.geometry?.coordinates)) {
          const coords = centerline.geometry.coordinates as number[][]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const etas = (centerline.properties as any).points_eta_hours || []
          etas.forEach((eta: number, idx: number) => {
            if ([2, 4, 8, 12, 18, 24].includes(eta) && coords[idx]) {
              etaFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coords[idx] },
                properties: { eta, label: `+${eta}h` },
              })
            }
          })
        }
        etaSource.setData({ type: 'FeatureCollection', features: etaFeatures } as Parameters<GeoJSONSource['setData']>[0])
      }
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

    // 1. Thermal Fire Sources (Filtered by Territory Scope and Validated Bounds)
    if (sources) {
      const activeSources = sources.sources.filter(src => {
        if (!isValidSubcontinentCoord(src.lat, src.lon)) return false
        if (scopeFilter === 'india') return src.territory === 'india'
        return true
      })

      // Identify single peak emitter cluster to highlight cleanly without stacking
      let peakSourceId: string | null = null
      if (activeSources.length > 0) {
        const sorted = [...activeSources].sort((a, b) => b.total_frp_mw - a.total_frp_mw)
        peakSourceId = sorted[0].id
      }

      activeSources.forEach(src => {
        const isPeak = src.id === peakSourceId
        const el = createThermalMarkerElement(src, { isPeak })
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
      rankedSites.sites
        .filter(site => isValidSubcontinentCoord(site.lat, site.lon))
        .slice(0, 8)
        .forEach(site => {
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
    if (!site || !isValidSubcontinentCoord(site.lat, site.lon)) return

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
    if (!isValidSubcontinentCoord(flyToLocation.lat, flyToLocation.lon)) return

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
          {/* Preset Camera Bookmarks in Card Header */}
          <div className="map-header-presets">
            <button
              className="map-header-chip"
              onClick={fitAirshedBounds}
              title="Focus on Active Smoke Dispersion Airshed (Punjab to NCR)"
              type="button"
            >
              <span>🎯 Airshed</span>
            </button>
            <button
              className="map-header-chip"
              onClick={() => mapRef.current?.flyTo({ center: [78.9, 22.8], zoom: 4.4, speed: 1.2 })}
              title="Fit Entire Sovereign India (Survey of India Boundary with PoK/Ladakh)"
              type="button"
            >
              <span>🇮🇳 All India</span>
            </button>
          </div>

          <div className="map-header-divider" />

          <TimeControls showPlayToggle={true} />
          <button
            className="map-header-expand-btn"
            onClick={() => setActiveTab('map')}
            title="Open Full GIS Map Explorer"
            type="button"
          >
            <Maximize2 size={13} />
            <span>Full Map</span>
          </button>
        </div>
      </div>

      <div className="map-canvas-area" onClick={() => isLayerMenuOpen && setIsLayerMenuOpen(false)}>
        {webGlSupported ? (
          <div ref={mapContainerRef} className="map-canvas" />
        ) : (
          <Suspense fallback={<div className="map-fallback-canvas" />}>
            <SvgFallbackMap sources={sources} rankedSites={rankedSites} scopeFilter={scopeFilter} />
          </Suspense>
        )}

        {/* Sleek Top-Right Floating Layer Switcher */}
        {/* Sleek Top-Right Floating Layer Switcher (Stray dot removed) */}
        <div className="map-layer-dock" onClick={(e) => e.stopPropagation()}>
          <button
            className={`map-layer-trigger-btn ${isLayerMenuOpen ? 'active' : ''}`}
            onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
            title={`Basemap Engine: ${basemapMode}`}
            aria-label="Switch Basemap Style"
            type="button"
          >
            <Layers size={14} />
          </button>

          {isLayerMenuOpen && (
            <div className="map-layer-dropdown">
              <div className="layer-dropdown-header">Basemap Engine</div>
              <button
                className={`layer-dropdown-item ${basemapMode === 'satellite' ? 'active' : ''}`}
                onClick={() => { setBasemapMode('satellite'); setIsLayerMenuOpen(false); }}
                type="button"
              >
                <span className="item-icon">🛰️</span>
                <div className="item-text">
                  <strong>Satellite</strong>
                  <small>ESRI Photorealistic</small>
                </div>
              </button>
              <button
                className={`layer-dropdown-item ${basemapMode === 'globe' ? 'active' : ''}`}
                onClick={() => { setBasemapMode('globe'); setIsLayerMenuOpen(false); }}
                type="button"
              >
                <span className="item-icon">🪐</span>
                <div className="item-text">
                  <strong>3D Globe</strong>
                  <small>Spherical Earth</small>
                </div>
              </button>
              <button
                className={`layer-dropdown-item ${basemapMode === 'dark' ? 'active' : ''}`}
                onClick={() => { setBasemapMode('dark'); setIsLayerMenuOpen(false); }}
                type="button"
              >
                <span className="item-icon">🌑</span>
                <div className="item-text">
                  <strong>Dark GIS</strong>
                  <small>Night console</small>
                </div>
              </button>
              <button
                className={`layer-dropdown-item ${basemapMode === 'topo' ? 'active' : ''}`}
                onClick={() => { setBasemapMode('topo'); setIsLayerMenuOpen(false); }}
                type="button"
              >
                <span className="item-icon">🗺️</span>
                <div className="item-text">
                  <strong>Topographic</strong>
                  <small>Cartographic roads</small>
                </div>
              </button>
            </div>
          )}
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

        {/* Micro-compact translucent legend with clear 4-band corridor color ramp & ETA */}
        <div className="map-micro-legend">
          <button
            className={`micro-legend-scope-btn ${scopeFilter === 'india' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setScopeFilter(prev => prev === 'india' ? 'all' : 'india')
            }}
            title={scopeFilter === 'india' ? "Viewing India Scope — click for Full Regional Airshed" : "Viewing Full Airshed — click for India Scope"}
            type="button"
          >
            <span>{scopeFilter === 'india' ? '🇮🇳 India Scope' : '🌐 Full Airshed'}</span>
          </button>
          <div className="micro-legend-divider" />
          <div className="micro-legend-item">
            <span className="micro-legend-glyph" style={{ color: '#EF4444', fontWeight: 800 }}>⊕</span>
            <span>{scopeFilter === 'india' ? '6 Fires' : '10 Fires'}</span>
          </div>
          <div className="micro-legend-item" title="0–2h immediate plume arrival band">
            <span className="micro-legend-swatch" style={{ background: '#DC2626', width: 8, height: 7 }} />
            <span>0-2h</span>
          </div>
          <div className="micro-legend-item" title="2–4h dispersion corridor band">
            <span className="micro-legend-swatch" style={{ background: '#EA580C', width: 8, height: 7 }} />
            <span>2-4h</span>
          </div>
          <div className="micro-legend-item" title="4–8h forward plume band">
            <span className="micro-legend-swatch" style={{ background: '#D97706', width: 8, height: 7 }} />
            <span>4-8h</span>
          </div>
          <div className="micro-legend-item" title="8–24h downstream dispersion band">
            <span className="micro-legend-swatch" style={{ background: '#CA8A04', width: 8, height: 7 }} />
            <span>8-24h</span>
          </div>
          <div className="micro-legend-item" title="Centerline with milestone ETA ticks">
            <span style={{ color: 'var(--brand-dark)', fontWeight: 800, fontSize: '9px', letterSpacing: '-1px' }}>---</span>
            <span>ETA</span>
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
