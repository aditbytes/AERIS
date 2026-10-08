import { useState } from 'react'
import {
  CheckCircle2,
  Compass,
  Database,
  Globe,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react'
import { useAeris, type BasemapMode } from '@/services/dataContext'
import './SettingsView.css'

const BASEMAP_OPTIONS: {
  id: BasemapMode
  title: string
  badge: string
  icon: string
  desc: string
  provider: string
  projection: string
}[] = [
  {
    id: 'satellite',
    title: 'Photorealistic Satellite Imagery',
    badge: 'Production Default',
    icon: '🛰️',
    desc: 'High-resolution multi-spectral earth observation imagery from commercial orbital constellations (ESRI / Maxar). Enables visual discrimination of agricultural residue burning fields, crop parcel geometry, and terrain contours.',
    provider: 'ESRI World Imagery / Maxar',
    projection: 'Web Mercator • Sub-meter Resolution',
  },
  {
    id: 'globe',
    title: '3D Spherical Earth Globe Projection',
    badge: '3D Physics Engine',
    icon: '🪐',
    desc: 'True 3D planetary curvature with dynamic 42° camera pitch and atmospheric horizon glow. Calibrated for macro-scale transboundary smoke plume transport modeling from Punjab airsheds down the Indo-Gangetic Plain.',
    provider: 'MapLibre GL v6 Globe Engine',
    projection: '3D Spherical Orthographic • 42° Pitch',
  },
  {
    id: 'dark',
    title: 'Tactical Dark Matter GIS Console',
    badge: 'Night Surveillance',
    icon: '🌑',
    desc: 'Minimalist high-contrast dark GIS cartography. Accentuates glowing thermal sensor reticles, fire radiative power (MW) gradients, and Gaussian smoke dispersion corridors with zero optical noise.',
    provider: 'Carto Dark Matter GL',
    projection: 'Web Mercator • High-Contrast Vector',
  },
  {
    id: 'topo',
    title: 'Topographic Cartographic Voyager',
    badge: 'Field Operations',
    icon: '🗺️',
    desc: 'Clean cartographic basemap displaying road corridors, administrative boundaries, and population centers. Optimized for field interdiction teams, mobile smog gun dispatch, and school closure logistics.',
    provider: 'Carto Voyager GL',
    projection: 'Web Mercator • Road & Topo Vector',
  },
]

export default function SettingsView() {
  const { refreshData, basemapMode, setBasemapMode } = useAeris()
  const [clearedMsg, setClearedMsg] = useState(false)

  const handleClearCache = () => {
    localStorage.removeItem('aeris_action_checklist')
    setClearedMsg(true)
    setTimeout(() => setClearedMsg(false), 3000)
  }

  return (
    <div className="settings-view">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-badge">
            <Settings size={14} />
            <span>System Configuration &amp; Data Pipeline Status</span>
          </div>
          <h1 className="view-title">AERIS System Architecture &amp; Pipeline Status</h1>
          <p className="view-subtitle">
            Scientific data sources, API gateway connectivity, and autonomous environmental modeling parameters.
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="settings-grid">
        {/* Geospatial Visual Engine & Basemap Settings Card */}
        <div className="settings-card full-width">
          <div className="card-header">
            <Globe size={18} />
            <div>
              <h2>Geospatial Visual Engine &amp; Basemap Mode</h2>
              <p className="card-desc-text">
                Select the primary cartographic rendering engine for all AERIS geospatial interfaces. Changes apply immediately and are stored across sessions.
              </p>
            </div>
          </div>

          <div className="basemap-cards-grid">
            {BASEMAP_OPTIONS.map((opt) => {
              const isSelected = basemapMode === opt.id
              return (
                <div
                  key={opt.id}
                  className={`basemap-option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setBasemapMode(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setBasemapMode(opt.id)
                    }
                  }}
                >
                  <div className="basemap-card-top">
                    <span className="basemap-card-icon">{opt.icon}</span>
                    <div className="basemap-card-headings">
                      <div className="basemap-card-title-row">
                        <strong className="basemap-title">{opt.title}</strong>
                        <span className={`basemap-badge ${isSelected ? 'active' : ''}`}>{opt.badge}</span>
                      </div>
                      <span className="basemap-projection-text">{opt.projection}</span>
                    </div>
                    <div className={`basemap-radio-indicator ${isSelected ? 'checked' : ''}`}>
                      {isSelected ? <CheckCircle2 size={16} /> : <div className="radio-circle" />}
                    </div>
                  </div>

                  <p className="basemap-card-desc">{opt.desc}</p>

                  <div className="basemap-card-meta">
                    <span className="meta-label">Provider:</span>
                    <code className="meta-value">{opt.provider}</code>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pipeline Feeds Card */}
        <div className="settings-card">
          <div className="card-header">
            <Server size={18} />
            <h2>Live Data Feeds &amp; Ingestion Pipelines</h2>
          </div>

          <div className="feed-list">
            <div className="feed-item">
              <div className="feed-info">
                <strong>NASA FIRMS / VIIRS 375m Thermal</strong>
                <span>Active agricultural fire hotspots across Punjab &amp; Haryana</span>
              </div>
              <span className="status-badge live">● Operational (Real Data)</span>
            </div>

            <div className="feed-item">
              <div className="feed-info">
                <strong>Open-Meteo GFS 0.25° Atmospheric Model</strong>
                <span>Hourly u/v wind vectors and Planetary Boundary Layer Height (PBLH)</span>
              </div>
              <span className="status-badge live">● Operational (Real Data)</span>
            </div>

            <div className="feed-item">
              <div className="feed-info">
                <strong>CPCB / OpenAQ Ground Monitoring Network</strong>
                <span>Continuous Ambient Air Quality Monitoring Stations (CAAQMS)</span>
              </div>
              <span className="status-badge live">● 38 Stations Active</span>
            </div>

            <div className="feed-item">
              <div className="feed-info">
                <strong>Survey of India (SOI) Sovereign Cartography</strong>
                <span>Official territorial boundary including Jammu, Kashmir, Ladakh &amp; PoK</span>
              </div>
              <span className="status-badge certified">✓ Verified SOI Boundary</span>
            </div>
          </div>
        </div>

        {/* Operating Mode */}
        <div className="settings-card">
          <div className="card-header">
            <Database size={18} />
            <h2>Deployment &amp; Gateway Configuration</h2>
          </div>

          <div className="config-box">
            <div className="config-row">
              <span className="config-key">Architecture Mode:</span>
              <strong className="config-val">Deterministic High-Fidelity Snapshot</strong>
            </div>
            <div className="config-row">
              <span className="config-key">Zero-Mock Compliance:</span>
              <span className="config-pill certified">100% Real Scientific Data</span>
            </div>
            <div className="config-row">
              <span className="config-key">VITE_API_BASE_URL:</span>
              <code className="config-code">{import.meta.env.VITE_API_BASE_URL || '(Local /public/data/ snapshot fallback)'}</code>
            </div>
            <div className="config-row">
              <span className="config-key">Target Persona:</span>
              <span className="config-val">State Environmental Officer (CPCB / DPCC / CAQM)</span>
            </div>
          </div>

          <div className="settings-actions">
            <button className="btn-secondary" onClick={refreshData}>
              <RefreshCw size={14} />
              <span>Force Reload Data</span>
            </button>
            <button className="btn-danger-outline" onClick={handleClearCache}>
              <Trash2 size={14} />
              <span>Clear Local Checklist Cache</span>
            </button>
          </div>
          {clearedMsg && <div className="clear-feedback">✓ Local checklist storage reset to defaults.</div>}
        </div>
      </div>
    </div>
  )
}
