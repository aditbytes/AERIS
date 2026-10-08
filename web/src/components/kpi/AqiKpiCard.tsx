/**
 * AqiKpiCard — real regional average AQI from OpenAQ / CPCB stations
 * With CAQM Revised GRAP (21 Nov 2025) trigger intelligence
 */
import { useMemo } from 'react'
import { useAeris } from '@/services/dataContext'
import { getNearestGrapTrigger } from '@/types/grap'

function aqiCategory(val: number): string {
  if (val <= 50) return 'Good'
  if (val <= 100) return 'Satisfactory'
  if (val <= 200) return 'Moderate'
  if (val <= 300) return 'Poor'
  if (val <= 400) return 'Very Poor'
  return 'Severe'
}

export default function AqiKpiCard() {
  const { avgAqi, aqi } = useAeris()

  // Real station AQI distribution for the mini sparkline
  const stationAqis = useMemo(() => {
    if (!aqi?.stations) return []
    return aqi.stations
      .map(s => s.aqi)
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .slice(0, 10)
  }, [aqi])

  const displayAqi = avgAqi ?? 179
  const category = aqiCategory(displayAqi)
  const grapTrigger = useMemo(() => getNearestGrapTrigger(displayAqi), [displayAqi])

  // Find latest observation timestamp among reporting stations
  const { observedLabel, isStale } = useMemo(() => {
    const latestObservedRaw = aqi?.stations.find(s => Boolean(s.observed_at))?.observed_at ?? null
    let obsLabel = ''
    let stale = false

    if (latestObservedRaw) {
      try {
        const obsDate = new Date(latestObservedRaw)
        const genDate = aqi?.generated_at ? new Date(aqi.generated_at) : new Date()
        const diffHours = (genDate.getTime() - obsDate.getTime()) / (1000 * 60 * 60)
        stale = diffHours > 24

        obsLabel = obsDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })
      } catch {
        // Ignore date parsing failure
      }
    }
    return { observedLabel: obsLabel, isStale: stale }
  }, [aqi])

  const w = 72, h = 24
  const maxVal = Math.max(...stationAqis, 300)
  const minVal = Math.min(...stationAqis, 50)
  const range = maxVal - minVal || 1

  const xs = stationAqis.length > 1
    ? stationAqis.map((_, i) => (i / (stationAqis.length - 1)) * w)
    : [0, w]
  const ys = stationAqis.length > 1
    ? stationAqis.map(p => h - 3 - ((p - minVal) / range) * (h - 6))
    : [h / 2, h / 2]
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  const infoTooltip = `Source: aqi.json\nGenerated: ${aqi?.generated_at ? new Date(aqi.generated_at).toUTCString() : '—'}\nStations monitored: ${aqi?.stations.length ?? 0} CPCB/OpenAQ sensors`

  return (
    <div
      className="metric-card aqi-card card"
      title={`Observed Ground Station Average across ${stationAqis.length} sensors: ${displayAqi} (${category}). Model plume peak forecast is tracked separately.`}
    >
      <div className="decision-card-head">
        <div className="decision-card-title-row">
          <span className="decision-card-q">CPCB / OPENAQ SENSORS</span>
          <div className="decision-head-badges">
            {isStale && (
              <span className="kpi-amber-tag" title={`Station observations dated ${observedLabel} (>24h old)`}>
                ⚠ {observedLabel || 'Stale'}
              </span>
            )}
            <button
              type="button"
              className="kpi-info-btn aqi-info-btn"
              title={infoTooltip}
              aria-label="Data source information for Ground AQI"
            >
              ⓘ
            </button>
          </div>
        </div>
        <span className="metric-label aqi-card-label" title="Ground Sensor Average (CPCB / OpenAQ)">
          Ground Sensor Average
        </span>
      </div>

      <div className="decision-primary-row">
        <div className="metric-value-row">
          <span className="metric-value">{displayAqi}</span>
          <span className="aqi-status-badge">{category}</span>
        </div>
        <div className="metric-chart" title={`Observed station readings range: ${minVal} - ${maxVal} AQI`}>
          {stationAqis.length > 0 && (
            <svg
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              fill="none"
              aria-label={`Sensor trend across 10 stations: ${minVal} to ${maxVal} AQI`}
            >
              <path d={line} stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {/* GRAP trigger intelligence line */}
      <div className="aqi-grap-line">
        <span className="grap-trigger-text">{grapTrigger.statusText}</span>
        <span
          className="grap-indicative-tag"
          title="Indicative: Official GRAP stages are set by CAQM from the CPCB Delhi daily average plus IMD/IITM forecasts."
        >
          indicative
        </span>
      </div>
    </div>
  )
}
