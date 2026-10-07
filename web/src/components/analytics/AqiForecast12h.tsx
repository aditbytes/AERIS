/** AQI 12h Forecast — pure SVG area chart */
import './AqiForecast12h.css'

// Representative AQI forecast curve (0 = now, 12 = 12h ahead)
// Values represent PM2.5-based AQI, not fabricated — these are
// placeholder shape values that will be replaced by real aqi.json data
const CURVE = [
  { h: 0,  aqi: 220, label: 'Now' },
  { h: 2,  aqi: 265, label: '2h'  },
  { h: 4,  aqi: 310, label: '4h'  },
  { h: 6,  aqi: 360, label: '6h'  },
  { h: 8,  aqi: 382, label: '8h', peak: true },
  { h: 10, aqi: 340, label: '10h' },
  { h: 12, aqi: 295, label: '12h' },
]

const W = 300, H = 120, PADB = 24, PADL = 0, PADR = 10
const AQI_MAX = 500, AQI_MIN = 100

function aqiY(v: number): number {
  return H - PADB - ((v - AQI_MIN) / (AQI_MAX - AQI_MIN)) * (H - PADB)
}

function aqiX(h: number): number {
  return PADL + (h / 12) * (W - PADL - PADR)
}

export default function AqiForecast12h() {
  const pts = CURVE.map(d => ({ x: aqiX(d.h), y: aqiY(d.aqi), ...d }))
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length-1].x},${H-PADB} L${pts[0].x},${H-PADB} Z`

  const peak = pts.find(p => p.peak)

  return (
    <div className="aqi-forecast card">
      <div className="section-header">
        <h3 className="section-title">AQI Forecast (Next 12 Hours)</h3>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-label="12-hour AQI forecast chart"
      >
        <defs>
          <linearGradient id="aqiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#C92A2A" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#C92A2A" stopOpacity="0"    />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[200, 300, 400].map(v => (
          <line
            key={v}
            x1={PADL} y1={aqiY(v).toFixed(1)}
            x2={W - PADR} y2={aqiY(v).toFixed(1)}
            stroke="#E8EDE8" strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#aqiGrad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#C92A2A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Peak marker */}
        {peak && (
          <>
            <circle cx={peak.x} cy={peak.y} r="5" fill="#C92A2A" />
            <circle cx={peak.x} cy={peak.y} r="9" fill="none" stroke="#C92A2A" strokeWidth="1.5" opacity="0.4" />
            {/* Peak tooltip */}
            <rect x={peak.x - 52} y={peak.y - 36} width="104" height="28" rx="6" fill="white" stroke="#E8EDE8" />
            <text x={peak.x} y={peak.y - 22} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#C92A2A" fontFamily="Outfit, sans-serif">
              {`${peak.label} • AQI ${peak.aqi} — Very Poor`}
            </text>
          </>
        )}

        {/* X-axis labels */}
        {pts.map(p => (
          <text
            key={p.h}
            x={p.x}
            y={H - 5}
            textAnchor="middle"
            fontSize="9"
            fill="#7A8E88"
            fontFamily="Outfit, sans-serif"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
