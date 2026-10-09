import { useState } from 'react'
import { useAeris } from '@/services/dataContext'
import type { CorridorBandProperties } from '@/types/schemas'
import './AqiForecast12h.css'

const W = 320, H = 135, PADT = 10, PADB = 22, PADL = 30, PADR = 36
const AQI_MAX = 500, AQI_MIN = 100

function aqiY(v: number): number {
  const clamped = Math.max(AQI_MIN, Math.min(AQI_MAX, v))
  return PADT + (1 - (clamped - AQI_MIN) / (AQI_MAX - AQI_MIN)) * (H - PADB - PADT)
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

const CPCB_BANDS = [
  { min: 400, max: 500, label: 'Severe',    fill: 'rgba(153, 27, 27, 0.08)', textColor: '#991B1B' },
  { min: 300, max: 400, label: 'V. Poor',   fill: 'rgba(239, 68, 68, 0.06)', textColor: '#DC2626' },
  { min: 200, max: 300, label: 'Poor',      fill: 'rgba(249, 115, 22, 0.05)', textColor: '#EA580C' },
  { min: 100, max: 200, label: 'Moderate',  fill: 'rgba(234, 179, 8, 0.05)',  textColor: '#CA8A04' },
]

export default function AqiForecast12h() {
  const { corridor, avgAqi } = useAeris()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const baseline = avgAqi
  if (baseline == null) {
    return (
      <div className="aqi-forecast card">
        <div className="section-header">
          <h3 className="section-title">AQI Forecast (Next 12 Hours)</h3>
        </div>
        <p className="panel-sub">No ground-station AQI is reporting, so the modeled forecast cannot be computed.</p>
      </div>
    )
  }

  // Extract real bands from corridor.geojson
  const bands = (corridor?.features ?? [])
    .map(f => f.properties)
    .filter((p): p is CorridorBandProperties => p.kind === 'band')

  const timeSteps = [0, 2, 4, 6, 8, 10, 12]

  const points = timeSteps.map(h => {
    const matchingBands = bands.filter(b => b.hour_from <= h && b.hour_to >= h)
    const maxDelta = matchingBands.length > 0
      ? Math.max(...matchingBands.map(b => b.pm25_delta_ugm3))
      : 0

    const modeledAqi = Math.min(500, Math.round(baseline + maxDelta * 1.35))

    return {
      h,
      aqi: modeledAqi,
      delta: Math.round(maxDelta),
      label: h === 0 ? 'Now' : `${h}h`,
    }
  })

  // Find peak hour
  const peakVal = Math.max(...points.map(p => p.aqi))
  const pts = points.map((d, idx) => ({
    x: aqiX(d.h),
    y: aqiY(d.aqi),
    peak: d.aqi === peakVal,
    idx,
    ...d,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H - PADB} L${pts[0].x},${H - PADB} Z`

  const peak = pts.find(p => p.peak)
  const activePt = hoverIdx !== null ? pts[hoverIdx] : peak

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    let closestIdx = 0
    let minDiff = Infinity
    pts.forEach((p, i) => {
      const diff = Math.abs(p.x - relX)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    })
    setHoverIdx(closestIdx)
  }

  return (
    <div className="aqi-forecast card">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 className="section-title">AQI Forecast (Next 12 Hours)</h3>
          <span
            className="modeled-tag-badge"
            title="Modeled plume dispersion impact on baseline station AQI"
          >
            Modeled
          </span>
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{ cursor: 'crosshair', display: 'block' }}
        aria-label="12-hour AQI forecast chart modeled from plume corridor with CPCB bands and Y-axis scale"
      >
        <defs>
          <linearGradient id="aqiGrad" x1="0%" y1="0%" x2="0%" y2="1">
            <stop offset="0%"   stopColor="#C92A2A" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#C92A2A" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* CPCB Category Colored Background Bands */}
        {CPCB_BANDS.map(b => {
          const yTop = aqiY(b.max)
          const yBot = aqiY(b.min)
          const height = yBot - yTop
          return (
            <g key={b.label}>
              <rect
                x={PADL}
                y={yTop}
                width={W - PADL - PADR}
                height={height}
                fill={b.fill}
              />
              {/* Category label on the right margin */}
              <text
                x={W - PADR + 4}
                y={yTop + height / 2 + 3}
                fontSize="7"
                fontWeight="700"
                fill={b.textColor}
                opacity="0.85"
                fontFamily="Outfit, sans-serif"
              >
                {b.label}
              </text>
            </g>
          )
        })}

        {/* Y-Axis Ticks & Grid lines */}
        {[100, 200, 300, 400, 500].map(v => (
          <g key={v}>
            <line
              x1={PADL}
              y1={aqiY(v).toFixed(1)}
              x2={W - PADR}
              y2={aqiY(v).toFixed(1)}
              stroke="#E2E8F0"
              strokeWidth="0.8"
              strokeDasharray={v === 100 || v === 500 ? 'none' : '2 2'}
            />
            <text
              x={PADL - 4}
              y={aqiY(v) + 3}
              textAnchor="end"
              fontSize="7.5"
              fill="#64748B"
              fontWeight="600"
              fontFamily="Outfit, sans-serif"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#aqiGrad)" />

        {/* Forecast Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#DC2626"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover vertical crosshair */}
        {activePt && (
          <line
            x1={activePt.x}
            y1={PADT}
            x2={activePt.x}
            y2={H - PADB}
            stroke="#DC2626"
            strokeWidth="1.2"
            strokeDasharray="3 2"
            opacity="0.75"
          />
        )}

        {/* Active / Peak point marker */}
        {activePt && (
          <g>
            <circle cx={activePt.x} cy={activePt.y} r="4.5" fill="#DC2626" />
            <circle cx={activePt.x} cy={activePt.y} r="8.5" fill="none" stroke="#DC2626" strokeWidth="1.5" opacity="0.4" />
            {/* Tooltip box */}
            <rect
              x={Math.max(PADL, Math.min(W - PADR - 110, activePt.x - 55))}
              y={Math.max(PADT - 4, activePt.y - 28)}
              width="110"
              height="22"
              rx="4"
              fill="white"
              stroke="#CBD5E1"
              strokeWidth="1"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            />
            <text
              x={Math.max(PADL, Math.min(W - PADR - 110, activePt.x - 55)) + 55}
              y={Math.max(PADT - 4, activePt.y - 28) + 14}
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="700"
              fill="#DC2626"
              fontFamily="Outfit, sans-serif"
            >
              {`${activePt.label} • AQI ${activePt.aqi} (${aqiCategory(activePt.aqi)})`}
            </text>
          </g>
        )}

        {/* X-axis labels */}
        {pts.map(p => (
          <text
            key={p.h}
            x={p.x}
            y={H - 5}
            textAnchor="middle"
            fontSize="8.5"
            fill={activePt?.h === p.h ? '#0F172A' : '#64748B'}
            fontWeight={activePt?.h === p.h ? '700' : '500'}
            fontFamily="Outfit, sans-serif"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
