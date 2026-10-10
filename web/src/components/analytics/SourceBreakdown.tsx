/**
 * Source Breakdown — Dynamically computed from real VIIRS satellite cluster FRP in sources.json
 */
import { useAeris } from '@/services/dataContext'
import './SourceBreakdown.css'

import { useState } from 'react'

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
  activeSegment,
  setActiveSegment,
}: {
  total: number
  segments: Segment[]
  activeSegment: Segment | null
  setActiveSegment: (s: Segment | null) => void
}) {
  const cx = 60, cy = 60, r = 44, stroke = 22
  const circumference = 2 * Math.PI * r

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-label="Source Intensity Donut Chart">
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F4F0" strokeWidth={stroke} />

      {segments.map((seg, i) => {
        const dash = (seg.pct / 100) * circumference
        const offset = segments.slice(0, i).reduce((sum, previous) => sum + previous.pct / 100 * circumference, 0)
        const gap  = circumference - dash
        const isHovered = activeSegment?.label === seg.label
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={isHovered ? stroke + 4 : stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            onMouseEnter={() => setActiveSegment(seg)}
            onMouseLeave={() => setActiveSegment(null)}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '60px 60px',
              cursor: 'pointer',
              transition: 'stroke-width 0.15s ease, opacity 0.15s ease',
              opacity: activeSegment && !isHovered ? 0.45 : 1,
            }}
          />
        )
        return el
      })}

      {/* Dynamic Center text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={activeSegment ? "15" : "18"} fontWeight="800" fill="#1A2421" fontFamily="Outfit, sans-serif">
        {activeSegment ? `${activeSegment.frpMw} MW` : total}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="10" fill="#475569" fontFamily="Outfit, sans-serif">
        {activeSegment ? `${activeSegment.count} Clusters` : 'Clusters'}
      </text>
    </svg>
  )
}

export default function SourceBreakdown() {
  const { sources } = useAeris()
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null)
  const [viewMode, setViewMode] = useState<'frp' | 'scope'>('frp')

  const rawSources = sources?.sources ?? []
  const total = rawSources.length

  const totalFrp = rawSources.reduce((acc, s) => acc + s.total_frp_mw, 0)

  // Dynamic FRP emission tiers computed directly from NASA FIRMS cluster data
  const severe = rawSources.filter(s => s.total_frp_mw >= 200)
  const high = rawSources.filter(s => s.total_frp_mw >= 100 && s.total_frp_mw < 200)
  const moderate = rawSources.filter(s => s.total_frp_mw >= 50 && s.total_frp_mw < 100)
  const low = rawSources.filter(s => s.total_frp_mw < 50)

  // Territory grouping
  const indiaSources = rawSources.filter(s => s.territory === 'india')
  const transSources = rawSources.filter(s => s.territory === 'transboundary')
  const unknownSources = rawSources.filter(s => s.territory == null)

  const calcFrp = (arr: typeof rawSources) => arr.reduce((acc, s) => acc + s.total_frp_mw, 0)
  const share = (arr: typeof rawSources) => totalFrp > 0 ? (calcFrp(arr) / totalFrp) * 100 : 0

  const frpSegments: Segment[] = [
    {
      label: 'FRP ≥200 MW',
      pct: share(severe),
      color: '#C92A2A',
      count: severe.length,
      frpMw: Math.round(calcFrp(severe)),
    },
    {
      label: 'FRP 100–<200 MW',
      pct: share(high),
      color: '#D4620A',
      count: high.length,
      frpMw: Math.round(calcFrp(high)),
    },
    {
      label: 'FRP 50–<100 MW',
      pct: share(moderate),
      color: '#F59F00',
      count: moderate.length,
      frpMw: Math.round(calcFrp(moderate)),
    },
    {
      label: 'FRP <50 MW',
      pct: share(low),
      color: '#22734F',
      count: low.length,
      frpMw: Math.round(calcFrp(low)),
    },
  ]

  const scopeSegments: Segment[] = [
    {
      label: '🇮🇳 Domestic (India)',
      pct: share(indiaSources),
      color: '#DC2626',
      count: indiaSources.length,
      frpMw: Math.round(calcFrp(indiaSources)),
    },
    {
      label: '🌐 Transboundary candidates',
      pct: share(transSources),
      color: '#D97706',
      count: transSources.length,
      frpMw: Math.round(calcFrp(transSources)),
    },
    {
      label: 'Territory unavailable',
      pct: share(unknownSources),
      color: '#64748B',
      count: unknownSources.length,
      frpMw: Math.round(calcFrp(unknownSources)),
    },
  ]

  const segments = viewMode === 'frp' ? frpSegments : scopeSegments

  return (
    <div className="source-breakdown card">
      <div className="section-header source-breakdown-head">
        <div>
          <h3 className="section-title">Source Intensity (% of Total FRP)</h3>
          <span className="text-xs text-tertiary" style={{ fontSize: '10px' }}>
            Measures share of {Math.round(totalFrp)} MW Fire Radiative Power
          </span>
        </div>
        <div className="breakdown-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${viewMode === 'frp' ? 'active' : ''}`}
            aria-pressed={viewMode === 'frp'}
            onClick={() => {
              setViewMode('frp')
              setActiveSegment(null)
            }}
            title="Group by Fire Radiative Power tiers"
          >
            FRP Tiers
          </button>
          <button
            type="button"
            className={`mode-btn ${viewMode === 'scope' ? 'active' : ''}`}
            aria-pressed={viewMode === 'scope'}
            onClick={() => {
              setViewMode('scope')
              setActiveSegment(null)
            }}
            title="Group by Domestic vs Transboundary Influx"
          >
            Airshed Scope
          </button>
        </div>
      </div>
      {totalFrp === 0 && <p className="panel-sub">{total === 0 ? 'No source candidates available.' : 'Total FRP is zero; percentage shares are unavailable.'}</p>}
      <div className="breakdown-body">
        <DonutChart
          total={total}
          segments={segments}
          activeSegment={activeSegment}
          setActiveSegment={setActiveSegment}
        />
        <ul className="breakdown-legend">
          {segments.map(seg => {
            const isHovered = activeSegment?.label === seg.label
            return (
              <li
                key={seg.label}
                className="legend-row"
                onMouseEnter={() => setActiveSegment(seg)}
                onMouseLeave={() => setActiveSegment(null)}
                style={{
                  background: isHovered ? 'var(--surface-subtle)' : 'transparent',
                  borderRadius: '6px',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  fontWeight: isHovered ? '700' : '500',
                  transition: 'background 0.15s ease',
                }}
              >
                <span className="legend-dot" style={{ background: seg.color }} />
                <span className="legend-shape-icon" style={{ fontSize: '9px', color: seg.color, marginRight: '4px' }}>
                  {seg.label.includes('Severe') ? '▲' : seg.label.includes('High') ? '■' : seg.label.includes('Moderate') ? '◆' : '●'}
                </span>
                <span className="legend-label">
                  {seg.label} <small style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({seg.count} clus)</small>
                </span>
                <span className="legend-pct">{totalFrp > 0 ? `${Math.round(seg.pct)}% FRP` : 'N/A'}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
