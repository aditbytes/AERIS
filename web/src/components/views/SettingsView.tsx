import { useState } from 'react'
import { CheckCircle2, Database, Globe, RefreshCw, Server, Settings, Trash2 } from 'lucide-react'
import { useAeris, type BasemapMode } from '@/services/dataContext'
import { DATA_MODE, getFeedFreshness } from '@/services/api'
import { clearActionChecklist } from '@/components/agent/actionChecklist'
import { useClock } from '@/components/status/useClock'
import './SettingsView.css'

const OPTIONS: { id: BasemapMode; title: string; desc: string; provider: string }[] = [
  { id: 'satellite', title: 'Satellite imagery', desc: 'Raster background imagery. Image dates and resolution vary; this is not a current fire measurement.', provider: 'Esri World Imagery and reference tiles' },
  { id: 'globe', title: 'Tilted satellite view', desc: 'Mercator map with 32° camera pitch and −6° bearing. This is a perspective view, not a spherical globe or physics model.', provider: 'Esri raster / MapLibre camera' },
  { id: 'dark', title: 'Dark cartography', desc: 'Dark basemap with the same runtime scientific layers.', provider: 'CARTO Dark Matter' },
  { id: 'topo', title: 'Street cartography', desc: 'Roads and place labels. This mode does not add terrain or elevation measurements.', provider: 'CARTO Voyager' },
]

export default function SettingsView() {
  const { refreshData, loading, refreshing, basemapMode, setBasemapMode, sources, corridor, wind, aqi, rankedSites, actions, feedErrors, staleFeeds } = useAeris()
  const [message, setMessage] = useState('')
  const now = useClock()
  const feeds = [
    { key: 'sources' as const, name: 'Source candidates', timestamp: sources?.generated_at, detail: `${sources?.sources.length ?? 0} captured candidates; confidence and strength are heuristic.` },
    { key: 'corridor' as const, name: 'Modelled plume corridor', timestamp: corridor?.generated_at, detail: `Uncalibrated model output; forecast start: ${corridor?.forecast_start ?? 'unavailable'}.` },
    { key: 'wind' as const, name: 'Forecast meteorology', timestamp: wind?.generated_at, detail: wind ? `${wind.points.length} model grid points · ${wind.source}` : 'Wind feed unavailable.' },
    { key: 'aqi' as const, name: 'Ground station observations', timestamp: aqi?.generated_at, detail: `${aqi?.stations.length ?? 0} stations; measurement timestamps may be older than file generation.` },
    { key: 'ranked_sites' as const, name: 'Ranked facilities', timestamp: rankedSites?.generated_at, detail: `${rankedSites?.sites.length ?? 0} facilities; model risk is uncalibrated.` },
    { key: 'actions' as const, name: 'Recommendations', timestamp: actions?.generated_at, detail: `${actions?.actions.length ?? 0} facility recommendations; local checklist only.` },
  ]
  return (
    <div className="settings-view">
      <div className="view-header"><div className="view-title-group"><div className="view-badge"><Settings size={14} /><span>Configuration &amp; data status</span></div><h1 className="view-title">AERIS Settings</h1><p className="view-subtitle">Observed data and uncalibrated model outputs are displayed with their availability and timestamps.</p></div></div>
      <section className="settings-card full-width">
        <div className="card-header"><Globe size={18} /><h2>Basemap</h2></div>
        <div className="basemap-cards-grid">{OPTIONS.map(option => <button type="button" key={option.id} className={`basemap-option-card ${basemapMode === option.id ? 'selected' : ''}`} aria-pressed={basemapMode === option.id} onClick={() => setBasemapMode(option.id)}><div className="basemap-card-top"><strong className="basemap-title">{option.title}</strong>{basemapMode === option.id && <CheckCircle2 size={16} aria-hidden="true" />}</div><p className="basemap-card-desc">{option.desc}</p><div className="basemap-card-meta"><span className="meta-label">Provider:</span><span className="meta-value">{option.provider}</span></div></button>)}</div>
      </section>
      <div className="settings-grid">
        <section className="settings-card"><div className="card-header"><Server size={18} /><h2>Data feed status</h2></div><div className="feed-list">{feeds.map(feed => {
          const status = getFeedFreshness(feed.key, feed.timestamp, now, !!feedErrors[feed.key] || staleFeeds.some(value => value.label === feed.key))
          return <div className="feed-item" key={feed.key}><div className="feed-info"><strong>{feed.name}</strong><span>{feed.detail}</span><span>{feed.timestamp ?? 'Timestamp unavailable'}</span>{feedErrors[feed.key] && <span>{feedErrors[feed.key]}</span>}</div><span className="status-badge">{status.status}</span></div>
        })}</div></section>
        <section className="settings-card"><div className="card-header"><Database size={18} /><h2>Data mode &amp; local state</h2></div><div className="config-box"><div className="config-row"><span>Data mode:</span><strong>{DATA_MODE === 'snapshot' ? 'Captured snapshots' : 'Configured API'}</strong></div><p>Snapshot files are served as captured. A successful load does not certify freshness, model calibration, or observed human exposure.</p><p>API configuration: {DATA_MODE === 'api' ? 'Configured at build time' : 'Not configured; using local public/data files'}</p><p>No authenticated officer session or dispatch service is implemented.</p></div><div className="settings-actions"><button type="button" className="btn-secondary" onClick={refreshData} disabled={loading || refreshing}><RefreshCw size={14} />Reload data</button><button type="button" className="btn-danger-outline" onClick={() => { clearActionChecklist(); setMessage('Local action checklist cleared. No source data changed.') }}><Trash2 size={14} />Clear local checklist</button></div>{message && <p className="clear-feedback" role="status">{message}</p>}</section>
      </div>
    </div>
  )
}
