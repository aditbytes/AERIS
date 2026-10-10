import { useMemo, useState } from 'react'
import {
  Download,
  Flame,
  MapPin,
  Radio,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './FireSourcesView.css'
import { buildCsv, downloadText } from './csv'

export default function FireSourcesView() {
  const { sources, setActiveTab, setFlyToLocation } = useAeris()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'frp' | 'count' | 'confidence'>('frp')
  const [minFrp, setMinFrp] = useState(0)
  const [scopeFilter, setScopeFilter] = useState<'all' | 'india' | 'transboundary'>('all')

  const sourceList = useMemo(() => sources?.sources ?? [], [sources])

  // Metrics
  const totalFrp = useMemo(() => {
    return Math.round(sourceList.reduce((acc, s) => acc + s.total_frp_mw, 0))
  }, [sourceList])

  const indiaSources = useMemo(() => {
    return sourceList.filter(s => s.territory === 'india')
  }, [sourceList])

  const transboundarySources = useMemo(() => {
    return sourceList.filter(s => s.territory === 'transboundary')
  }, [sourceList])

  const totalHotspots = useMemo(() => {
    return sourceList.reduce((acc, s) => acc + s.fire_count, 0)
  }, [sourceList])

  const highConfCount = useMemo(() => {
    return sourceList.filter((s) => s.confidence >= 0.8).length
  }, [sourceList])

  const maxCluster = useMemo(() => {
    if (!sourceList.length) return null
    return [...sourceList].sort((a, b) => b.total_frp_mw - a.total_frp_mw)[0]
  }, [sourceList])

  // Filtered & Sorted list
  const filteredSources = useMemo(() => {
    return sourceList
      .filter((s) => {
        const query = searchTerm.toLowerCase()
        const matchesQuery = s.id.toLowerCase().includes(query) ||
          (s.district && s.district.toLowerCase().includes(query)) ||
          (s.location_name && s.location_name.toLowerCase().includes(query)) ||
          s.lat.toFixed(2).includes(query) ||
          s.lon.toFixed(2).includes(query)
        const matchesFrp = s.total_frp_mw >= minFrp
        const matchesScope = scopeFilter === 'all' || s.territory === scopeFilter
        return matchesQuery && matchesFrp && matchesScope
      })
      .sort((a, b) => {
        if (sortBy === 'frp') return b.total_frp_mw - a.total_frp_mw
        if (sortBy === 'count') return b.fire_count - a.fire_count
        return b.confidence - a.confidence
      })
  }, [sourceList, searchTerm, minFrp, scopeFilter, sortBy])

  // Export CSV
  const exportCsv = () => {
    const headers = ['Candidate ID', 'Territory', 'District', 'State', 'Country', 'Latitude', 'Longitude', 'Fire Pixels', 'FRP (MW)', 'Heuristic Confidence', 'Heuristic Strength', 'Airshed Role']
    const rows = filteredSources.map(s => [s.id, s.territory ?? 'unknown', s.district, s.state, s.country, s.lat, s.lon, s.fire_count, s.total_frp_mw, s.confidence, s.emission_strength, s.airshed_role])
    downloadText(`AERIS_Source_Candidates_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows))
  }

  const handleInspectMap = (lat: number, lon: number, name: string) => {
    setFlyToLocation({ lon, lat, zoom: 11, name })
    setActiveTab('map')
  }

  return (
    <div className="fire-sources-view">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-badge">
            <Flame size={14} />
            <span>Captured NASA FIRMS thermal detections</span>
          </div>
          <h1 className="view-title">Fire-Derived Source Candidates &amp; Hotspot Clusters</h1>
          <p className="view-subtitle">
            Source candidates clustered from captured NASA FIRMS thermal detections. Source classification, confidence, and emission strength are uncalibrated heuristics.
          </p>
        </div>

        <div className="view-actions">
          <button className="btn-secondary" onClick={exportCsv}>
            <Download size={15} />
            <span>Export Satellite Registry CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="fires-kpi-grid">
        <div className="fires-kpi-card">
          <span className="kpi-label">Cumulative Fire Radiative Power</span>
          <div className="kpi-val-row">
            <span className="kpi-val danger">{totalFrp.toLocaleString()}</span>
            <span className="kpi-unit">MW</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Sum of captured fire radiative power, not pollutant concentration</span>
          </div>
        </div>

        <div className="fires-kpi-card">
          <span className="kpi-label">Captured Satellite Hotspots</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{totalHotspots}</span>
            <span className="kpi-unit">Detections</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Aggregated into {sourceList.length} source candidate clusters</span>
          </div>
        </div>

        <div className="fires-kpi-card">
          <span className="kpi-label">High Heuristic Confidence</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{highConfCount} of {sourceList.length}</span>
            <span className="kpi-unit">({Math.round((highConfCount / Math.max(1, sourceList.length)) * 100)}%)</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Heuristic confidence score ≥ 0.80 (uncalibrated)</span>
          </div>
        </div>

        <div className="fires-kpi-card">
          <span className="kpi-label">Highest Captured Cluster FRP</span>
          <div className="kpi-val-row">
            <span className="kpi-val small">{maxCluster?.id ?? 'N/A'}</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">
              {maxCluster?.total_frp_mw.toFixed(1)} MW • {maxCluster?.fire_count} hotspots
            </span>
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="fires-control-bar">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by district, cluster ID, or coordinates..."
            aria-label="Search source candidates"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Territory Scope Pills */}
        <div className="scope-pills-group">
          <button
            type="button"
            className={`scope-filter-pill ${scopeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setScopeFilter('all')}
          >
            All Airshed ({sourceList.length})
          </button>
          <button
            type="button"
            className={`scope-filter-pill ${scopeFilter === 'india' ? 'active' : ''}`}
            onClick={() => setScopeFilter('india')}
          >
            🇮🇳 India Scope ({indiaSources.length})
          </button>
          <button
            type="button"
            className={`scope-filter-pill ${scopeFilter === 'transboundary' ? 'active' : ''}`}
            onClick={() => setScopeFilter('transboundary')}
          >
            🌐 Transboundary ({transboundarySources.length})
          </button>
        </div>

        <div className="filters-row">
          <div className="sort-group">
            <SlidersHorizontal size={14} />
            <span>Sort:</span>
            <select aria-label="Sort source candidates" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'frp' | 'count' | 'confidence')}>
              <option value="frp">Radiative Power (FRP)</option>
              <option value="count">Hotspot Count</option>
              <option value="confidence">Confidence %</option>
            </select>
          </div>

          <div className="frp-slider-group">
            <span>Min FRP: {minFrp} MW</span>
            <input
              type="range"
              aria-label="Minimum fire radiative power (MW)"
              min="0"
              max="500"
              step="25"
              value={minFrp}
              onChange={(e) => setMinFrp(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Main Grid & Chart Split */}
      <div className="fires-main-split">
        {/* Table */}
        <div className="fires-table-panel">
          <div className="table-responsive">
            <table className="fires-table">
              <thead>
                <tr>
                  <th>Cluster / ID</th>
                  <th>District / Location</th>
                  <th>Airshed Scope</th>
                  <th>FRP Intensity</th>
                  <th>Hotspots</th>
                  <th>Heuristic Conf.</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map((s) => {
                  const frpPct = Math.min(100, (s.total_frp_mw / 700) * 100)
                  const isTrans = s.territory === 'transboundary'
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="cluster-id-cell">
                          <Flame size={15} className={`flame-icon ${isTrans ? 'trans' : 'dom'}`} />
                          <div>
                            <strong>{s.id}</strong>
                            <div className="coords-text-sub">{s.lat.toFixed(3)}°N, {s.lon.toFixed(3)}°E</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="district-cell">
                          <span className="district-main">{s.district || s.type}</span>
                          <span className="district-sub">{s.location_name || s.type}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`territory-pill ${isTrans ? 'transboundary' : 'india'}`}>
                          {isTrans ? '🌐 Transboundary' : s.territory === 'india' ? '🇮🇳 Domestic' : 'Scope unavailable'}
                        </span>
                      </td>
                      <td>
                        <div className="frp-cell">
                          <div className="frp-val">{s.total_frp_mw.toFixed(1)} MW</div>
                          <div className="frp-bar-bg">
                            <div className={`frp-bar-fill ${isTrans ? 'trans-bar' : ''}`} style={{ width: `${frpPct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="count-pill">{s.fire_count} fires</span>
                      </td>
                      <td>
                        <span className={`conf-badge ${s.confidence >= 0.8 ? 'high' : 'med'}`}>
                          {Math.round(s.confidence * 100)}%
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-inspect-map"
                          onClick={() => handleInspectMap(s.lat, s.lon, s.district || s.id)}
                          title="Fly to cluster on GIS map"
                        >
                          <MapPin size={13} />
                          <span>Map</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filteredSources.length === 0 && <tr><td colSpan={7}>No source candidates match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Ranking Chart */}
        <div className="fires-ranking-panel">
          <div className="panel-header">
            <h2 className="panel-title">Top Radiative Power Hotspots</h2>
            <p className="panel-sub">Ranked by total Fire Radiative Power (MW).</p>
          </div>

          <div className="ranking-list">
            {[...sourceList]
              .sort((a, b) => b.total_frp_mw - a.total_frp_mw)
              .slice(0, 8)
              .map((s, idx) => {
                const maxVal = maxCluster?.total_frp_mw || 1
                const pct = Math.min(100, (s.total_frp_mw / maxVal) * 100)
                const isTrans = s.territory === 'transboundary'

                return (
                  <div key={s.id} className="rank-item">
                    <div className="rank-item-header">
                      <span className="rank-num">#{idx + 1}</span>
                      <div className="rank-name-box">
                        <span className="rank-name">{s.district || s.id}</span>
                        <span className="rank-flag">{s.country || (isTrans ? 'Transboundary' : s.territory === 'india' ? 'India' : 'Unknown')}</span>
                      </div>
                      <span className="rank-frp">{s.total_frp_mw.toFixed(1)} MW</span>
                    </div>
                    <div className="rank-track">
                      <div
                        className="rank-fill"
                        style={{
                          width: `${pct}%`,
                          background: isTrans
                            ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                            : 'linear-gradient(90deg, #F59E0B, #DC2626)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>

          <div className="satellite-info-box">
            <div className="info-title">
              <Radio size={14} />
              <span>Captured Feed Limitations</span>
            </div>
            <p className="info-body">
              NASA FIRMS thermal anomalies support source candidates. Cloud cover and detection limits may omit fires; heuristic confidence is not a calibrated probability or confirmed pollution attribution.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
