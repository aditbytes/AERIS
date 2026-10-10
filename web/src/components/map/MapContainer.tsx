/** Dashboard map: real candidate markers, uncalibrated corridors and observed station cells. */

import { Map, Marker, Popup, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Layers, Maximize2 } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskLabel } from '@/types/schemas'
import { createThermalMarkerElement, createThermalPopupHtml } from './thermalMarker'
import { getStyleForMode, setupMapLayers, applyProjectionAndPitch, isValidSubcontinentCoord } from './mapStyles'
import TimeControls from './TimeControls'
import HeatmapControls from './HeatmapControls'
import { useObservationHeatmap } from './useObservationHeatmap'
import { useScientificLayers } from './useScientificLayers'
import { escapeHtml } from './html'
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
    aqi,
    loading,
    feedErrors,
    corridor,
    timeHorizon,
    selectedSiteId,
    rankedSites,
    setSelectedSiteId,
    setActiveTab,
    flyToLocation,
    basemapMode,
    setBasemapMode,
  } = useAeris()

  const initialMode = useRef(basemapMode)
  const appliedStyleMode = useRef(basemapMode)
  // ── 1. Initialize map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitRef.current || !webGlSupported) return
    mapInitRef.current = true

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: getStyleForMode(initialMode.current),
        center: [76.5, 30.0],
        zoom: 6.8,
        minZoom: 3.8,   // Constrain bounds to South Asia / Indian subcontinent
        maxZoom: 18,    // High resolution facility inspection
        maxBounds: [[58.0, 5.0], [100.0, 39.0]],
        pitch: initialMode.current === 'globe' ? 32 : 0,
        bearing: initialMode.current === 'globe' ? -6 : 0,
        attributionControl: { compact: true },
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
        setupMapLayers(map, initialMode.current)
        applyProjectionAndPitch(map, initialMode.current)
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
    // The constructor already applied the initial style. Replacing it while
    // it loads can race the initial scientific sources and camera setup.
    if (appliedStyleMode.current === basemapMode) return
    appliedStyleMode.current = basemapMode

    const onStyleLoad = () => {
      setupMapLayers(map, basemapMode)
      applyProjectionAndPitch(map, basemapMode)
    }
    map.once('style.load', onStyleLoad)
    map.setStyle(getStyleForMode(basemapMode), { diff: false })
    return () => { map.off('style.load', onStyleLoad) }
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

    if (count > 0) {
      if (minLon === maxLon) { minLon -= 0.05; maxLon += 0.05 }
      if (minLat === maxLat) { minLat -= 0.05; maxLat += 0.05 }
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

  const heatmap = useObservationHeatmap(aqi, mapRef, webGlSupported)
  useScientificLayers(mapRef, { mode: basemapMode, corridor, horizon: timeHorizon, heatmap: heatmap.data, heatmapEnabled: heatmap.enabled, opacity: heatmap.opacity, supported: webGlSupported })

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
          el.title = `${site.name} (${label} relative risk (uncalibrated))`

          const marker = new Marker({ element: el, anchor: 'center' })
            .setLngLat([site.lon, site.lat])
            .setPopup(
              new Popup({ offset: 16, closeButton: false, className: 'aeris-popup' })
                .setHTML(`
                  <div class="popup-content">
                    <strong>${escapeHtml(site.name)}</strong>
                    <div>${isSchool ? '🏫 School' : '🏥 Hospital'} • <span style="color:#C92A2A;font-weight:700">${label} relative risk (uncalibrated)</span></div>
                    <div>⏱️ Model ETA (forecast-relative): ~${site.eta_hours.toFixed(1)}h</div>
                    <div>💨 Modelled band peak PM2.5: +${site.pm25_delta_ugm3.toFixed(0)} µg/m³</div>
                  </div>
                `)
            )
            .addTo(map)

          markersRef.current.push(marker)
        })
    }
    return () => { markersRef.current.forEach(m => m.remove()); markersRef.current = [] }
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
      zoom: flyToLocation.zoom ?? 11,
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
            <div className="map-title">Modelled plume corridors</div>
            <div className="map-subtitle">Uncalibrated baseline · not an observed concentration field</div>
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
              title="Fit Entire India (repository boundary)"
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

      <HeatmapControls data={heatmap.data} enabled={heatmap.enabled} onToggle={heatmap.setEnabled} opacity={heatmap.opacity} onOpacity={heatmap.setOpacity} onFit={webGlSupported ? heatmap.fit : undefined} bounds={webGlSupported ? heatmap.bounds : null} loading={loading} error={feedErrors.aqi} />
      <p className="map-science-note">Forecast start: {corridor?.forecast_start ?? 'unavailable'}. Time controls select cumulative bands; full centrelines and ETA markers remain as forecast context. Modelled band peaks are not uniform receptor concentrations. Facility markers show up to 8 ranked sites; the facility table contains the full list.</p>
      <div className="map-canvas-area" onClick={() => isLayerMenuOpen && setIsLayerMenuOpen(false)}>
        {webGlSupported ? (
          <div ref={mapContainerRef} className="map-canvas" />
        ) : (
          <Suspense fallback={<div className="map-fallback-canvas" />}>
            <SvgFallbackMap sources={sources} rankedSites={rankedSites} scopeFilter={scopeFilter} corridor={corridor} horizon={timeHorizon} heatmap={heatmap.data} heatmapEnabled={heatmap.enabled} opacity={heatmap.opacity} />
          </Suspense>
        )}

        {/* Sleek Top-Right Floating Layer Switcher */}
        {/* Sleek Top-Right Floating Layer Switcher (Stray dot removed) */}
        <div className="map-layer-dock" onKeyDown={e => { if (e.key === 'Escape') setIsLayerMenuOpen(false) }} onClick={(e) => e.stopPropagation()}>
          <button
            className={`map-layer-trigger-btn ${isLayerMenuOpen ? 'active' : ''}`}
            onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
            title={`Basemap Engine: ${basemapMode}`}
            aria-label="Switch Basemap Style"
            aria-expanded={isLayerMenuOpen}
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
                  <strong>Tilted satellite</strong>
                  <small>Mercator · 32° tilt</small>
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
            <span>{sources?.sources.filter(s => isValidSubcontinentCoord(s.lat, s.lon) && (scopeFilter === 'all' || s.territory === 'india')).length ?? 0} source candidates</span>
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
            <span>Repository boundary</span>
          </div>
        </div>
      </div>
    </div>
  )
}
