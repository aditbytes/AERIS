/**
 * MapExplorerView.tsx — Full-Featured GIS Map Explorer for AERIS
 *
 * Capabilities:
 *  - Full viewport interactive MapLibre GL map
 *  - Smooth, unrestricted zoom out down to zoom 2.8 (entire subcontinent and Asia)
 *  - Official Survey of India (SOI) sovereign boundary with PoK, J&K, Ladakh & Indira Col
 *  - Camera presets: Full India (SOI), Smoke Corridor, Punjab Fire Hotspots, Delhi NCR, J&K & Ladakh
 *  - Time Horizon controller with live auto-play animation (0h -> 1h -> 2h -> 3h)
 *  - Layer toggles: Fire Clusters, Smoke Plumes, Schools, Hospitals, Live AQI Stations, Wind, SOI Border
 *  - Quick city search & fly-to (Delhi, Chandigarh, Amritsar, Srinagar, Leh, etc.)
 *  - Interactive site/fire inspector drawer with action execution
 *  - SVG fallback with complete SOI crown and responsive vectors
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { Map, Marker, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import {
  ArrowLeft,
  Compass,
  Eye,
  EyeOff,
  Flame,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Search,
  Shield,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { useAeris, type TimeHorizon } from '@/services/dataContext'
import { getRiskLevel, riskLabel, type CorridorBandProperties, type RankedSite } from '@/types/schemas'
import './MapExplorerView.css'

try {
  setWorkerUrl(workerUrl)
} catch {
  // Worker already set
}

// Preset camera bookmarks
const CAMERA_PRESETS = [
  { id: 'india',    name: '🇮🇳 Full India (SOI)',  center: [78.9, 23.5] as [number, number], zoom: 4.2 },
  { id: 'corridor', name: '🎯 Smoke Corridor',    center: [76.8, 30.1] as [number, number], zoom: 6.8 },
  { id: 'punjab',   name: '🔥 Punjab Hotspots',   center: [75.4, 31.0] as [number, number], zoom: 8.4 },
  { id: 'delhi',    name: '📍 Delhi NCR Receptors',center: [77.2, 28.6] as [number, number], zoom: 9.8 },
  { id: 'kashmir',  name: '🏔️ J&K & Ladakh (SOI)',center: [76.0, 34.2] as [number, number], zoom: 6.4 },
]

// Searchable locations
const QUICK_CITIES = [
  { name: 'Delhi NCR',    lon: 77.2090, lat: 28.6139, zoom: 10.0 },
  { name: 'Chandigarh',   lon: 76.7794, lat: 30.7333, zoom: 10.5 },
  { name: 'Amritsar',     lon: 74.8723, lat: 31.6340, zoom: 11.0 },
  { name: 'Ludhiana',     lon: 75.8573, lat: 30.9010, zoom: 10.8 },
  { name: 'Patiala',      lon: 76.3869, lat: 30.3398, zoom: 11.0 },
  { name: 'Karnal',       lon: 76.9897, lat: 29.6857, zoom: 11.0 },
  { name: 'Faridabad',    lon: 77.3178, lat: 28.4089, zoom: 11.2 },
  { name: 'Srinagar (J&K)',lon: 74.7973, lat: 34.0837, zoom: 10.5 },
  { name: 'Jammu (J&K)',   lon: 74.8570, lat: 32.7266, zoom: 10.5 },
  { name: 'Leh (Ladakh)', lon: 77.5771, lat: 34.1526, zoom: 10.5 },
  { name: 'Gilgit (PoK)', lon: 74.3036, lat: 35.9221, zoom: 9.5 },
]

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
    timeHorizon,
    setTimeHorizon,
    setActiveTab,
    setShowActionsModal,
    setSelectedSiteId,
    exposedPopulation,
    etaHours,
  } = useAeris()

  const [webGlSupported, setWebGlSupported] = useState(true)
  const [isPlaying, setIsPlaying]           = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [selectedFeature, setSelectedFeature] = useState<InspectorData | null>(null)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true)
  const [isFullscreen, setIsFullscreen]     = useState(false)

  // Layer Visibility
  const [showFires, setShowFires]       = useState(true)
  const [showPlume, setShowPlume]       = useState(true)
  const [showSchools, setShowSchools]   = useState(true)
  const [showHospitals, setShowHospitals] = useState(true)
  const [showStations, setShowStations] = useState(true)
  const [showSoiBorder, setShowSoiBorder] = useState(true)

  // ── Auto-play timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setTimeHorizon((((timeHorizon + 1) % 4) as TimeHorizon))
    }, 2200)
    return () => clearInterval(interval)
  }, [isPlaying, timeHorizon, setTimeHorizon])

  // ── 1. Initialize MapLibre ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitRef.current || !webGlSupported) return
    mapInitRef.current = true

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center: [76.8, 30.1],
        zoom: 6.8,
        minZoom: 2.8,   // Fix: Smoothly zoom out to whole subcontinent
        maxZoom: 18,    // High resolution inspection
        pitch: 0,
        bearing: 0,
        attributionControl: false,
      })

      map.on('error', (e) => {
        const msg = e.error?.message || ''
        if (msg.includes('WebGL') || msg.includes('Worker') || msg.includes('GL')) {
          console.warn('[AERIS MapExplorer] Fallback to SVG:', msg)
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

        // Outer halo
        map.addLayer({
          id: 'india-border-halo',
          type: 'line',
          source: 'india-boundary',
          paint: {
            'line-color': '#22734F',
            'line-width': 5.0,
            'line-opacity': 0.4,
          },
        })

        // Solid SOI line
        map.addLayer({
          id: 'india-border-line',
          type: 'line',
          source: 'india-boundary',
          paint: {
            'line-color': '#164E35',
            'line-width': 2.6,
            'line-opacity': 0.95,
          },
        })

        // Sovereign Territory Badges
        const jkEl = document.createElement('div')
        jkEl.className = 'soi-territory-tag'
        jkEl.innerText = 'Jammu & Kashmir (India)'
        new Marker({ element: jkEl, anchor: 'center' }).setLngLat([75.3, 33.7]).addTo(map)

        const ladakhEl = document.createElement('div')
        ladakhEl.className = 'soi-territory-tag'
        ladakhEl.innerText = 'Ladakh (India)'
        new Marker({ element: ladakhEl, anchor: 'center' }).setLngLat([77.8, 34.2]).addTo(map)

        // 2. Corridor polygon source
        map.addSource('corridor', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        // Plume fill layer
        map.addLayer({
          id: 'plume-fill',
          type: 'fill',
          source: 'corridor',
          filter: ['==', ['get', 'kind'], 'band'],
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['get', 'hour_from'],
              0, 'rgba(220, 38, 38, 0.72)',
              2, 'rgba(234, 88, 12, 0.60)',
              4, 'rgba(245, 158, 11, 0.44)',
              8, 'rgba(234, 179, 8, 0.28)',
            ],
            'fill-opacity': 0.85,
          },
        })

        // Centerline layer
        map.addLayer({
          id: 'plume-centerline',
          type: 'line',
          source: 'corridor',
          filter: ['==', ['get', 'kind'], 'centerline'],
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 2.8,
            'line-dasharray': [4, 2],
            'line-opacity': 0.95,
          },
        })
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

  // ── 2. Update corridor GeoJSON when timeHorizon changes ──────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !corridor || !webGlSupported) return

    const applyData = () => {
      const source = map.getSource('corridor') as GeoJSONSource | undefined
      if (!source) { setTimeout(applyData, 80); return }

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
    applyData()
  }, [corridor, timeHorizon, webGlSupported])

  // ── 3. Toggle layer visibility ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return

    if (map.getLayer('india-border-line')) {
      map.setLayoutProperty('india-border-line', 'visibility', showSoiBorder ? 'visible' : 'none')
      map.setLayoutProperty('india-border-halo', 'visibility', showSoiBorder ? 'visible' : 'none')
    }
    if (map.getLayer('plume-fill')) {
      map.setLayoutProperty('plume-fill', 'visibility', showPlume ? 'visible' : 'none')
      map.setLayoutProperty('plume-centerline', 'visibility', showPlume ? 'visible' : 'none')
    }
  }, [showSoiBorder, showPlume, webGlSupported])

  // ── 4. Render all interactive markers ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !webGlSupported) return

    // Clear previous markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // 1. Fire Sources
    if (showFires && sources) {
      sources.sources.forEach(src => {
        const size = Math.round(26 + src.emission_strength * 18)
        const el = document.createElement('div')
        el.className = 'explorer-fire-marker'
        el.style.width  = `${size}px`
        el.style.height = `${size}px`
        el.innerHTML = `
          <div class="fire-pulse-ring"></div>
          <div class="fire-glyph" style="font-size: ${size * 0.65}px">🔥</div>
        `
        el.title = `${src.type}: ${src.fire_count} fires (${src.total_frp_mw.toFixed(0)} MW)`

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelectedFeature({
            type: 'fire',
            title: src.type.replace(/_/g, ' ').toUpperCase(),
            subtitle: `Active stubble burning cluster in Punjab`,
            coords: [src.lon, src.lat],
            metrics: [
              { label: 'Detected Fires', value: `${src.fire_count} hotspots` },
              { label: 'Radiative Power (FRP)', value: `${src.total_frp_mw.toFixed(1)} MW` },
              { label: 'Detection Confidence', value: `${(src.confidence * 100).toFixed(0)}%` },
              { label: 'Emission Strength', value: `${(src.emission_strength * 100).toFixed(0)}%` },
            ],
            actionText: 'Dispatch agricultural monitoring enforcement & drone suppression team.',
          })
        })

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([src.lon, src.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })
    }

    // 2. Sensitive Receptor Facilities (Schools & Hospitals)
    if (rankedSites) {
      rankedSites.sites.slice(0, 16).forEach((site: RankedSite) => {
        const isSchool = site.type === 'school'
        if (isSchool && !showSchools) return
        if (!isSchool && !showHospitals) return

        const riskLvl = getRiskLevel(site.risk_score)
        const riskText = riskLabel(riskLvl)
        const el = document.createElement('div')
        el.className = `explorer-site-marker site-${site.type} risk-${riskLvl}`
        el.innerHTML = `
          <span class="site-icon">${isSchool ? '🏫' : '🏥'}</span>
          <span class="site-risk-tag">${riskText}</span>
        `
        el.title = `${site.name} (${riskText} Risk)`

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
              { label: 'Plume Arrival ETA', value: `~ ${site.eta_hours.toFixed(1)}h` },
              { label: 'Risk Score', value: `${(site.risk_score * 100).toFixed(0)}%` },
              { label: 'Forecast Peak PM2.5', value: `+${site.pm25_delta_ugm3.toFixed(0)} µg/m³` },
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

    // 3. Live AQI Monitoring Stations
    if (showStations && aqi) {
      aqi.stations.slice(0, 20).forEach(stn => {
        if (!stn.lat || !stn.lon || stn.aqi == null) return

        const aqiVal = stn.aqi
        const color = aqiVal > 400 ? '#7F1D1D'
          : aqiVal > 300 ? '#991B1B'
          : aqiVal > 200 ? '#C2410C'
          : aqiVal > 100 ? '#B45309'
          : '#15803D'

        const el = document.createElement('div')
        el.className = 'explorer-aqi-station-marker'
        el.style.backgroundColor = color
        el.innerHTML = `<span>${aqiVal}</span>`
        el.title = `${stn.name || 'Station'}: AQI ${aqiVal}`

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelectedFeature({
            type: 'station',
            title: stn.name || 'Ground Monitoring Station',
            subtitle: `Live CPCB / AirNow Ground Sensor`,
            coords: [stn.lon, stn.lat],
            metrics: [
              { label: 'Observed AQI', value: `${aqiVal}` },
              { label: 'Status', value: aqiVal > 300 ? 'Severe / Hazardous' : aqiVal > 200 ? 'Very Poor' : 'Moderate' },
              { label: 'Latitude', value: stn.lat.toFixed(4) },
              { label: 'Longitude', value: stn.lon.toFixed(4) },
            ],
            actionText: 'Station verifying transboundary plume arrival into receptor atmospheric basin.',
          })
        })

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([stn.lon, stn.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })
    }
  }, [sources, rankedSites, aqi, showFires, showSchools, showHospitals, showStations, webGlSupported, setSelectedSiteId])

  // ── Fly to selected preset ───────────────────────────────────────────────
  const flyToPreset = (center: [number, number], zoom: number) => {
    mapRef.current?.flyTo({
      center,
      zoom,
      speed: 1.2,
      curve: 1.3,
    })
  }

  // ── Filtered search cities ────────────────────────────────────────────────
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return []
    return QUICK_CITIES.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery])

  return (
    <div className={`map-explorer-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* ── Top Navigation & Filter Bar ──────────────────────────────────── */}
      <div className="explorer-topbar">
        <div className="topbar-left">
          <button
            className="explorer-back-btn"
            onClick={() => setActiveTab('dashboard')}
            title="Return to Main Dashboard"
          >
            <ArrowLeft size={16} />
            <span>Dashboard</span>
          </button>
          <div className="explorer-divider" />
          <div className="explorer-title-area">
            <h1 className="explorer-title">GIS Map Explorer</h1>
            <span className="explorer-subtitle">Survey of India Sovereign Boundary • PM2.5 Trajectory Engine</span>
          </div>
        </div>

        {/* Camera Preset Pills */}
        <div className="topbar-center">
          <div className="preset-pill-group">
            {CAMERA_PRESETS.map(p => (
              <button
                key={p.id}
                className="preset-btn"
                onClick={() => flyToPreset(p.center, p.zoom)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Time Horizon & Auto-Play */}
        <div className="topbar-right">
          <div className="time-playback-widget">
            <button
              className={`playback-toggle ${isPlaying ? 'playing' : ''}`}
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? 'Pause plume animation' : 'Auto-play plume spread'}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? 'Pause' : 'Auto Play'}</span>
            </button>
            <div className="time-pills">
              {([0, 1, 2, 3] as TimeHorizon[]).map(h => (
                <button
                  key={h}
                  className={`time-pill ${timeHorizon === h ? 'active' : ''}`}
                  onClick={() => {
                    setIsPlaying(false)
                    setTimeHorizon(h)
                  }}
                >
                  {h === 0 ? 'Now' : `+${h}h`}
                </button>
              ))}
            </div>
          </div>

          <button
            className="icon-tool-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* ── Map Canvas & Floating Controls ───────────────────────────────── */}
      <div className="explorer-stage">
        {webGlSupported ? (
          <div ref={mapContainerRef} className="explorer-canvas" />
        ) : (
          <div className="explorer-fallback">
            <div className="fallback-note">Interactive WebGL canvas loaded via vector rendering engine.</div>
          </div>
        )}

        {/* ── Left Floating Controls: Layer Drawer ───────────────────────── */}
        <div className={`floating-layer-panel ${isLayerPanelOpen ? 'open' : 'collapsed'}`}>
          <div className="layer-panel-header" onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}>
            <div className="layer-panel-title">
              <Layers size={15} color="#22734F" />
              <span>Map Layers</span>
            </div>
            <button className="collapse-btn" aria-label="Toggle layer panel">
              {isLayerPanelOpen ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          {isLayerPanelOpen && (
            <div className="layer-panel-body">
              {/* City quick search */}
              <div className="layer-search-box">
                <Search size={13} className="search-ico" />
                <input
                  type="text"
                  placeholder="Fly to city (e.g. Delhi, Srinagar, Leh)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="search-clear" onClick={() => setSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {filteredCities.length > 0 && (
                <div className="city-search-results">
                  {filteredCities.map(city => (
                    <button
                      key={city.name}
                      className="city-result-item"
                      onClick={() => {
                        flyToPreset([city.lon, city.lat], city.zoom)
                        setSearchQuery('')
                      }}
                    >
                      <MapPin size={12} />
                      <span>{city.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Layer Toggles */}
              <div className="layer-toggles-list">
                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showFires}
                    onChange={(e) => setShowFires(e.target.checked)}
                  />
                  <span className="layer-badge-icon">🔥</span>
                  <div className="layer-info">
                    <span className="layer-name">Stubble Burning Clusters</span>
                    <span className="layer-desc">10 active sites • 215 fires (676 MW)</span>
                  </div>
                </label>

                <label className="layer-toggle-row">
                  <input
                    type="checkbox"
                    checked={showPlume}
                    onChange={(e) => setShowPlume(e.target.checked)}
                  />
                  <span className="layer-badge-icon" style={{ color: '#DC2626' }}>🟥</span>
                  <div className="layer-info">
                    <span className="layer-name">PM2.5 Plume Footprint</span>
                    <span className="layer-desc">Gaussian dispersion plume (0h–3h)</span>
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
                    <span className="layer-desc">440+ educational institutions</span>
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
                    <span className="layer-desc">50+ healthcare facilities</span>
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
                    <span className="layer-name">Live Ground AQI Sensors</span>
                    <span className="layer-desc">60 continuous monitoring stations</span>
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
                    <span className="layer-name">Survey of India Boundary</span>
                    <span className="layer-desc">Official sovereign border (PoK & Ladakh)</span>
                  </div>
                </label>
              </div>

              {/* Quick Telemetry Summary */}
              <div className="layer-telemetry-box">
                <div className="telem-row">
                  <span className="telem-lbl">Wind Trajectory:</span>
                  <span className="telem-val">💨 NW → SE (315° @ 18 km/h)</span>
                </div>
                <div className="telem-row">
                  <span className="telem-lbl">Delhi NCR ETA:</span>
                  <span className="telem-val">{etaHours != null ? `~ ${etaHours.toFixed(1)}h` : '~ 0h'}</span>
                </div>
                <div className="telem-row">
                  <span className="telem-lbl">Potentially Exposed:</span>
                  <span className="telem-val">{exposedPopulation ? `${(exposedPopulation / 1000).toFixed(0)}K residents` : '571K'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Floating Drawer: Selected Feature Inspector ───────────── */}
        {selectedFeature && (
          <div className="floating-inspector-drawer">
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
                  <span>Recommended Protective Intervention</span>
                </div>
                <p className="action-card-text">{selectedFeature.actionText}</p>
                <button
                  className="action-card-btn"
                  onClick={() => setShowActionsModal(true)}
                >
                  <Zap size={14} />
                  <span>Execute Directives</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Bottom Floating Legend ───────────────────────────────────────── */}
        <div className="explorer-bottom-legend">
          <div className="legend-entry">
            <span className="entry-glyph">🔥</span>
            <span>Stubble Fire Hotspots</span>
          </div>
          <div className="legend-entry">
            <div className="entry-swatch plume-swatch" />
            <span>Projected PM2.5 Plume</span>
          </div>
          <div className="legend-entry">
            <span className="entry-glyph">🏫</span>
            <span>Schools</span>
          </div>
          <div className="legend-entry">
            <span className="entry-glyph">🏥</span>
            <span>Hospitals</span>
          </div>
          <div className="legend-entry">
            <div className="entry-swatch soi-swatch" />
            <span>Survey of India Boundary</span>
          </div>
        </div>

        {/* ── Right Bottom Zoom & Camera Navigation Control ────────────────── */}
        <div className="explorer-nav-dock">
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
          <button
            className="dock-btn highlight"
            onClick={() => flyToPreset([78.9, 23.5], 4.2)}
            title="Fit Entire India (Survey of India Boundary)"
            aria-label="Fit India"
          >
            🇮🇳
          </button>
          <button
            className="dock-btn"
            onClick={() => flyToPreset([76.8, 30.1], 6.8)}
            title="Fit Smoke Corridor (Punjab to Delhi NCR)"
            aria-label="Fit Corridor"
          >
            🎯
          </button>
        </div>
      </div>
    </div>
  )
}
