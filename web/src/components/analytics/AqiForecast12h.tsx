/**
 * AQI 12h Forecast — dynamically computed from Lagrangian corridor advection & live AQI
 */
import { useAeris } from '@/services/dataContext'
import type { CorridorBandProperties } from '@/types/schemas'
import './AqiForecast12h.css'

const W = 300, H = 120, PADB = 24, PADL = 0, PADR = 10
const AQI_MAX = 500, AQI_MIN = 100

function aqiY(v: number): number {
  return H - PADB - ((v - AQI_MIN) / (AQI_MAX - AQI_MIN)) * (H - PADB)
}

function aqiX(h: number): number {
  return PADL + (h / 12) * (W - PADL - PADR)
}

function aqiCategory(val: number): string {
  if (val <= 50) return 'Good'
  if (val <= 100) return 'Satisfactory'
  if (val <= 200) return 'Moderate'
  if (val <= 300) return 'Poor'
  if (val <= 400) return 'Very Poor'
  return 'Severe'
}

export default function AqiForecast12h() {
  const { corridor, avgAqi } = useAeris()

  const baseline = avgAqi ?? 180

  // Extract real bands from corridor.geojson
  const bands = (corridor?.features ?? [])
    .map(f => f.properties)
    .filter((p): p is CorridorBandProperties => p.kind === 'band')

  const timeSteps = [0, 2, 4, 6, 8, 10, 12]

  const points = timeSteps.map(h => {
    // Find highest plume contribution active at hour h
    const matchingBands = bands.filter(b => b.hour_from <= h && b.hour_to >= h)
    const maxDelta = matchingBands.length > 0
      ? Math.max(...matchingBands.map(b => b.pm25_delta_ugm3))
      : 0

    // Indian AQI conversion approx for PM2.5 delta
    const modeledAqi = Math.min(500, Math.round(baseline + maxDelta * 1.35))

    return {
      h,
      aqi: modeledAqi,
      label: h === 0 ? 'Now' : `${h}h`,
    }
  })

  // Find peak hour
  const peakVal = Math.max(...points.map(p => p.aqi))
  const pts = points.map(d => ({
    x: aqiX(d.h),
    y: aqiY(d.aqi),
    peak: d.aqi === peakVal,
    ...d,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H - PADB} L${pts[0].x},${H - PADB} Z`

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
        aria-label="12-hour AQI forecast chart modeled from plume corridor"
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
              {`${peak.label} • AQI ${peak.aqi} — ${aqiCategory(peak.aqi)}`}
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
