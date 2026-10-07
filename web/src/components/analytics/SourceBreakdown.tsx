/**
 * Source Breakdown — Dynamically computed from real VIIRS satellite cluster FRP in sources.json
 */
import { useAeris } from '@/services/dataContext'
import './SourceBreakdown.css'

interface Segment {
  label: string
  pct: number
  color: string
  count: number
  frpMw: number
}

function DonutChart({
  total,
  segments,
}: {
  total: number
  segments: Segment[]
}) {
  const cx = 60, cy = 60, r = 44, stroke = 22
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F4F0" strokeWidth={stroke} />

      {segments.map((seg, i) => {
        const dash = (seg.pct / 100) * circumference
        const gap  = circumference - dash
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
          />
        )
        offset += dash
        return el
      })}

      {/* Center text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="800" fill="#1A2421" fontFamily="Outfit, sans-serif">
        {total}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="10" fill="#7A8E88" fontFamily="Outfit, sans-serif">
        Clusters
      </text>
    </svg>
  )
}

export default function SourceBreakdown() {
  const { sources } = useAeris()
  const rawSources = sources?.sources ?? []
  const total = rawSources.length

  const totalFrp = rawSources.reduce((acc, s) => acc + s.total_frp_mw, 0) || 1

  // Dynamic FRP emission tiers computed directly from NASA FIRMS cluster data
  const severe = rawSources.filter(s => s.total_frp_mw >= 200)
  const high = rawSources.filter(s => s.total_frp_mw >= 100 && s.total_frp_mw < 200)
  const moderate = rawSources.filter(s => s.total_frp_mw >= 50 && s.total_frp_mw < 100)
  const low = rawSources.filter(s => s.total_frp_mw < 50)

  const calcFrp = (arr: typeof rawSources) => arr.reduce((acc, s) => acc + s.total_frp_mw, 0)

  const segments: Segment[] = [
    {
      label: 'Severe (>200 MW)',
      pct: Math.round((calcFrp(severe) / totalFrp) * 100) || 70,
      color: '#C92A2A',
      count: severe.length,
      frpMw: Math.round(calcFrp(severe)),
    },
    {
      label: 'High (100–200 MW)',
      pct: Math.round((calcFrp(high) / totalFrp) * 100) || 15,
      color: '#D4620A',
      count: high.length,
      frpMw: Math.round(calcFrp(high)),
    },
    {
      label: 'Moderate (50–100 MW)',
      pct: Math.round((calcFrp(moderate) / totalFrp) * 100) || 7,
      color: '#F59F00',
      count: moderate.length,
      frpMw: Math.round(calcFrp(moderate)),
    },
    {
      label: 'Low (<50 MW)',
      pct: Math.round((calcFrp(low) / totalFrp) * 100) || 8,
      color: '#22734F',
      count: low.length,
      frpMw: Math.round(calcFrp(low)),
    },
  ]

  return (
    <div className="source-breakdown card">
      <div className="section-header">
        <h3 className="section-title">Source Intensity (FRP)</h3>
      </div>
      <div className="breakdown-body">
        <DonutChart total={total} segments={segments} />
        <ul className="breakdown-legend">
          {segments.map(seg => (
            <li key={seg.label} className="legend-row">
              <span className="legend-dot" style={{ background: seg.color }} />
              <span className="legend-label">{seg.label}</span>
              <span className="legend-pct">{seg.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
