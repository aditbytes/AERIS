import { useMemo, useState } from 'react'
import {
  Download,
  Flame,
  Layers,
  MapPin,
  Radio,
  Search,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './FireSourcesView.css'

export default function FireSourcesView() {
  const { sources, setActiveTab, setFlyToLocation } = useAeris()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'frp' | 'count' | 'confidence'>('frp')
  const [minFrp, setMinFrp] = useState(0)
  const [scopeFilter, setScopeFilter] = useState<'all' | 'india' | 'transboundary'>('all')

  const sourceList = sources?.sources ?? []

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
    const headers = ['Cluster ID', 'Territory', 'District', 'State', 'Country', 'Latitude', 'Longitude', 'Hotspots', 'FRP (MW)', 'Confidence', 'Emission Flux', 'Airshed Role']
    const rows = sourceList.map((s) => [
      s.id,
      s.territory || 'india',
      `"${s.district || ''}"`,
      `"${s.state || ''}"`,
      `"${s.country || ''}"`,
      s.lat,
      s.lon,
      s.fire_count,
      s.total_frp_mw,
      (s.confidence * 100).toFixed(0) + '%',
      s.emission_strength.toFixed(2),
      `"${s.airshed_role || ''}"`,
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `AERIS_VIIRS_Fire_Clusters_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
            <span>NASA FIRMS / VIIRS Active Fire Registry</span>
          </div>
          <h1 className="view-title">Agricultural Fire Sources &amp; Hotspot Clusters</h1>
          <p className="view-subtitle">
            Satellite thermal anomalies detected by VIIRS NOAA-20 &amp; NOAA-21 (375m resolution) across Punjab &amp; Haryana.
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
            <span className="kpi-sub">Total thermal radiative energy emitted</span>
          </div>
        </div>

        <div className="fires-kpi-card">
          <span className="kpi-label">Active Satellite Hotspots</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{totalHotspots}</span>
            <span className="kpi-unit">Detections</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Aggregated into {sourceList.length} major plumes</span>
          </div>
        </div>

        <div className="fires-kpi-card">
          <span className="kpi-label">High Confidence Ratio</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{highConfCount} of {sourceList.length}</span>
            <span className="kpi-unit">({Math.round((highConfCount / Math.max(1, sourceList.length)) * 100)}%)</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">VIIRS thermal quality flag &gt; 80%</span>
          </div>
        </div>

        <div className="fires-kpi-card">
          <span className="kpi-label">Primary Epicenter</span>
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
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="frp">Radiative Power (FRP)</option>
              <option value="count">Hotspot Count</option>
              <option value="confidence">Confidence %</option>
            </select>
          </div>

          <div className="frp-slider-group">
            <span>Min FRP: {minFrp} MW</span>
            <input
              type="range"
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
                  <th>Sensor Conf.</th>
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
                          {isTrans ? '🌐 Transboundary' : '🇮🇳 Domestic'}
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
                const maxVal = sourceList[0]?.total_frp_mw || 1
                const pct = (s.total_frp_mw / maxVal) * 100
                const isTrans = s.territory === 'transboundary'

                return (
                  <div key={s.id} className="rank-item">
                    <div className="rank-item-header">
                      <span className="rank-num">#{idx + 1}</span>
                      <div className="rank-name-box">
                        <span className="rank-name">{s.district || s.id}</span>
                        <span className="rank-flag">{isTrans ? '🌐 PK' : '🇮🇳 IN'}</span>
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
              <span>Satellite Sensor Fidelity</span>
            </div>
            <p className="info-body">
              Data retrieved from Suomi-NPP &amp; NOAA-20 VIIRS sensors via NASA FIRMS. 375m spatial resolution minimizes cloud and sub-pixel saturation artifacts.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
