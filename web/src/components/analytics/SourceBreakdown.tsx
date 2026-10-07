/** Source Breakdown — Donut chart (zero-dependency SVG) */
import { useAeris } from '@/services/dataContext'
import './SourceBreakdown.css'

const SEGMENTS = [
  { label: 'Crop Burning',       pct: 50, color: '#1A4433' },
  { label: 'Construction Dust',  pct: 20, color: '#F59F00' },
  { label: 'Traffic Emissions',  pct: 15, color: '#D4620A' },
  { label: 'Industrial',         pct: 10, color: '#4A5E56' },
  { label: 'Others',             pct:  5, color: '#B0BEB8' },
]

function DonutChart({ total }: { total: number }) {
  const cx = 60, cy = 60, r = 44, stroke = 22
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F4F0" strokeWidth={stroke} />

      {SEGMENTS.map((seg, i) => {
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
        Sources
      </text>
    </svg>
  )
}

export default function SourceBreakdown() {
  const { sources } = useAeris()
  const total = sources?.sources.length ?? 12

  return (
    <div className="source-breakdown card">
      <div className="section-header">
        <h3 className="section-title">Source Breakdown</h3>
      </div>
      <div className="breakdown-body">
        <DonutChart total={total} />
        <ul className="breakdown-legend">
          {SEGMENTS.map(seg => (
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
