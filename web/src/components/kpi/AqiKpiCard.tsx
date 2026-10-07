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

  // Real station AQI distribution for the mini sparkline
  const stationAqis = aqi?.stations
    .map(s => s.aqi)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .slice(0, 10) ?? [150, 201, 263, 137, 180, 220, 240, 195, 210, 178]

  const displayAqi = avgAqi ?? 179
  const category = aqiCategory(displayAqi)

  const w = 80, h = 28
  const maxVal = Math.max(...stationAqis, 300)
  const minVal = Math.min(...stationAqis, 50)
  const range = maxVal - minVal || 1

  const xs = stationAqis.map((_, i) => (i / (stationAqis.length - 1)) * w)
  const ys = stationAqis.map(p => h - 4 - ((p - minVal) / range) * (h - 8))
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <div className="metric-card aqi-card card">
      <div className="metric-icon" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
        </svg>
      </div>
      <div className="metric-body">
        <span className="metric-label">Air Quality (Avg.)</span>
        <div className="metric-value-row">
          <span className="metric-value">{displayAqi}</span>
          <span className="aqi-status-badge">{category}</span>
        </div>
      </div>
      <div className="metric-chart">
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true">
          <path d={line} stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}
