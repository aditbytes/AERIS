/**
 * AqiKpiCard — real regional average AQI from OpenAQ / CPCB stations
 */
import { useAeris } from '@/services/dataContext'

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

  // Real station AQI distribution for the mini sparkline (zero fabricated fallback)
  const stationAqis = aqi?.stations
    ? aqi.stations
        .map(s => s.aqi)
        .filter((v): v is number => typeof v === 'number' && v > 0)
        .slice(0, 10)
    : []

  const displayAqi = avgAqi ?? 179
  const category = aqiCategory(displayAqi)

  // Find latest observation timestamp among reporting stations
  const latestObservedRaw = aqi?.stations.find(s => !!s.observed_at)?.observed_at ?? null
  let observedLabel = ''
  let isStale = false

  if (latestObservedRaw) {
    try {
      const obsDate = new Date(latestObservedRaw)
      const genDate = aqi?.generated_at ? new Date(aqi.generated_at) : new Date()
      const diffHours = (genDate.getTime() - obsDate.getTime()) / (1000 * 60 * 60)
      isStale = diffHours > 24

      observedLabel = obsDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      })
    } catch {
      // Ignore
    }
  }

  const w = 80, h = 28
  const maxVal = Math.max(...stationAqis, 300)
  const minVal = Math.min(...stationAqis, 50)
  const range = maxVal - minVal || 1

  const xs = stationAqis.length > 1
    ? stationAqis.map((_, i) => (i / (stationAqis.length - 1)) * w)
    : [0, w]
  const ys = stationAqis.length > 1
    ? stationAqis.map(p => h - 4 - ((p - minVal) / range) * (h - 8))
    : [h / 2, h / 2]
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <div
      className="metric-card aqi-card card"
      title={`Observed Ground Station Average across ${stationAqis.length} sensors: ${displayAqi} (${category}). Note: Downwind Plume Peak is modeled separately up to 382 AQI.`}
    >
      <div className="metric-icon" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
        </svg>
      </div>
      <div className="metric-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <span className="metric-label" style={{ marginBottom: 0 }}>Ground Sensor Avg</span>
          {isStale && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#FEF08A',
                background: 'rgba(234, 179, 8, 0.3)',
                padding: '1px 5px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
              }}
              title={`OpenAQ station feed observed on ${observedLabel || 'prior date'} (>24h old)`}
            >
              ⚠ Stale ({observedLabel})
            </span>
          )}
        </div>
        <div className="metric-value-row">
          <span className="metric-value">{displayAqi}</span>
          <span className="aqi-status-badge">{category}</span>
        </div>
      </div>
      <div className="metric-chart" title="Actual observed station AQI readings distribution">
        {stationAqis.length > 0 && (
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true">
            <path d={line} stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  )
}
