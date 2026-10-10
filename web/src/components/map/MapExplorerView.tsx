/** Map explorer: feed layers, forecast-relative bands, camera controls and real-geometry fallback. */

import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Map, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import {
  ChevronDown,
  Compass,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Shield,
  X,
  Zap,
} from 'lucide-react'
import { useAeris, type TimeHorizon } from '@/services/dataContext'
import { getRiskLevel, riskLabel, type RankedSite } from '@/types/schemas'
import { createThermalMarkerElement } from './thermalMarker'
import { getStyleForMode, setupMapLayers, applyProjectionAndPitch, isValidSubcontinentCoord } from './mapStyles'
import HeatmapControls from './HeatmapControls'
import { useObservationHeatmap } from './useObservationHeatmap'
import { useScientificLayers } from './useScientificLayers'
const SvgFallbackMap = lazy(() => import('./SvgFallbackMap'))
import './MapExplorerView.css'

try {
  setWorkerUrl(workerUrl)
} catch {
  // Worker already set
}

interface InspectorData {
  type: 'fire' | 'school' | 'hospital' | 'station'
  title: string
  subtitle: string
  coords: [number, number]
  metrics: { label: string; value: string | number }[]
  actionText?: string
  siteId?: string
}

export default function MapExplorerView() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<Map | null>(null)
  const mapInitRef      = useRef(false)
  const markersRef      = useRef<Marker[]>([])

  const {
    sources,
    corridor,
    rankedSites,
    aqi,
    wind,
    loading,
    feedErrors,
    timeHorizon,
    setTimeHorizon,
    setShowActionsModal,
    setSelectedSiteId,
    exposedPopulation,
    etaHours,
    basemapMode,
    setBasemapMode,
    flyToLocation,
  } = useAeris()

  const [webGlSupported, setWebGlSupported] = useState(true)
  const [isPlaying, setIsPlaying]           = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<InspectorData | null>(null)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false)
  const [isRegionsOpen, setIsRegionsOpen]   = useState(false)
  const [isFullscreen, setIsFullscreen]     = useState(false)
  const [showLegend, setShowLegend]         = useState(true)

  // Layer Visibility & Territory Scope
  const [showFires, setShowFires]             = useState(true)
  const [fireScopeFilter, setFireScopeFilter] = useState<'all' | 'india' | 'transboundary'>('all')
  const [showPlume, setShowPlume]             = useState(true)
  const [showSchools, setShowSchools]         = useState(true)
  const [showHospitals, setShowHospitals]     = useState(true)
  const [showStations, setShowStations]       = useState(true)
  const [showSoiBorder, setShowSoiBorder]     = useState(true)

  const activeLayerCount = [showFires, showPlume, showSchools, showHospitals, showStations, showSoiBorder].filter(Boolean).length

  // ── Auto-play timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return
    const horizons: TimeHorizon[] = [0, 2, 4, 8, 24]
    const interval = setInterval(() => {
      if (document.hidden) return
      setTimeHorizon((prev) => {
        const curIdx = horizons.indexOf(prev)
        const nextIdx = (curIdx + 1) % horizons.length
        return horizons[nextIdx]
      })
    }, 2200)
    return () => clearInterval(interval)
  }, [isPlaying, setTimeHorizon])

  const initialMode = useRef(basemapMode)
  const appliedStyleMode = useRef(basemapMode)
  // ── 1. Initialize MapLibre ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitRef.current || !webGlSupported) return
    mapInitRef.current = true

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: getStyleForMode(initialMode.current),
        center: [76.5, 30.0],
        zoom: 6.8,
        minZoom: 3.8,   // Constrained bounds to South Asia / Indian subcontinent
        maxZoom: 18,    // High resolution facility & plume inspection
        maxBounds: [[58.0, 5.0], [100.0, 39.0]],
        pitch: initialMode.current === 'globe' ? 32 : 0,
        bearing: initialMode.current === 'globe' ? -6 : 0,
        attributionControl: { compact: true },
      })

      map.on('error', (e) => {
        const msg = e.error?.message || ''
        if (msg.includes('WebGL') || msg.includes('Worker') || msg.includes('GL')) {
          console.warn('[AERIS MapExplorer] Fallback to vector canvas:', msg)
          setWebGlSupported(false)
        }
      })

      mapRef.current = map

      map.on('load', () => {
        setupMapLayers(map, initialMode.current)
        applyProjectionAndPitch(map, initialMode.current)
      })
    } catch (err) {
      console.warn('[AERIS MapExplorer] Constructor failed:', err)
      setWebGlSupported(false)
    }

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      mapInitRef.current = false
    }
  }, [webGlSupported])

  // ── 1c. Fly to location searched in global header ─────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyToLocation || !webGlSupported) return
    if (!isValidSubcontinentCoord(flyToLocation.lat, flyToLocation.lon)) return

    map.flyTo({
      center: [flyToLocation.lon, flyToLocation.lat],
      zoom: flyToLocation.zoom ?? 10.5,
      speed: 1.3,
      curve: 1.4,
    })
  }, [flyToLocation, webGlSupported])

  // Change styles only when the basemap changes, never when a layer toggles.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return
    if (appliedStyleMode.current === basemapMode) return
    appliedStyleMode.current = basemapMode
    const onStyleLoad = () => applyProjectionAndPitch(map, basemapMode)
    map.once('style.load', onStyleLoad)
    map.setStyle(getStyleForMode(basemapMode), { diff: false })
    return () => { map.off('style.load', onStyleLoad) }
  }, [basemapMode, webGlSupported])

  // Automatically trigger map.resize() whenever container bounds resize
  useEffect(() => {
    if (!mapContainerRef.current) return
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    ro.observe(mapContainerRef.current)
    return () => ro.disconnect()
  }, [])

  const heatmap = useObservationHeatmap(aqi, mapRef, webGlSupported)
  useScientificLayers(mapRef, { mode: basemapMode, corridor, horizon: timeHorizon, heatmap: heatmap.data, heatmapEnabled: heatmap.enabled, opacity: heatmap.opacity, showPlume, showBorder: showSoiBorder, supported: webGlSupported })
  const scopedSources = (sources?.sources ?? []).filter(s => isValidSubcontinentCoord(s.lat, s.lon) && (fireScopeFilter === 'all' || s.territory === fireScopeFilter))

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setIsFullscreen(false); setIsLayerPanelOpen(false); setIsRegionsOpen(false); setSelectedFeature(null) } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  // ── 4. Render all interactive markers ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return

    // Clear previous markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // 1. Thermal Fire Sources
    if (showFires && sources) {
      const filteredSources = sources.sources.filter(src => {
        if (!isValidSubcontinentCoord(src.lat, src.lon)) return false
        if (fireScopeFilter === 'india') return src.territory === 'india'
        if (fireScopeFilter === 'transboundary') return src.territory === 'transboundary'
        return true
      })

      let peakSourceId: string | null = null
      if (filteredSources.length > 0) {
        const sorted = [...filteredSources].sort((a, b) => b.total_frp_mw - a.total_frp_mw)
        peakSourceId = sorted[0].id
      }

      filteredSources.forEach(src => {
        const isTransboundary = src.territory === 'transboundary'
        const isSelected = selectedFeature?.type === 'fire' && selectedFeature.title.includes(src.id)
        const isPeak = src.id === peakSourceId

        const el = createThermalMarkerElement(src, {
          isSelected,
          isPeak,
          onClick: () => {
            setSelectedFeature({
              type: 'fire',
              title: `${src.district || src.type.replace(/_/g, ' ')} (${src.id})`,
              subtitle: src.location_name || 'Fire-derived source candidate; classification unconfirmed',
              coords: [src.lon, src.lat],
              metrics: [
                { label: 'Radiative Power (FRP)', value: `${src.total_frp_mw.toFixed(1)} MW` },
                { label: 'Detected Fires', value: `${src.fire_count} hotspots` },
                { label: 'Territory Scope', value: src.territory ?? 'Unavailable' },
                { label: 'Detection Confidence', value: `${(src.confidence * 100).toFixed(0)}% heuristic score (uncalibrated)` },
                { label: 'Normalised emission proxy', value: `${(src.emission_strength * 100).toFixed(0)}% intensity` },
                { label: 'District / Sector', value: src.district || 'Unassigned' },
              ],
              actionText: 'Candidate derived from fire clustering. Thermal detection does not confirm pollution attribution, land use, or measured emissions.',
            })
          },
        })

        el.title = `${src.district || src.type}: ${src.fire_count} fires (${src.total_frp_mw.toFixed(0)} MW) [${isTransboundary ? 'Transboundary' : 'India'}]`

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([src.lon, src.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })
    }

    // 2. Sensitive Receptor Facilities (Schools & Hospitals)
    if (rankedSites) {
      rankedSites.sites
        .filter(site => isValidSubcontinentCoord(site.lat, site.lon) && (site.type === 'school' ? showSchools : showHospitals))
        .slice(0, 12)
        .forEach((site: RankedSite) => {
          const isSchool = site.type === 'school'

          const riskLvl = getRiskLevel(site.risk_score)
          const riskText = riskLabel(riskLvl)
          const el = document.createElement('div')
          el.className = `explorer-site-marker site-${site.type} risk-${riskLvl}`
          el.innerHTML = `
            <span class="site-icon">${isSchool ? '🏫' : '🏥'}</span>
            <span class="site-risk-tag">${riskText}</span>
          `
          el.title = `${site.name} (${riskText} Risk)`

          el.setAttribute('role', 'button')
          el.tabIndex = 0
          el.setAttribute('aria-label', el.title)
          el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click() } })
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            setSelectedSiteId(site.site_id)
            setSelectedFeature({
              type: site.type === 'school' ? 'school' : 'hospital',
              title: site.name,
              subtitle: `${site.type === 'school' ? 'Educational Facility' : 'Healthcare Facility'} • Receptor Zone`,
              coords: [site.lon, site.lat],
              metrics: [
                { label: 'Risk Priority', value: riskText },
                { label: 'Forecast-relative model ETA', value: `~ ${site.eta_hours.toFixed(1)}h` },
                { label: 'Uncalibrated relative score', value: `${(site.risk_score * 100).toFixed(0)}%` },
                { label: 'Modelled band peak PM2.5', value: `+${site.pm25_delta_ugm3.toFixed(0)} µg/m³` },
              ],
              actionText: isSchool
                ? 'Transition morning assembly indoors, verify HVAC filtration, distribute certified N95 masks.'
                : 'Alert respiratory ER staff, prepare nebulizer reserves, activate air filtration backups.',
              siteId: site.site_id,
            })
          })

          const marker = new Marker({ element: el, anchor: 'bottom' })
            .setLngLat([site.lon, site.lat])
            .addTo(map)

          markersRef.current.push(marker)
        })
    }

    // 3. Live AQI Monitoring Stations (Sanitized & Clustered by Proximity)
    if (showStations && aqi?.stations) {
      type ValidStation = (typeof aqi.stations)[number] & { aqi: number }
      const validStations = aqi.stations.filter(
        (stn): stn is ValidStation =>
          isValidSubcontinentCoord(stn.lat, stn.lon) && typeof stn.aqi === 'number'
      )

      interface StationCluster {
        id: string
        lat: number
        lon: number
        peakAqi: number
        count: number
        name: string
        stations: ValidStation[]
      }

      const clusters: StationCluster[] = []
      validStations.forEach(stn => {
        // Find existing cluster within ~0.07° (~7.5 km)
        const match = clusters.find(
          c => Math.hypot(c.lat - stn.lat, c.lon - stn.lon) < 0.07
        )
        if (match) {
          match.count += 1
          match.stations.push(stn)
          if (stn.aqi > match.peakAqi) {
            match.peakAqi = stn.aqi
            match.name = stn.name
          }
        } else {
          clusters.push({
            id: stn.id,
            lat: stn.lat,
            lon: stn.lon,
            peakAqi: stn.aqi,
            count: 1,
            name: stn.name,
            stations: [stn],
          })
        }
      })

      clusters.forEach(cluster => {
        const aqiVal = cluster.peakAqi
        const color = aqiVal > 400 ? '#7F1D1D'
          : aqiVal > 300 ? '#991B1B'
          : aqiVal > 200 ? '#C2410C'
          : aqiVal > 100 ? '#B45309'
          : '#15803D'

        const el = document.createElement('div')
        if (cluster.count > 1) {
          el.className = 'explorer-aqi-cluster-marker'
          el.style.backgroundColor = color
          el.innerHTML = `<span>${aqiVal}</span><span class="cluster-subtag">+${cluster.count - 1}</span>`
          el.title = `${cluster.name} (${cluster.count} sensors): Peak AQI ${aqiVal}`
        } else {
          el.className = 'explorer-aqi-station-marker'
          el.style.backgroundColor = color
          el.innerHTML = `<span>${aqiVal}</span>`
          el.title = `${cluster.name}: AQI ${aqiVal}`
        }

        el.setAttribute('role', 'button')
          el.tabIndex = 0
          el.setAttribute('aria-label', el.title)
          el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click() } })
          el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelectedFeature({
            type: 'station',
            title: cluster.count > 1 ? `${cluster.name} (+${cluster.count - 1} nearby sensors)` : cluster.name,
            subtitle: `Reported ground station cluster (${cluster.count} sensor${cluster.count > 1 ? 's' : ''})`,
            coords: [cluster.lon, cluster.lat],
            metrics: [
              { label: 'Peak Observed AQI', value: `${aqiVal}` },
              { label: 'Airshed Status', value: aqiVal > 300 ? 'Reported AQI >300' : aqiVal > 200 ? 'Reported AQI >200' : 'Reported AQI ≤200' },
              { label: 'Monitored Sensors', value: `${cluster.count} active sensor${cluster.count > 1 ? 's' : ''}` },
              { label: 'Cluster Center', value: `${cluster.lat.toFixed(3)}°N, ${cluster.lon.toFixed(3)}°E` },
            ],
            actionText: 'Reported station AQI does not establish source attribution or model validation. Individual observation times and sources are available in the PM2.5 layer.',
          })
        })

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([cluster.lon, cluster.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })
    }
    return () => { markersRef.current.forEach(m => m.remove()); markersRef.current = [] }
  }, [sources, rankedSites, aqi, showFires, fireScopeFilter, showSchools, showHospitals, showStations, webGlSupported, setSelectedSiteId, selectedFeature?.title, selectedFeature?.type])

  // ── Fly to selected preset ───────────────────────────────────────────────
  const flyToPreset = (center: [number, number], zoom: number) => {
    mapRef.current?.flyTo({
      center,
      zoom,
      speed: 1.2,
      curve: 1.3,
    })
  }

  return (
    <div className={`map-explorer-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <HeatmapControls data={heatmap.data} enabled={heatmap.enabled} onToggle={heatmap.setEnabled} opacity={heatmap.opacity} onOpacity={heatmap.setOpacity} onFit={webGlSupported ? heatmap.fit : undefined} bounds={webGlSupported ? heatmap.bounds : null} loading={loading} error={feedErrors.aqi} />
      {/* ── Map Canvas Stage with Floating HUD Controls ───────────────────── */}
      <div className="explorer-stage" onClick={() => isRegionsOpen && setIsRegionsOpen(false)}>
        {webGlSupported ? (
          <div ref={mapContainerRef} className="explorer-canvas" />
        ) : (
          <Suspense fallback={<p role="status">Loading static map…</p>}><SvgFallbackMap sources={showFires ? sources : null} rankedSites={rankedSites ? { ...rankedSites, sites: rankedSites.sites.filter(s => s.type === 'school' ? showSchools : showHospitals) } : null} scopeFilter={fireScopeFilter} corridor={showPlume ? corridor : null} horizon={timeHorizon} heatmap={heatmap.data} heatmapEnabled={heatmap.enabled} opacity={heatmap.opacity} /></Suspense>
        )}

        {/* ── Top Floating Command HUD Capsule ────────────────────────────── */}
        <div className="map-floating-hud" onClick={(e) => e.stopPropagation()}>
          {/* Camera Presets: Segmented Quick Chips + Regional Dropdown */}
          <div className="hud-presets-group">
            <button
              className={`hud-preset-chip ${fireScopeFilter === 'india' ? 'active' : ''}`}
              onClick={() => {
                setIsRegionsOpen(false)
                setFireScopeFilter(prev => prev === 'india' ? 'all' : 'india')
              }}
              title={fireScopeFilter === 'india' ? "Viewing India source scope — click to show Full Regional Airshed" : "Viewing Full Regional Airshed — click to filter to India source scope"}
              type="button"
            >
              <span>{fireScopeFilter === 'india' ? '🇮🇳 India Scope' : '🌐 Full Airshed'}</span>
            </button>
            <button
              className="hud-preset-chip"
              onClick={() => {
                setIsRegionsOpen(false)
                flyToPreset([78.9, 23.5], 4.2)
              }}
              title="Fit Entire India (repository boundary with PoK/Ladakh)"
            >
              <span>🇮🇳 All India</span>
            </button>
            <button
              className="hud-preset-chip"
              onClick={() => {
                setIsRegionsOpen(false)
                flyToPreset([76.8, 30.1], 6.8)
              }}
              title="Focus on Smoke Dispersion Corridor (Punjab to Delhi NCR)"
            >
              <span>🎯 Corridor</span>
            </button>

            {/* Regional Bookmarks Dropdown */}
            <div className="hud-dropdown-wrap">
              <button
                className={`hud-preset-chip dropdown-trigger ${isRegionsOpen ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsRegionsOpen(!isRegionsOpen)
                }}
                title="Select Regional Focus Area"
                type="button"
              >
                <span>Regions</span>
                <ChevronDown size={13} className={`dropdown-chevron ${isRegionsOpen ? 'rotated' : ''}`} />
              </button>
              {isRegionsOpen && (
                <div className="hud-dropdown-menu">
                  <button
                    className="hud-dropdown-item"
                    onClick={() => {
                      flyToPreset([75.4, 31.0], 8.4)
                      setIsRegionsOpen(false)
                    }}
                  >
                    <span className="dropdown-icon">🔥</span>
                    <div className="dropdown-text">
                      <strong>Punjab Hotspots</strong>
                      <small>Source candidate region</small>
                    </div>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => {
                      flyToPreset([77.2, 28.6], 9.8)
                      setIsRegionsOpen(false)
                    }}
                  >
                    <span className="dropdown-icon">📍</span>
                    <div className="dropdown-text">
                      <strong>Delhi NCR Receptors</strong>
                      <small>Schools, hospitals, sensors</small>
                    </div>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => {
                      flyToPreset([76.0, 34.2], 6.4)
                      setIsRegionsOpen(false)
                    }}
                  >
                    <span className="dropdown-icon">🏔️</span>
                    <div className="dropdown-text">
                      <strong>J&K & Ladakh</strong>
                      <small>Northern regional view</small>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="hud-divider" />

          {/* Basemap Projection Switcher */}
          <div className="hud-basemap-group">
            <button
              className={`hud-basemap-btn ${basemapMode === 'satellite' ? 'active' : ''}`}
              onClick={() => setBasemapMode('satellite')}
              title="ESRI Photorealistic Satellite Imagery"
              type="button"
            >
              <span>🛰️ Sat</span>
            </button>
            <button
              className={`hud-basemap-btn ${basemapMode === 'globe' ? 'active' : ''}`}
              onClick={() => setBasemapMode('globe')}
              title="Mercator satellite perspective, 32 degree tilt"
              type="button"
            >
              <span>🪐 Tilted satellite</span>
            </button>
            <button
              className={`hud-basemap-btn ${basemapMode === 'dark' ? 'active' : ''}`}
              onClick={() => setBasemapMode('dark')}
              title="Tactical Dark Matter GIS Style"
              type="button"
            >
              <span>🌑 Dark</span>
            </button>
            <button
              className={`hud-basemap-btn ${basemapMode === 'topo' ? 'active' : ''}`}
              onClick={() => setBasemapMode('topo')}
              title="Clean Topographic Street Basemap"
              type="button"
            >
              <span>🗺️ Topo</span>
            </button>
          </div>

          <div className="hud-divider" />

          {/* Integrated Time Horizon & Playback */}
          <div className="hud-playback-group">
            <button
              className={`hud-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? 'Pause plume animation' : 'Auto-play plume dispersion spread'}
              type="button"
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? 'Pause' : 'Auto Play'}</span>
            </button>
            <div className="hud-time-pills">
              {([0, 2, 4, 8, 24] as TimeHorizon[]).map(h => (
                <button
                  key={h}
                  aria-pressed={timeHorizon === h}
                  className={`hud-time-pill ${timeHorizon === h ? 'active' : ''}`}
                  onClick={() => {
                    setIsPlaying(false)
                    setTimeHorizon(h)
                  }}
                  type="button"
                >
                  {h === 0 ? 'Start' : `+${h}h`}
                </button>
              ))}
            </div>
          </div>

          <div className="hud-divider" />

          {/* Fullscreen Trigger */}
          <button
            className="hud-icon-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label="Toggle Fullscreen"
            type="button"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>

        {/* ── Left Floating Controls: Layer FAB ────────────────────────────── */}
        <button
          className={`map-floating-fab ${isLayerPanelOpen ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setIsLayerPanelOpen(!isLayerPanelOpen)
            setIsRegionsOpen(false)
          }}
          title="Toggle Map Layers & Intelligence"
          type="button"
        >
          <Layers size={15} />
          <span>Layers</span>
          <span className="fab-layer-badge">{activeLayerCount}</span>
        </button>

        {/* ── Left Floating Drawer: Layer Panel ────────────────────────────── */}
        {isLayerPanelOpen && (
          <div className="floating-layer-panel open" onClick={(e) => e.stopPropagation()}>
            <div className="layer-panel-header">
              <div className="layer-panel-title">
                <Layers size={15} color="#22734F" />
                <span>Map Layers & Feeds</span>
              </div>
              <button
                className="collapse-btn"
                onClick={() => setIsLayerPanelOpen(false)}
                aria-label="Close layer panel"
              >
                <X size={14} />
              </button>
            </div>

            <div className="layer-panel-body">
              {/* Basemap & Visual Projection */}
              <div className="layer-section-title">Basemap & Visual Engine</div>
              <div className="layer-basemap-selector">
                <button
                  type="button"
                  className={`layer-basemap-card ${basemapMode === 'satellite' ? 'active' : ''}`}
                  onClick={() => setBasemapMode('satellite')}
                >
                  <strong>🛰️ Satellite</strong>
                  <small>ESRI Photorealistic</small>
                </button>
                <button
                  type="button"
                  className={`layer-basemap-card ${basemapMode === 'globe' ? 'active' : ''}`}
                  onClick={() => setBasemapMode('globe')}
                >
                  <strong>🪐 Tilted satellite</strong>
                  <small>Mercator · 32° tilt</small>
                </button>
                <button
                  type="button"
                  className={`layer-basemap-card ${basemapMode === 'dark' ? 'active' : ''}`}
                  onClick={() => setBasemapMode('dark')}
                >
                  <strong>🌑 Dark GIS</strong>
                  <small>Tactical night console</small>
                </button>
                <button
                  type="button"
                  className={`layer-basemap-card ${basemapMode === 'topo' ? 'active' : ''}`}
                  onClick={() => setBasemapMode('topo')}
                >
                  <strong>🗺️ Topo</strong>
                  <small>Cartographic roads</small>
                </button>
              </div>

              {/* Layer Toggles */}
              <div className="layer-section-title">Telemetry & Geospatial Layers</div>
              <div className="layer-toggles-list">
                <div className="layer-item-wrapper">
                  <label className="layer-toggle-row">
                    <input
                      type="checkbox"
                      checked={showFires}
                      onChange={(e) => setShowFires(e.target.checked)}
                    />
                    <span className="layer-badge-icon">🔥</span>
                    <div className="layer-info">
                      <span className="layer-name">Fire-derived source candidates</span>
                      <span className="layer-desc">
                        {scopedSources.length} source candidates · {scopedSources.reduce((sum, s) => sum + s.fire_count, 0)} detections · {scopedSources.reduce((sum, s) => sum + s.total_frp_mw, 0).toFixed(1)} MW FRP
                      </span>
                    </div>
                  </label>
                  {showFires && (
                    <div className="layer-subfilter-bar">
                      <button
                        type="button"
                        className={`subfilter-pill ${fireScopeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setFireScopeFilter('all')}
                        title="Show all regional fires (Domestic + Transboundary)"
                      >
                        All ({sources?.sources.length ?? 0})
                      </button>
                      <button
                        type="button"
                        className={`subfilter-pill ${fireScopeFilter === 'india' ? 'active' : ''}`}
                        onClick={() => setFireScopeFilter('india')}
                        title="Show domestic Indian fires only (CPCB Focus)"
                      >
                        🇮🇳 India ({sources?.sources.filter(s => s.territory === 'india').length ?? 0})
                      </button>
                      <button
                        type="button"
                        className={`subfilter-pill ${fireScopeFilter === 'transboundary' ? 'active' : ''}`}
                        onClick={() => setFireScopeFilter('transboundary')}
                        title="Show transboundary upwind fires only (Pakistan Influx)"
                      >
                        🌐 Transboundary ({sources?.sources.filter(s => s.territory === 'transboundary').length ?? 0})
                      </button>
                    </div>
                  )}
                </div>

                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showPlume}
                    onChange={(e) => setShowPlume(e.target.checked)}
                  />
                  <span className="layer-badge-icon" style={{ color: '#DC2626' }}>🟥</span>
                  <div className="layer-info">
                    <span className="layer-name">Modelled plume footprint</span>
                    <span className="layer-desc">Uncalibrated baseline · forecast-relative bands</span>
                  </div>
                </label>

                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showSchools}
                    onChange={(e) => setShowSchools(e.target.checked)}
                  />
                  <span className="layer-badge-icon">🏫</span>
                  <div className="layer-info">
                    <span className="layer-name">Sensitive Schools</span>
                    <span className="layer-desc">{rankedSites?.sites.filter(s => s.type === 'school').length ?? 0} ranked schools; map shows first 12 sites</span>
                  </div>
                </label>

                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showHospitals}
                    onChange={(e) => setShowHospitals(e.target.checked)}
                  />
                  <span className="layer-badge-icon">🏥</span>
                  <div className="layer-info">
                    <span className="layer-name">Hospitals & Clinics</span>
                    <span className="layer-desc">{rankedSites?.sites.filter(s => s.type === 'hospital').length ?? 0} ranked hospitals; map shows first 12 sites</span>
                  </div>
                </label>

                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showStations}
                    onChange={(e) => setShowStations(e.target.checked)}
                  />
                  <span className="layer-badge-icon">📡</span>
                  <div className="layer-info">
                    <span className="layer-name">Reported AQI stations</span>
                    <span className="layer-desc">{aqi?.stations.length ?? 0} station records; missing AQI omitted</span>
                  </div>
                </label>

                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showSoiBorder}
                    onChange={(e) => setShowSoiBorder(e.target.checked)}
                  />
                  <span className="layer-badge-icon">🟩</span>
                  <div className="layer-info">
                    <span className="layer-name">Repository boundary</span>
                    <span className="layer-desc">Captured boundary overlay; see data provenance</span>
                  </div>
                </label>
              </div>

              {/* Quick Telemetry Summary */}
              <div className="layer-telemetry-box">
                <div className="telem-row">
                  <span className="telem-lbl">Wind Trajectory:</span>
                  <span className="telem-val">{wind?.points[0]?.hours[0] ? `${wind.points[0].hours[0].dir_from_deg.toFixed(0)}° from · ${wind.points[0].hours[0].speed_ms.toFixed(1)} m/s (first forecast grid/hour)` : 'Unavailable'}</span>
                </div>
                <div className="telem-row">
                  <span className="telem-lbl">Minimum ranked-site ETA:</span>
                  <span className="telem-val">{etaHours != null ? `~ ${etaHours.toFixed(1)}h` : '—'}</span>
                </div>
                <div className="telem-row">
                  <span className="telem-lbl">Population in model corridor:</span>
                  <span className="telem-val">{exposedPopulation != null ? `${(exposedPopulation / 1000).toFixed(0)}K residents` : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Right Floating Drawer: Selected Feature Inspector ───────────── */}
        {selectedFeature && (
          <div className="floating-inspector-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="inspector-head">
              <div className="inspector-title-group">
                <div className="inspector-tag">
                  {selectedFeature.type === 'fire' ? '🔥 Source Cluster'
                    : selectedFeature.type === 'school' ? '🏫 School Facility'
                    : selectedFeature.type === 'hospital' ? '🏥 Medical Facility'
                    : '📡 Sensor Station'}
                </div>
                <h3 className="inspector-title">{selectedFeature.title}</h3>
                <span className="inspector-subtitle">{selectedFeature.subtitle}</span>
              </div>
              <button
                className="inspector-close"
                onClick={() => setSelectedFeature(null)}
                aria-label="Close inspector"
              >
                <X size={15} />
              </button>
            </div>

            <div className="inspector-metrics-grid">
              {selectedFeature.metrics.map((m, i) => (
                <div key={i} className="inspector-metric-card">
                  <span className="metric-label">{m.label}</span>
                  <span className="metric-value">{m.value}</span>
                </div>
              ))}
            </div>

            {selectedFeature.actionText && (
              <div className="inspector-action-card">
                <div className="action-card-title">
                  <Shield size={14} color="#166534" />
                  <span>Advisory context (not dispatched)</span>
                </div>
                <p className="action-card-text">{selectedFeature.actionText}</p>
                <button
                  className="action-card-btn"
                  onClick={() => setShowActionsModal(true)}
                >
                  <Zap size={14} />
                  <span>Review proposed actions</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Left Bottom Floating Geospatial Intelligence Legend ─────────── */}
        <div className="map-floating-legend" onClick={(e) => e.stopPropagation()}>
          <div className="legend-head">
            <div className="legend-title">
              <span className="legend-badge-dot" />
              <span>Map Intelligence Legend</span>
            </div>
            <button
              className="legend-toggle-btn"
              onClick={() => setShowLegend(!showLegend)}
              aria-expanded={showLegend}
              type="button"
              title={showLegend ? "Collapse legend" : "Expand legend"}
            >
              {showLegend ? '−' : '+'}
            </button>
          </div>

          {showLegend && (
            <div className="legend-body">
              <div className="legend-group">
                <span className="legend-group-title">🔥 Fire FRP display tiers</span>
                <div className="legend-items">
                  <div className="legend-item"><span className="legend-swatch severe" /><span>Severe (≥200 MW)</span></div>
                  <div className="legend-item"><span className="legend-swatch high" /><span>High (50–&lt;200 MW)</span></div>
                  <div className="legend-item"><span className="legend-swatch moderate" /><span>Moderate (&lt;50 MW)</span></div>
                </div>
              </div>

              <div className="legend-group">
                <span className="legend-group-title">💨 Smoke Plume (ETA)</span>
                <div className="legend-items">
                  <div className="legend-item"><span className="legend-swatch plume-acute" /><span>0–2h band start</span></div>
                  <div className="legend-item"><span className="legend-swatch plume-mid" /><span>2–4h band start</span></div>
                  <div className="legend-item"><span className="legend-swatch plume-receptor" /><span>4–8h band start; 8–24h also available</span></div>
                </div>
              </div>

              <div className="legend-group">
                <span className="legend-group-title">📡 Monitoring Stations (AQI)</span>
                <div className="legend-items">
                  <div className="legend-item"><span className="legend-swatch aqi-severe" /><span>Reported index &gt;300</span></div>
                  <div className="legend-item"><span className="legend-swatch aqi-poor" /><span>Reported index 200–300</span></div>
                  <div className="legend-item"><span className="legend-swatch aqi-mod" /><span>Reported index &lt;200</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Bottom Zoom & Camera Navigation Control ────────────────── */}
        <div className="explorer-nav-dock" onClick={(e) => e.stopPropagation()}>
          <button
            className="dock-btn"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom In"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="dock-btn"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom Out (Free Subcontinent View)"
            aria-label="Zoom out"
          >
            −
          </button>
          <div className="dock-sep" />
          <button
            className="dock-btn"
            onClick={() => mapRef.current?.resetNorth()}
            title="Reset North Bearing"
            aria-label="Reset North"
          >
            <Compass size={16} />
          </button>
        </div>
      </div>

      {/* Sleek Bottom Status Strip */}
      <div className="explorer-footer-status">
        <p className="map-science-note">
          <Info size={11} className="science-note-icon" />
          <span>Uncalibrated model corridors · forecast start: {corridor?.forecast_start ?? 'unavailable'}. Time controls select cumulative bands; full centrelines and ETA markers remain as forecast context. Station observations are separate from modelled band peaks. Facility markers show up to 12 ranked sites after filtering; the facility table contains the full list.</span>
        </p>
      </div>
    </div>
  )
}
