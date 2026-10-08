import { useState } from 'react'
import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskBadgeClass, riskLabel, type RankedSite } from '@/types/schemas'
import './TopAffectedAreas.css'

function siteIcon(type: 'school' | 'hospital'): string {
  return type === 'hospital' ? '🏥' : '🏫'
}

function formatEtaTime(etaHours: number): { rel: string; abs: string } {
  const rel = etaHours <= 0.1 ? 'in < 15 min' : `in ${etaHours.toFixed(1)} h`
  const now = new Date()
  now.setMinutes(now.getMinutes() + Math.round(etaHours * 60))
  const abs = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })
  return { rel, abs: `${abs} IST` }
}

export default function TopAffectedAreas() {
  const { rankedSites, setSelectedSiteId, setActiveTab } = useAeris()
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
        <span
          className="section-link"
          onClick={() => setActiveTab('population')}
          role="button"
          tabIndex={0}
          title="Open Population Risk Registry"
        >
          View All ({allSites.length}) →
        </span>
      </div>

      {sites.length === 0 ? (
        <div className="areas-empty">
          <span className="text-tertiary text-sm">No facilities match the selected filter.</span>
        </div>
      ) : (
        <ul className="areas-list">
          {sites.map((site: RankedSite) => {
            const level = getRiskLevel(site.risk_score)
            const eta = formatEtaTime(site.eta_hours)
            const occupancyText = site.occupancy != null
              ? `${site.occupancy.toLocaleString()} capacity`
              : 'capacity unknown'

            return (
              <li
                key={site.site_id}
                className="area-item"
                onClick={() => setSelectedSiteId(site.site_id)}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelectedSiteId(site.site_id)}
                role="button"
                aria-label={`${site.name} (${site.site_id}) — ${riskLabel(level)} risk (${Math.round(site.risk_score * 100)}%)`}
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
                  <span className={riskBadgeClass(level)}>
                    {riskLabel(level)} ({Math.round(site.risk_score * 100)}%)
                  </span>
                  <span className="area-eta text-xs text-tertiary" title={`Estimated arrival: ${eta.abs}`}>
                    {eta.rel} · {eta.abs}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
