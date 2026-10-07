/** AQI Summary card — dark emerald green with wave sparkline */
export default function AqiKpiCard() {
  // Wave sparkline SVG — white on dark background
  const pts = [18, 14, 20, 12, 22, 16, 24, 18, 20, 15]
  const w = 80, h = 28
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
  const ys = pts.map(p => h - (p / 24) * h)
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')

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
          <span className="metric-value">287</span>
          <span className="aqi-status-badge">Poor</span>
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
