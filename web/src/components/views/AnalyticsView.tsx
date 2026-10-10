import { useMemo, useState } from 'react'
import {
  Activity,
  Building2,
  FileSpreadsheet,
  GraduationCap,
} from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskLabel } from '@/types/schemas'
import './AnalyticsView.css'
import { buildCsv, downloadText } from './csv'

export default function AnalyticsView() {
  const { rankedSites, aqi, setActiveTab, setFlyToLocation } = useAeris()
  const [hoveredBin, setHoveredBin] = useState<number | null>(null)
  const [hoveredStation, setHoveredStation] = useState<string | null>(null)

  const sites = useMemo(() => rankedSites?.sites ?? [], [rankedSites])
  const stations = useMemo(() => aqi?.stations ?? [], [aqi])

  // Top Metrics
  const meanDelta = useMemo(() => {
    if (!sites.length) return null
    const sum = sites.reduce((acc, s) => acc + s.pm25_delta_ugm3, 0)
    return Math.round((sum / sites.length) * 10) / 10
  }, [sites])

  const maxStationAqi = useMemo(() => {
    const valid = stations.filter(station => station.aqi != null)
    if (!valid.length) return { aqi: null, name: 'Unavailable' }
    let top = valid[0]
    for (const s of valid) {
      if (s.aqi! > top.aqi!) top = s
    }
    return { aqi: top.aqi!, name: top.name }
  }, [stations])

  const severeSiteCount = useMemo(() => {
    return sites.filter((s) => s.risk_score >= 0.65).length
  }, [sites])

  // Schools vs Hospitals split
  const schools = useMemo(() => sites.filter((s) => s.type === 'school'), [sites])
  const hospitals = useMemo(() => sites.filter((s) => s.type === 'hospital'), [sites])

  const schoolOccupancy = useMemo(() => {
    return schools.reduce((acc, s) => acc + (s.occupancy ?? 0), 0)
  }, [schools])

  const hospitalOccupancy = useMemo(() => {
    return hospitals.reduce((acc, s) => acc + (s.occupancy ?? 0), 0)
  }, [hospitals])

  // PM2.5 Delta Histogram Bins: [0-50, 50-100, 100-150, 150-200, >200]
  const histogramBins = useMemo(() => {
    const bins = [
      { range: '0–50', min: 0, max: 50, schools: 0, hospitals: 0, total: 0 },
      { range: '50–100', min: 50, max: 100, schools: 0, hospitals: 0, total: 0 },
      { range: '100–150', min: 100, max: 150, schools: 0, hospitals: 0, total: 0 },
      { range: '150–200', min: 150, max: 200, schools: 0, hospitals: 0, total: 0 },
      { range: '≥200', min: 200, max: Infinity, schools: 0, hospitals: 0, total: 0 },
    ]

    sites.forEach((s) => {
      const b = bins.find((bin) => s.pm25_delta_ugm3 >= bin.min && s.pm25_delta_ugm3 < bin.max)
      if (b) {
        b.total++
        if (s.type === 'school') b.schools++
        else b.hospitals++
      }
    })

    return bins
  }, [sites])

  const maxBinCount = Math.max(1, ...histogramBins.map((b) => b.total))

  // District Aggregation (extract district or group logically by lat/lon)
  const districtGroups = useMemo(() => {
    const map = new Map<string, { count: number; maxDelta: number; totalOcc: number; vhCount: number }>()

    sites.forEach((s) => {
      let district = 'Latitude ≤29.3°N'
      if (s.lat > 31.0) district = 'Latitude >31°N'
      else if (s.lat > 30.5) district = 'Latitude (30.5,31]°N'
      else if (s.lat > 30.0) district = 'Latitude (30,30.5]°N'
      else if (s.lat > 29.3) district = 'Latitude (29.3,30]°N'

      const existing = map.get(district) ?? { count: 0, maxDelta: 0, totalOcc: 0, vhCount: 0 }
      existing.count++
      existing.maxDelta = Math.max(existing.maxDelta, s.pm25_delta_ugm3)
      existing.totalOcc += s.occupancy ?? 0
      if (s.risk_score >= 0.85) existing.vhCount++
      map.set(district, existing)
    })

    return Array.from(map.entries()).map(([district, data]) => ({
      district,
      ...data,
    }))
  }, [sites])

  // Export full analytics summary to CSV
  const exportAnalyticsCsv = () => {
    const headers = ['Facility Name', 'Type', 'Latitude', 'Longitude', 'Occupancy', 'ETA (Hours)', 'Delta PM2.5 (ug/m3)', 'Risk Score', 'Risk Category']
    const rows = sites.map((s) => [
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
    downloadText(`AERIS_Modelled_Facility_Analysis_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows))
  }

  return (
    <div className="analytics-view">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-badge">
            <Activity size={14} />
            <span>Statistical Modeling &amp; Risk Inference</span>
          </div>
          <h1 className="view-title">Environmental Risk &amp; Exposure Analytics</h1>
          <p className="view-subtitle">
            Modelled plume values at {sites.length} ranked facilities and separate ground-station observations. No historical model validation is established.
          </p>
        </div>

        <div className="view-actions">
          <button className="btn-secondary" onClick={exportAnalyticsCsv}>
            <FileSpreadsheet size={15} />
            <span>Export Analytics CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <span className="kpi-label">Mean Plume ΔPM2.5</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{meanDelta == null ? 'Unavailable' : `+${meanDelta}`}</span>
            <span className="kpi-unit">µg/m³</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Uncalibrated model increment; source attribution is provisional</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <span className="kpi-label">Peak Ground Station AQI</span>
          <div className="kpi-val-row">
            <span className="kpi-val danger">{maxStationAqi.aqi ?? 'Unavailable'}</span>
            <span className="kpi-unit">AQI</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">{maxStationAqi.name}; observation freshness must be checked separately</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <span className="kpi-label">High Heuristic Risk Receptors</span>
          <div className="kpi-val-row">
            <span className="kpi-val">{severeSiteCount}</span>
            <span className="kpi-unit">of {sites.length}</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">Facilities exceeding 0.65 composite risk</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <span className="kpi-label">Historical Model Validation</span>
          <div className="kpi-val-row">
            <span className="kpi-val">Unavailable</span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-sub">No observed/model pairing or calibrated skill score is supplied</span>
          </div>
        </div>
      </div>

      {/* Row 2: Histogram & Vulnerability Split */}
      <div className="analytics-two-col">
        {/* PM2.5 Histogram */}
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Modelled ΔPM2.5 across {sites.length} Facilities</h2>
              <p className="panel-sub">Frequency of schools and hospitals categorized by simulated smoke delta.</p>
            </div>
          </div>

          <div className="histogram-container">
            <div className="histogram-bars">
              {histogramBins.map((bin, i) => {
                const heightPct = (bin.total / maxBinCount) * 100
                const isHovered = hoveredBin === i

                return (
                  <div
                    key={bin.range}
                    className={`hist-col ${isHovered ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredBin(i)}
                    onMouseLeave={() => setHoveredBin(null)}
                  >
                    <div className="hist-bar-wrapper">
                      <div className="hist-bar-total" style={{ height: `${heightPct}%` }}>
                        <div
                          className="hist-seg school-seg"
                          style={{ height: `${bin.total > 0 ? (bin.schools / bin.total) * 100 : 0}%` }}
                        />
                        <div
                          className="hist-seg hospital-seg"
                          style={{ height: `${bin.total > 0 ? (bin.hospitals / bin.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="hist-count">{bin.total}</span>
                    </div>
                    <span className="hist-label">{bin.range} µg/m³</span>
                  </div>
                )
              })}
            </div>

            <div className="histogram-legend">
              <span className="legend-item"><span className="legend-box sch-box" /> Schools ({schools.length})</span>
              <span className="legend-item"><span className="legend-box hosp-box" /> Hospitals ({hospitals.length})</span>
            </div>

            {hoveredBin !== null && (
              <div className="hist-tooltip">
                <strong>Bucket: {histogramBins[hoveredBin].range} µg/m³</strong> —{' '}
                {histogramBins[hoveredBin].schools} Schools,{' '}
                {histogramBins[hoveredBin].hospitals} Hospitals ({histogramBins[hoveredBin].total} total facilities)
              </div>
            )}
          </div>
        </div>

        {/* Vulnerability Split Card */}
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Receptor Vulnerability Breakdown</h2>
              <p className="panel-sub">Reported facility capacity by type. Ages, attendance, patient cohorts, and measured exposure are unavailable.</p>
            </div>
          </div>

          <div className="vuln-grid">
            <div className="vuln-box school-box">
              <div className="vuln-icon"><GraduationCap size={24} /></div>
              <div className="vuln-info">
                <span className="vuln-name">Primary &amp; Senior Secondary Schools</span>
                <span className="vuln-stat">{schools.length} Facilities</span>
                <span className="vuln-occ">{schoolOccupancy.toLocaleString()} known capacity · {schools.filter(site => site.occupancy == null).length} unknown</span>
                <p className="vuln-desc">
                  Facility type does not establish individual ages or observed attendance.
                </p>
              </div>
            </div>

            <div className="vuln-box hospital-box">
              <div className="vuln-icon"><Building2 size={24} /></div>
              <div className="vuln-info">
                <span className="vuln-name">Hospitals &amp; Healthcare Centers</span>
                <span className="vuln-stat">{hospitals.length} Facilities</span>
                <span className="vuln-occ">{hospitalOccupancy.toLocaleString()} known capacity · {hospitals.filter(site => site.occupancy == null).length} unknown</span>
                <p className="vuln-desc">
                  Facility type does not establish patient demographics, occupied beds, or clinical exposure.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Sensor-to-Satellite Correlation & District Table */}
      <div className="analytics-two-col">
        {/* Sensor Scatter Plot */}
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Ground Station Observations</h2>
              <p className="panel-sub">Separate observations; they do not establish plume attribution or model skill.</p>
            </div>
          </div>

          <div className="station-scatter-wrapper">
            <div className="station-pills-list">
              {stations.slice(0, 10).map((st) => {
                const aqiVal = st.aqi
                const aqiClass = aqiVal == null ? '' : aqiVal > 400 ? 'badge-vh' : aqiVal > 300 ? 'badge-h' : 'badge-m'

                return (
                  <button
                    type="button"
                    key={st.id}
                    className={`station-row ${hoveredStation === st.id ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredStation(st.id)}
                    onMouseLeave={() => setHoveredStation(null)}
                    onClick={() => {
                      setFlyToLocation({ lon: st.lon, lat: st.lat, zoom: 12, name: st.name })
                      setActiveTab('map')
                    }}
                  >
                    <div className="station-name-col">
                      <span className="st-name">{st.name}</span>
                      <span className="st-source">{st.source} • {st.lat.toFixed(2)}°N, {st.lon.toFixed(2)}°E · observed {st.observed_at ?? 'time unavailable'}</span>
                    </div>
                    <div className="station-val-col">
                      <span className={`badge ${aqiClass}`}>AQI {st.aqi ?? 'N/A'}</span>
                      <span className="st-pm">PM2.5: {st.pm25 ?? 'N/A'} µg/m³</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* District Summary Table */}
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Facilities by Latitude Band</h2>
              <p className="panel-sub">Display-only latitude groups; not administrative districts. Known capacities exclude missing occupancy.</p>
            </div>
          </div>

          <div className="district-table-wrapper">
            <table className="district-table">
              <thead>
                <tr>
                  <th>Corridor Zone</th>
                  <th>Facilities</th>
                  <th>Max ΔPM2.5</th>
                  <th>Occupancy</th>
                  <th>Urgent</th>
                </tr>
              </thead>
              <tbody>
                {districtGroups.map((d) => (
                  <tr key={d.district}>
                    <td className="zone-name"><strong>{d.district}</strong></td>
                    <td>{d.count}</td>
                    <td><span className="delta-badge">+{Math.round(d.maxDelta)} µg/m³</span></td>
                    <td>{d.totalOcc.toLocaleString()}</td>
                    <td>
                      <span className={`urgent-count ${d.vhCount > 0 ? 'alert' : ''}`}>
                        {d.vhCount} sites
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
