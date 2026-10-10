import { useState } from 'react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskBadgeClass, riskLabel, type RankedSite } from '@/types/schemas'
import './TopAffectedAreas.css'

function siteIcon(type: 'school' | 'hospital'): string {
  return type === 'hospital' ? '🏥' : '🏫'
}

export default function TopAffectedAreas() {
  const { rankedSites, setSelectedSiteId, setActiveTab, setFlyToLocation } = useAeris()
  const [filterType, setFilterType] = useState<'all' | 'hospital' | 'school'>('all')

  const allSites = rankedSites?.sites ?? []
  const sites = allSites
    .filter(s => filterType === 'all' || s.type === filterType)
    .slice(0, 4)

  return (
    <div className="top-areas card">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 className="section-title">Top Affected Areas</h2>
          <div className="area-filter-chips">
            <button
              type="button"
              className={`chip-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
              title="Show all prioritized receptor facilities"
            >
              All
            </button>
            <button
              type="button"
              className={`chip-btn ${filterType === 'school' ? 'active' : ''}`}
              onClick={() => setFilterType('school')}
              title="Filter to schools"
            >
              Schools
            </button>
            <button
              type="button"
              className={`chip-btn ${filterType === 'hospital' ? 'active' : ''}`}
              onClick={() => setFilterType('hospital')}
              title="Filter to hospitals"
            >
              Hospitals
            </button>
          </div>
        </div>
        <button
          type="button"
          className="section-link"
          onClick={() => setActiveTab('population')}
          title="Open Population Risk Registry"
        >
          View All ({allSites.length}) →
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="areas-empty">
          <span className="text-tertiary text-sm">No facilities match the selected filter.</span>
        </div>
      ) : (
        <ul className="areas-list">
          {sites.map((site: RankedSite) => {
            const level = getRiskLevel(site.risk_score)
            const occupancyText = site.occupancy != null
              ? `${site.occupancy.toLocaleString()} capacity`
              : 'capacity unknown'

            return (
              <li key={site.site_id}>
              <button
                type="button"
                className="area-item"
                onClick={() => { setSelectedSiteId(site.site_id); setFlyToLocation({ lat: site.lat, lon: site.lon, name: site.name, zoom: 12 }); setActiveTab('map') }}
                aria-label={`${site.name} (${site.site_id}) — ${riskLabel(level)} heuristic risk; open map`}
              >
                <div className="area-icon">{siteIcon(site.type)}</div>
                <div className="area-body">
                  <div className="area-name">
                    <span>{site.name}</span>
                    <span className="area-site-tag">#{site.site_id}</span>
                  </div>
                  <div className="area-loc text-xs text-tertiary">
                    {site.lat.toFixed(3)}°N, {site.lon.toFixed(3)}°E &bull;{' '}
                    <span style={{ textTransform: 'capitalize' }}>{site.type}</span> &bull;{' '}
                    <span>{occupancyText}</span> &bull;{' '}
                    <span>+{site.pm25_delta_ugm3.toFixed(0)} µg/m³ PM2.5</span>
                  </div>
                </div>
                <div className="area-right">
                  <span className={riskBadgeClass(level)} title="Uncalibrated relative risk score, not a probability">
                    {riskLabel(level)} ({site.risk_score.toFixed(2)})
                  </span>
                  <span className="area-eta text-xs text-tertiary" title="Model ETA is relative to its originating forecast; the ranked feed does not link its forecast origin.">
                    Forecast-relative ETA +{site.eta_hours.toFixed(1)} h · Absolute arrival unavailable
                  </span>
                </div>
              </button></li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
