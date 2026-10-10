import { useMemo, useState } from 'react'
import {
  Baby,
  Download,
  Filter,
  HeartPulse,
  MapPin,
  Search,
  Users,
} from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskLabel, riskBadgeClass } from '@/types/schemas'
import { buildCsv, downloadText } from './csv'
import './PopulationRiskView.css'

export default function PopulationRiskView() {
  const { rankedSites, setActiveTab, setSelectedSiteId, setFlyToLocation } = useAeris()
  const [filterType, setFilterType] = useState<'all' | 'school' | 'hospital'>('all')
  const [filterRisk, setFilterRisk] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)

  const sites = useMemo(() => rankedSites?.sites ?? [], [rankedSites])
  const exposed = rankedSites?.exposed_population.data_available === false ? null : rankedSites?.exposed_population

  const schools = useMemo(() => sites.filter((s) => s.type === 'school'), [sites])
  const hospitals = useMemo(() => sites.filter((s) => s.type === 'hospital'), [sites])

  const schoolChildren = useMemo(() => {
    return schools.reduce((acc, s) => acc + (s.occupancy ?? 0), 0)
  }, [schools])

  const hospitalPatients = useMemo(() => {
    return hospitals.reduce((acc, s) => acc + (s.occupancy ?? 0), 0)
  }, [hospitals])

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const matchType = filterType === 'all' || s.type === filterType
      const level = getRiskLevel(s.risk_score)
      const matchRisk = filterRisk === 'all' || level === filterRisk
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.site_id.toLowerCase().includes(searchQuery.toLowerCase())
      return matchType && matchRisk && matchSearch
    })
  }, [sites, filterType, filterRisk, searchQuery])

  const exportPopulationCsv = () => {
    const headers = ['Rank', 'Site ID', 'Facility Name', 'Type', 'Latitude', 'Longitude', 'Occupancy', 'ETA (Hours)', 'Delta PM2.5 (ug/m3)', 'Risk Score', 'Risk Level']
    const rows = filteredSites.map((s) => [
      s.rank,
      s.site_id,
      s.name,
      s.type,
      s.lat,
      s.lon,
      s.occupancy ?? 'N/A',
      s.eta_hours,
      s.pm25_delta_ugm3,
      s.risk_score.toFixed(3),
      riskLabel(getRiskLevel(s.risk_score)),
    ])
    downloadText(`AERIS_Ranked_Facilities_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows))
  }

  const handleInspectMap = (site: (typeof sites)[0]) => {
    setSelectedSiteId(site.site_id)
    setFlyToLocation({ lon: site.lon, lat: site.lat, zoom: 13, name: site.name })
    setActiveTab('map')
  }

  return (
    <div className="population-risk-view">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-badge">
            <Users size={14} />
            <span>Heuristic facility ranking</span>
          </div>
          <h1 className="view-title">Population Estimates &amp; Ranked Facilities</h1>
          <p className="view-subtitle">
            Facilities ranked by uncalibrated plume and risk heuristics. Occupancy is reported capacity, not observed people or medically validated exposure.
          </p>
        </div>

        <div className="view-actions">
          <button className="btn-secondary" onClick={exportPopulationCsv}>
            <Download size={15} />
            <span>Export Demographic Register CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="pop-kpi-grid">
        <div className="pop-kpi-card">
          <span className="kpi-label">Modelled Corridor Population</span>
          <div className="kpi-val-row">
            <span className="kpi-val danger">{exposed ? exposed.estimate.toLocaleString() : 'Unavailable'}</span>
            <span className="kpi-unit">Individuals</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">{exposed ? `Threshold sensitivity range: ${exposed.low.toLocaleString()} – ${exposed.high.toLocaleString()}` : 'Population cells unavailable; zero exposure cannot be inferred.'}</span>
          </div>
        </div>

        <div className="pop-kpi-card">
          <span className="kpi-label">Known School Capacity</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{schoolChildren.toLocaleString()}</span>
            <span className="kpi-unit">Capacity</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Across {schools.length} educational institutions</span>
          </div>
        </div>

        <div className="pop-kpi-card">
          <span className="kpi-label">Known Hospital Capacity</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{hospitalPatients.toLocaleString()}</span>
            <span className="kpi-unit">Capacity</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Across {hospitals.length} acute healthcare facilities</span>
          </div>
        </div>

        <div className="pop-kpi-card">
          <span className="kpi-label">Very High Heuristic Scores</span>
          <div className="kpi-val-row">
            <span className="kpi-val danger">{sites.filter((s) => s.risk_score >= 0.85).length}</span>
            <span className="kpi-unit">Critical</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Composite risk score ≥0.85; not a probability</span>
          </div>
        </div>
      </div>

      {/* Demographic Cohorts Row */}
      <div className="cohorts-grid">
        <div className="cohort-card pediatric">
          <div className="cohort-icon"><Baby size={22} /></div>
          <div className="cohort-content">
            <div className="cohort-title">School facilities</div>
            <div className="cohort-stat">{schoolChildren.toLocaleString()} known capacity · {schools.filter(site => site.occupancy == null).length} unknown</div>
            <p className="cohort-desc">
              School type alone does not provide ages, enrollment, attendance, or individual exposure measurements.
            </p>
          </div>
        </div>

        <div className="cohort-card clinical">
          <div className="cohort-icon"><HeartPulse size={22} /></div>
          <div className="cohort-content">
            <div className="cohort-title">Hospital facilities</div>
            <div className="cohort-stat">{hospitalPatients.toLocaleString()} known capacity · {hospitals.filter(site => site.occupancy == null).length} unknown</div>
            <p className="cohort-desc">
              Hospital type alone does not provide clinical cohorts, admissions, occupied beds, or individual exposure measurements.
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="pop-controls-row">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search facility by name or ID..."
            aria-label="Search facilities"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-pills">
          <div className="type-buttons">
            <button
              className={`pill-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All ({sites.length})
            </button>
            <button
              className={`pill-btn ${filterType === 'school' ? 'active' : ''}`}
              onClick={() => setFilterType('school')}
            >
              Schools ({schools.length})
            </button>
            <button
              className={`pill-btn ${filterType === 'hospital' ? 'active' : ''}`}
              onClick={() => setFilterType('hospital')}
            >
              Hospitals ({hospitals.length})
            </button>
          </div>

          <div className="risk-select-wrap">
            <Filter size={13} />
            <select aria-label="Filter facility heuristic risk" value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
              <option value="all">All Risk Levels</option>
              <option value="very-high">Very High (≥0.85)</option>
              <option value="high">High (0.65–0.84)</option>
              <option value="medium">Medium (0.40–0.64)</option>
              <option value="low">Low (&lt;0.40)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Facilities Register Table */}
      <div className="facilities-table-panel">
        <div className="table-header-meta">
          <span className="results-count">Showing {Math.min(visibleCount, filteredSites.length)} of {filteredSites.length} matching facilities ({sites.length} total)</span>
        </div>
        <div className="table-responsive">
          <table className="facilities-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Facility Name</th>
                <th>Type</th>
                <th>Occupancy</th>
                <th>Plume Arrival ETA</th>
                <th>Modeled ΔPM2.5</th>
                <th>Composite Risk</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.slice(0, visibleCount).map((s) => {
                const level = getRiskLevel(s.risk_score)
                const badgeClass = riskBadgeClass(level)

                return (
                  <tr key={s.site_id}>
                    <td><span className="rank-badge">#{s.rank}</span></td>
                    <td>
                      <div className="fac-name-cell">
                        <strong>{s.name}</strong>
                        <span className="fac-coords">{s.lat.toFixed(4)}°N, {s.lon.toFixed(4)}°E</span>
                      </div>
                    </td>
                    <td>
                      <span className={`type-tag ${s.type}`}>
                        {s.type === 'school' ? '🏫 School' : '🏥 Hospital'}
                      </span>
                    </td>
                    <td><strong>{s.occupancy != null ? s.occupancy.toLocaleString() : 'Unknown'}</strong></td>
                    <td>
                      <span className="eta-tag">{s.eta_hours.toFixed(1)} hrs</span>
                    </td>
                    <td>
                      <span className="delta-tag">+{Math.round(s.pm25_delta_ugm3)} µg/m³</span>
                    </td>
                    <td>
                      <span className={badgeClass}>{riskLabel(level)} ({s.risk_score.toFixed(2)})</span>
                    </td>
                    <td>
                      <button className="btn-inspect-map" onClick={() => handleInspectMap(s)}>
                        <MapPin size={13} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredSites.length === 0 && <tr><td colSpan={8}>No facilities match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredSites.length > visibleCount && <button type="button" className="btn-secondary" onClick={() => setVisibleCount(count => count + 50)}>Show more facilities</button>}
      </div>
    </div>
  )
}
