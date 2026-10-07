import { useAeris } from '@/services/dataContext'
import { getRiskLevel, riskBadgeClass, riskLabel, type RankedSite } from '@/types/schemas'
import './TopAffectedAreas.css'

function siteIcon(type: 'school' | 'hospital'): string {
  return type === 'hospital' ? '🏥' : '🏫'
}

function etaToTime(eta: number): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() + Math.round(eta * 60))
  return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function TopAffectedAreas() {
  const { rankedSites, setSelectedSiteId, setActiveTab } = useAeris()
  const sites = rankedSites?.sites.slice(0, 4) ?? []

  return (
    <div className="top-areas card">
      <div className="section-header">
        <h2 className="section-title">Top Affected Areas</h2>
        <span
          className="section-link"
          onClick={() => setActiveTab('population')}
          role="button"
          tabIndex={0}
          title="Open Population Risk Registry"
        >
          View All →
        </span>
      </div>

      {sites.length === 0 ? (
        <div className="areas-empty">
          <span className="text-tertiary text-sm">Waiting for data...</span>
        </div>
      ) : (
        <ul className="areas-list">
          {sites.map((site: RankedSite) => {
            const level = getRiskLevel(site.risk_score)
            return (
              <li
                key={site.site_id}
                className="area-item"
                onClick={() => setSelectedSiteId(site.site_id)}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelectedSiteId(site.site_id)}
                role="button"
                aria-label={`${site.name} — ${riskLabel(level)} risk`}
              >
                <div className="area-icon">{siteIcon(site.type)}</div>
                <div className="area-body">
                  <div className="area-name">{site.name}</div>
                  <div className="area-loc text-xs text-tertiary">
                    {site.lat.toFixed(2)}°N, {site.lon.toFixed(2)}°E
                  </div>
                </div>
                <div className="area-right">
                  <span className={riskBadgeClass(level)}>{riskLabel(level)}</span>
                  <span className="area-eta text-xs text-tertiary">
                    Arrival: {etaToTime(site.eta_hours)}
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
