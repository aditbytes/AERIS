/**
 * WhenKpiCard — Decision Card 1: Time to Impact (WHEN)
 * Answers: "WHEN does it hit?"
 *
 * Primary: Earliest receptor ETA from ranked_sites. If <= 0, "Plume over N receptors now"
 * Secondary: Next action deadline from actions.json with site name
 * Mini-visual: 4-segment arrival strip (0-2h, 2-4h, 4-8h, 8-24h) with receptor counts
 * Footer: Transport wind context at grid point nearest dominant source
 */
import { useMemo } from 'react'
import { useAeris, useTimeHorizon } from '@/services/dataContext'
import type { TimeHorizon } from '@/services/dataContext'

function degToCompass(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16
  return directions[idx]
}

export default function WhenKpiCard() {
  const { rankedSites, actions, wind, sources, setSelectedSiteId } = useAeris()
  const { timeHorizon, setTimeHorizon } = useTimeHorizon()

  // 1. Earliest receptor ETA and count <= 0
  const { earliestEta, countOverNow, bandCounts } = useMemo(() => {
    if (!rankedSites || rankedSites.sites.length === 0) {
      return { earliestEta: null, countOverNow: 0, bandCounts: { b0_2: 0, b2_4: 0, b4_8: 0, b8_24: 0 } }
    }

    const sites = rankedSites.sites
    let minEta = Infinity
    let overCount = 0
    let b0_2 = 0
    let b2_4 = 0
    let b4_8 = 0
    let b8_24 = 0

    for (const s of sites) {
      if (s.eta_hours < minEta) minEta = s.eta_hours
      if (s.eta_hours <= 0) overCount++

      if (s.eta_hours >= 0 && s.eta_hours <= 2) b0_2++
      else if (s.eta_hours > 2 && s.eta_hours <= 4) b2_4++
      else if (s.eta_hours > 4 && s.eta_hours <= 8) b4_8++
      else if (s.eta_hours > 8 && s.eta_hours <= 24) b8_24++
    }

    return {
      earliestEta: minEta === Infinity ? null : minEta,
      countOverNow: overCount,
      bandCounts: { b0_2, b2_4, b4_8, b8_24 },
    }
  }, [rankedSites])

  // 2. Next action deadline & site name
  const nextDeadline = useMemo(() => {
    if (!actions?.actions || actions.actions.length === 0) return null
    let minD = Infinity
    let targetAct = actions.actions[0]

    for (const a of actions.actions) {
      if (a.deadline_hours < minD) {
        minD = a.deadline_hours
        targetAct = a
      }
    }

    const targetSite = rankedSites?.sites.find(s => s.site_id === targetAct.site_id)
    const siteName = targetSite?.name || targetAct.who.split(',')[1]?.trim() || targetAct.who

    return {
      hours: minD,
      siteName,
      actionId: targetAct.site_id,
    }
  }, [actions, rankedSites])

  // 3. Transport context from wind.json at nearest grid point to dominant source
  const transportContext = useMemo(() => {
    if (!sources?.sources || sources.sources.length === 0 || !wind?.points || wind.points.length === 0) {
      return null
    }

    // Dominant source
    const dominant = [...sources.sources].sort((a, b) => b.total_frp_mw - a.total_frp_mw)[0]
    if (!dominant) return null

    // Nearest wind point
    let nearestPoint = wind.points[0]
    let minDist = Infinity
    for (const p of wind.points) {
      const dist = Math.hypot(p.lat - dominant.lat, p.lon - dominant.lon)
      if (dist < minDist) {
        minDist = dist
        nearestPoint = p
      }
    }

    if (!nearestPoint || !nearestPoint.hours || nearestPoint.hours.length === 0) return null

    // Select hour closest to wind generation timestamp or first available
    const genTime = wind.generated_at ? new Date(wind.generated_at).getTime() : Date.now()
    let bestHour = nearestPoint.hours[0]
    let minTimeDiff = Infinity
    for (const h of nearestPoint.hours) {
      const diff = Math.abs(new Date(h.t).getTime() - genTime)
      if (diff < minTimeDiff) {
        minTimeDiff = diff
        bestHour = h
      }
    }

    const compass = degToCompass(bestHour.dir_from_deg)
    return {
      speedMs: bestHour.speed_ms.toFixed(1),
      dirDeg: Math.round(bestHour.dir_from_deg),
      compass,
      blhM: Math.round(bestHour.pblh_m),
      district: dominant.district || dominant.location_name?.split('(')[0]?.trim() || 'Dominant Source',
    }
  }, [sources, wind])

  // Check staleness
  const { isStale, staleLabel } = useMemo(() => {
    if (!rankedSites?.generated_at) return { isStale: false, staleLabel: '' }
    const genTime = new Date(rankedSites.generated_at).getTime()
    const diffHours = (Date.now() - genTime) / (1000 * 60 * 60)
    return {
      isStale: diffHours > 24,
      staleLabel: `${Math.round(diffHours)}h old`,
    }
  }, [rankedSites])

  const infoTooltip = `Data Contracts:
• ranked_sites.json (generated ${rankedSites?.generated_at ? new Date(rankedSites.generated_at).toUTCString() : '—'})
• actions.json (generated ${actions?.generated_at ? new Date(actions.generated_at).toUTCString() : '—'})
• wind.json (Open-Meteo GFS, generated ${wind?.generated_at ? new Date(wind.generated_at).toUTCString() : '—'})`

  // Strip segment handler: sets horizon and highlights top site in that band
  const handleBandClick = (bandHorizon: TimeHorizon) => {
    setTimeHorizon(bandHorizon)
    if (!rankedSites) return

    let matchedSite = null
    if (bandHorizon === 2) {
      matchedSite = rankedSites.sites.find(s => s.eta_hours <= 2)
    } else if (bandHorizon === 4) {
      matchedSite = rankedSites.sites.find(s => s.eta_hours > 2 && s.eta_hours <= 4)
    } else if (bandHorizon === 8) {
      matchedSite = rankedSites.sites.find(s => s.eta_hours > 4 && s.eta_hours <= 8)
    } else if (bandHorizon === 24) {
      matchedSite = rankedSites.sites.find(s => s.eta_hours > 8)
    }

    if (matchedSite) {
      setSelectedSiteId(matchedSite.site_id)
    }
  }

  // Arrival strip segments
  const segments: { label: string; range: string; count: number; horizon: TimeHorizon; color: string }[] = [
    { label: '0–2h', range: '0 to 2 hours', count: bandCounts.b0_2, horizon: 2, color: '#DC2626' },
    { label: '2–4h', range: '2 to 4 hours', count: bandCounts.b2_4, horizon: 4, color: '#EA580C' },
    { label: '4–8h', range: '4 to 8 hours', count: bandCounts.b4_8, horizon: 8, color: '#D97706' },
    { label: '8–24h', range: '8 to 24 hours', count: bandCounts.b8_24, horizon: 24, color: '#059669' },
  ]

  return (
    <div className="metric-card decision-card card" title="Time to Impact: Atmospheric transport countdown to critical receptors">
      {/* Header */}
      <div className="decision-card-head">
        <div className="decision-card-title-row">
          <span className="decision-card-q">WHEN DOES IT HIT?</span>
          <div className="decision-head-badges">
            {isStale && (
              <span className="kpi-amber-tag" title="Snapshot older than freshness threshold">
                ⚠ {staleLabel}
              </span>
            )}
            <button
              type="button"
              className="kpi-info-btn"
              title={infoTooltip}
              aria-label="Data source contracts information for Time to Impact"
            >
              ⓘ
            </button>
          </div>
        </div>
        <span className="metric-label">Time to Impact</span>
      </div>

      {/* Primary Metric */}
      <div className="decision-primary-block">
        {earliestEta === null ? (
          <span className="metric-value">—</span>
        ) : earliestEta <= 0 ? (
          <div className="impact-urgent-banner">
            <span className="urgent-pulse-dot" />
            <span className="urgent-text">
              Plume over <strong>{countOverNow}</strong> receptors now
            </span>
          </div>
        ) : (
          <div className="metric-value-row">
            <span className="metric-value">{earliestEta.toFixed(1)}h</span>
            <span className="delta delta-down" style={{ background: '#FFF4EC', color: '#D4620A' }}>
              ETA to first receptor
            </span>
          </div>
        )}
      </div>

      {/* Secondary: Next deadline */}
      <div className="decision-secondary-row">
        {nextDeadline ? (
          <span className="secondary-detail" title={`Immediate protective action required: ${nextDeadline.siteName}`}>
            <span className="sec-tag">Next deadline:</span>
            <strong className="sec-hl"> {nextDeadline.hours}h</strong>
            <span className="sec-site"> · {nextDeadline.siteName}</span>
          </span>
        ) : (
          <span className="secondary-detail text-tertiary">No pending directives</span>
        )}
      </div>

      {/* Mini-visual: 4-segment arrival strip */}
      <div className="arrival-strip-container" role="region" aria-label="Receptor arrival distribution across corridor bands">
        <div className="arrival-strip-label-row">
          <span className="strip-caption">Corridor Arrival Bands (Receptors)</span>
          <span className="strip-active-caption">Window: {timeHorizon}h</span>
        </div>
        <div className="arrival-strip-bar">
          {segments.map(seg => {
            const isSelected = timeHorizon === seg.horizon
            return (
              <button
                key={seg.label}
                type="button"
                className={`arrival-strip-segment ${isSelected ? 'active' : ''}`}
                style={{
                  borderLeftColor: seg.color,
                }}
                onClick={() => handleBandClick(seg.horizon)}
                title={`Corridor band ${seg.range}: ${seg.count} receptors. Click to focus ${seg.horizon}h window on map.`}
                aria-label={`${seg.label} window: ${seg.count} receptors`}
              >
                <span className="seg-band-name">{seg.label}</span>
                <span className="seg-count-badge" style={{ color: seg.count > 0 ? seg.color : 'var(--text-tertiary)' }}>
                  {seg.count > 0 ? seg.count : '—'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer: Transport Context */}
      <div className="decision-footer">
        {transportContext ? (
          <span className="footer-transport-text" title={`Open-Meteo GFS wind forecast near ${transportContext.district}`}>
            <span className="footer-lbl">Transport:</span>{' '}
            <strong>{transportContext.speedMs} m/s</strong> {transportContext.compass} ({transportContext.dirDeg}°) · BLH <strong>{transportContext.blhM}m</strong>
          </span>
        ) : (
          <span className="footer-transport-text text-tertiary">Transport: Telemetry pending</span>
        )}
      </div>
    </div>
  )
}
