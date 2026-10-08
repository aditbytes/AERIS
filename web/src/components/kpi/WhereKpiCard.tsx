/**
 * WhereKpiCard — Decision Card 3: Dominant Source (WHERE/WHY)
 * Answers: "WHERE/WHY is it coming from?"
 *
 * Primary: Top cluster by total_frp_mw (location/district, MW, and share of total FRP)
 * Secondary: Fire count, confidence %, and last detection time (amber tag after 6h)
 * Mini-visual: Stacked bar of top 3 clusters' FRP share + others (labelled by district),
 *              plus neutral territory split (India vs Transboundary).
 * Action: Clicking flies to dominant source, selects it, and links to Fire Sources view.
 * Zero fabricated data: Strictly no estimation of "% contribution to Delhi PM2.5".
 */
import { useMemo } from 'react'
import { useAeris } from '@/services/dataContext'

export default function WhereKpiCard() {
  const { sources, setFlyToLocation, setActiveTab } = useAeris()

  const rawSources = sources?.sources ?? []
  const totalClusters = rawSources.length

  const {
    topCluster,
    totalFrp,
    topFrpShare,
    topLastSeenHoursAgo,
    topIsLastSeenAmber,
    stackedSegments,
    territorySplit,
  } = useMemo(() => {
    if (rawSources.length === 0) {
      return {
        topCluster: null,
        totalFrp: 0,
        topFrpShare: 0,
        topLastSeenHoursAgo: null,
        topIsLastSeenAmber: false,
        stackedSegments: [],
        territorySplit: { indiaFrp: 0, indiaPct: 0, transFrp: 0, transPct: 0 },
      }
    }

    const sorted = [...rawSources].sort((a, b) => b.total_frp_mw - a.total_frp_mw)
    const top = sorted[0]
    const sumFrp = sorted.reduce((acc, s) => acc + s.total_frp_mw, 0)
    const share = sumFrp > 0 ? Math.round((top.total_frp_mw / sumFrp) * 100) : 0

    // Last detection age calculation from last_seen
    let hoursAgo: number | null = null
    let isAmber = false
    if (top?.last_seen) {
      try {
        const lastSeenDate = new Date(top.last_seen).getTime()
        const genTime = sources?.generated_at ? new Date(sources.generated_at).getTime() : Date.now()
        const diffH = Math.max(0, (genTime - lastSeenDate) / (1000 * 60 * 60))
        hoursAgo = Math.round(diffH)
        // Amber after 6h per project note on cached thermal satellite data validity
        isAmber = diffH > 6
      } catch {
        // Ignore date parsing failure
      }
    }

    // Top 3 clusters + others stacked segments
    const top3 = sorted.slice(0, 3)
    const others = sorted.slice(3)
    const othersFrp = others.reduce((acc, s) => acc + s.total_frp_mw, 0)

    const colors = ['#C92A2A', '#EA580C', '#D97706', '#64748B']
    const segments = top3.map((s, idx) => ({
      id: s.id,
      name: s.district || s.location_name?.split('(')[0]?.trim() || s.id,
      mw: Math.round(s.total_frp_mw),
      pct: sumFrp > 0 ? Math.round((s.total_frp_mw / sumFrp) * 100) : 0,
      color: colors[idx],
    }))

    if (others.length > 0) {
      segments.push({
        id: 'others',
        name: `Others (${others.length})`,
        mw: Math.round(othersFrp),
        pct: sumFrp > 0 ? Math.max(1, 100 - segments.reduce((sum, seg) => sum + seg.pct, 0)) : 0,
        color: colors[3],
      })
    }

    // Territory split (India vs Transboundary)
    const indiaFrp = sorted.filter(s => s.territory === 'india').reduce((sum, s) => sum + s.total_frp_mw, 0)
    const transFrp = sorted.filter(s => s.territory === 'transboundary').reduce((sum, s) => sum + s.total_frp_mw, 0)
    const indiaPct = sumFrp > 0 ? Math.round((indiaFrp / sumFrp) * 100) : 0
    const transPct = sumFrp > 0 ? 100 - indiaPct : 0

    return {
      topCluster: top,
      totalFrp: sumFrp,
      topFrpShare: share,
      topLastSeenHoursAgo: hoursAgo,
      topIsLastSeenAmber: isAmber,
      stackedSegments: segments,
      territorySplit: {
        indiaFrp: Math.round(indiaFrp),
        indiaPct,
        transFrp: Math.round(transFrp),
        transPct,
      },
    }
  }, [rawSources, sources?.generated_at])

  // Click handler: fly to top source and switch to Fire Sources view
  const handleCardClick = () => {
    if (!topCluster) return
    setFlyToLocation({
      lon: topCluster.lon,
      lat: topCluster.lat,
      zoom: 10,
      name: topCluster.location_name || topCluster.district || 'Dominant Source Cluster',
    })
    setActiveTab('sources')
  }

  // Staleness of the file
  const { isStale, staleLabel } = useMemo(() => {
    if (!sources?.generated_at) return { isStale: false, staleLabel: '' }
    const genTime = new Date(sources.generated_at).getTime()
    const diffHours = (Date.now() - genTime) / (1000 * 60 * 60)
    return {
      isStale: diffHours > 6, // 6h threshold for satellite thermal data
      staleLabel: `${Math.round(diffHours)}h old`,
    }
  }, [sources])

  const infoTooltip = `Data Contract: sources.json (VIIRS / MODIS thermal clusters)
Generated: ${sources?.generated_at ? new Date(sources.generated_at).toUTCString() : '—'}
Total Clusters: ${totalClusters} active hotspots
Airshed Total FRP: ${Math.round(totalFrp)} MW
Note: Does not estimate % PM2.5 contribution to Delhi (unsupported by raw sensors)`

  const topDistrictName = topCluster?.district || topCluster?.location_name?.split('(')[0]?.trim() || 'Dominant Hotspot'

  return (
    <div
      className="metric-card decision-card card clickable-kpi-card"
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
      role="button"
      tabIndex={0}
      title="Dominant Source: Click to fly to cluster and open Fire Sources view"
      aria-label={`Dominant Source: ${topDistrictName}, ${topCluster ? Math.round(topCluster.total_frp_mw) : 0} MW (${topFrpShare}% FRP). Click to view in Fire Sources tab.`}
    >
      {/* Header */}
      <div className="decision-card-head">
        <div className="decision-card-title-row">
          <span className="decision-card-q">WHERE IS IT FROM?</span>
          <div className="decision-head-badges">
            {isStale && (
              <span className="kpi-amber-tag" title="Thermal detections older than 6h cache window">
                ⚠ {staleLabel}
              </span>
            )}
            <button
              type="button"
              className="kpi-info-btn"
              onClick={(e) => {
                e.stopPropagation()
              }}
              title={infoTooltip}
              aria-label="Data source contract information for Dominant Source"
            >
              ⓘ
            </button>
          </div>
        </div>
        <div className="card-sub-head-row">
          <span className="metric-label" title={topCluster?.location_name || topDistrictName}>
            Dominant Source · {topDistrictName}
          </span>
          <span className="jump-hint">View sources ↗</span>
        </div>
      </div>

      {/* Primary: Top Cluster FRP and Share of Total */}
      <div className="decision-primary-block">
        {topCluster ? (
          <div className="metric-value-row">
            <span className="metric-value">{Math.round(topCluster.total_frp_mw)} MW</span>
            <span className="delta delta-up" title={`Contributes ${topFrpShare}% of total ${Math.round(totalFrp)} MW regional fire radiative power`}>
              {topFrpShare}% of total FRP
            </span>
          </div>
        ) : (
          <span className="metric-value">—</span>
        )}
      </div>

      {/* Secondary: Fire count, confidence, and last detection age */}
      <div className="decision-secondary-row">
        {topCluster ? (
          <div className="source-meta-chips">
            <span className="sec-tag">{topCluster.fire_count} fires</span>
            <span className="sec-divider">·</span>
            <span className="sec-tag">{Math.round(topCluster.confidence * 100)}% conf.</span>
            <span className="sec-divider">·</span>
            {topLastSeenHoursAgo !== null && (
              <span
                className={`last-seen-tag ${topIsLastSeenAmber ? 'amber' : ''}`}
                title={topIsLastSeenAmber ? 'Cached thermal data older than 6h validity threshold' : 'Recent satellite overpass'}
              >
                {topIsLastSeenAmber ? '⚠ ' : ''}{topLastSeenHoursAgo}h ago
              </span>
            )}
          </div>
        ) : (
          <span className="secondary-detail text-tertiary">No active clusters</span>
        )}
      </div>

      {/* Mini-visual: Stacked Bar (Top 3 clusters + others) */}
      <div className="source-stacked-container" aria-label="Share of fire radiative power across top clusters">
        <div className="stacked-bar-track">
          {stackedSegments.map(seg => (
            <div
              key={seg.id}
              className="stacked-bar-segment"
              style={{ width: `${seg.pct}%`, background: seg.color }}
              title={`${seg.name}: ${seg.mw} MW (${seg.pct}% FRP)`}
            />
          ))}
        </div>
        <div className="stacked-labels-row">
          {stackedSegments.map(seg => (
            <span key={seg.id} className="stacked-legend-item" title={`${seg.name}: ${seg.mw} MW`}>
              <span className="legend-swatch" style={{ background: seg.color }} />
              <span className="legend-name">{seg.name.split('/')[0].split(' ')[0]}</span>
              <strong className="legend-pct">{seg.pct}%</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Footer: Territory FRP Split (India vs Transboundary, neutral wording) */}
      <div className="decision-footer territory-footer">
        <span
          className="territory-split-text"
          title={`India: ${territorySplit.indiaFrp} MW (${territorySplit.indiaPct}%) | Transboundary: ${territorySplit.transFrp} MW (${territorySplit.transPct}%)`}
        >
          <span className="footer-lbl">Airshed split:</span>{' '}
          <strong>Domestic (India) {territorySplit.indiaPct}%</strong> · Transboundary <strong>{territorySplit.transPct}%</strong>
        </span>
      </div>
    </div>
  )
}
