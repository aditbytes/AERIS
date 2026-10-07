/**
 * MetricGrid — top 4 KPI cards row
 */
import { useAeris } from '@/services/dataContext'
import AqiKpiCard from './AqiKpiCard'
import './MetricGrid.css'

function formatPopulation(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// Tiny SVG bar sparkline
function BarSparkline({ color }: { color: string }) {
  const bars = [30, 50, 40, 65, 45, 80]
  return (
    <svg width="56" height="28" viewBox="0 0 56 28" fill="none" aria-hidden="true">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 10}
          y={28 - h * 0.28}
          width="7"
          height={h * 0.28}
          rx="2"
          fill={color}
          opacity={0.5 + i * 0.08}
        />
      ))}
    </svg>
  )
}

// Tiny SVG area sparkline
function AreaSparkline({ color }: { color: string }) {
  const pts = [20, 26, 22, 30, 28, 38, 34, 42]
  const w = 70
  const h = 28
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
  const ys = pts.map(p => h - (p / 42) * h)
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ag)" />
      <path d={line} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function MetricGrid() {
  const { sources, rankedSites, activeExposedPopulation, interventionScenario } = useAeris()

  const sourceCount  = sources?.sources.length ?? 0
  const siteCount    = rankedSites?.sites.length ?? 0

  const exposedDisplay = activeExposedPopulation
    ? formatPopulation(activeExposedPopulation)
    : '571K'

  const exposedDeltaText = interventionScenario === 'full'
    ? '↓ 55% Averted'
    : interventionScenario === 'partial'
    ? '↓ 35% Shielded'
    : '↑ Acute Risk'

  const exposedDeltaClass = interventionScenario === 'none' ? 'delta-up' : 'delta-down'

  return (
    <div className="metric-grid">
      {/* 1. Active Pollution Sources */}
      <div className="metric-card card">
        <div className="metric-icon" style={{ background: '#E8F2EB' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22734F" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 2C6 8 4 13 8 17c1.5 1.5 4 2 6 2" /><path d="M12 2c6 6 8 11 4 15-1.5 1.5-4 2-6 2" />
            <line x1="12" y1="2" x2="12" y2="10" />
          </svg>
        </div>
        <div className="metric-body">
          <span className="metric-label">Active Pollution Sources</span>
          <div className="metric-value-row">
            <span className="metric-value">{sourceCount || '—'}</span>
            <span className="delta delta-up">↑ +3</span>
          </div>
        </div>
        <div className="metric-chart">
          <BarSparkline color="#22734F" />
        </div>
      </div>

      {/* 2. People Potentially Exposed */}
      <div className="metric-card card">
        <div className="metric-icon" style={{ background: '#FEE8E8' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C92A2A" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="9" cy="7" r="3"/><path d="M3 21v-1a6 6 0 0 1 6-6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 21v-1a4.5 4.5 0 0 1 9 0v1"/>
          </svg>
        </div>
        <div className="metric-body">
          <span className="metric-label">People Potentially Exposed</span>
          <div className="metric-value-row">
            <span className="metric-value">{exposedDisplay}</span>
            <span className={`delta ${exposedDeltaClass}`}>{exposedDeltaText}</span>
          </div>
        </div>
        <div className="metric-chart">
          <AreaSparkline color={interventionScenario === 'none' ? '#C92A2A' : '#22734F'} />
        </div>
      </div>

      {/* 3. High-Risk Locations */}
      <div className="metric-card card">
        <div className="metric-icon" style={{ background: '#FFF4EC' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D4620A" strokeWidth="2.2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6m-6 4h4m-4 4h3"/>
          </svg>
        </div>
        <div className="metric-body">
          <span className="metric-label">High-Risk Locations</span>
          <div className="metric-value-row">
            <span className="metric-value">{siteCount || '—'}</span>
            <span className="delta delta-up">↑ +6</span>
          </div>
        </div>
        <div className="metric-chart">
          <BarSparkline color="#D4620A" />
        </div>
      </div>

      {/* 4. Air Quality Average */}
      <AqiKpiCard />
    </div>
  )
}
