/**
 * AqiKpiCard — real regional average AQI from OpenAQ / CPCB stations
 */
import { useAeris } from '@/services/dataContext'
import { getFeedFreshness } from '@/services/api'
import { useClock } from '@/components/status/useClock'

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
  const now = useClock()

  // Real station AQI distribution for the mini sparkline (zero fabricated fallback)
  const reporting = aqi?.stations.filter(station => station.aqi != null && Number.isFinite(station.aqi) && station.aqi >= 0) ?? []
  const stationAqis = reporting.map(station => station.aqi!).slice(0, 10)

  const displayAqi = avgAqi ?? '—'
  const category = avgAqi != null ? aqiCategory(avgAqi) : 'No data'

  const observationStates = reporting.map(station => getFeedFreshness('aqi', station.observed_at, now))
  const isStale = observationStates.some(state => state.status === 'stale')
  const unknownAge = reporting.length === 0 || observationStates.some(state => state.status === 'unknown')
  const ageLabel = isStale ? 'Archived observations' : unknownAge ? 'Observation age unknown' : 'Recent observations'

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
      title={`Observed station average across ${reporting.length} reporting stations: ${displayAqi} (${category}). ${ageLabel}. This is not an exposure estimate or plume attribution.`}
    >
      <div className="metric-icon" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
        </svg>
      </div>
      <div className="metric-body">
        <div className="aqi-label-row">
          <span className="metric-label" style={{ marginBottom: 0 }}>Observed AQI average</span>
          {(isStale || unknownAge) && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#FEF08A',
                background: 'rgba(234, 179, 8, 0.3)',
                padding: '1px 5px',
                borderRadius: '4px',
                whiteSpace: 'normal',
              }}
              title="Age is measured from station observations against the current clock, independently of file generation."
            >
              {ageLabel}
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
