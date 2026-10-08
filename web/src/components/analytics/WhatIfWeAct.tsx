/**
 * "What If We Act?" — Counterfactual Impact Comparison modeled from real plume & site exposure
 */
import { useAeris } from '@/services/dataContext'
import './WhatIfWeAct.css'

function formatM(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default function WhatIfWeAct() {
  const { exposedPopulation, rankedSites, interventionScenario, setInterventionScenario } = useAeris()

  const total = exposedPopulation
  const siteCount = rankedSites?.sites.length ?? 0
  if (!total) {
    return (
      <div className="whatif card">
        <h3 className="section-title">What If We Act?</h3>
        <p className="panel-sub">No population is inside the current forecast corridor.</p>
      </div>
    )
  }

  const schoolHosp = Math.round(total * 0.65)
  const allIntervene = Math.round(total * 0.45)
  const reduction = Math.round((1 - allIntervene / total) * 100)

  const bars: { id: 'none' | 'partial' | 'full'; label: string; icon: string; value: number; color: string; pattern?: string }[] = [
    { id: 'none',    label: 'No Action',         icon: '⚠', value: total,        color: '#E03131' },
    { id: 'partial', label: 'Partial Intervene', icon: '🛡', value: schoolHosp,   color: '#F59F00', pattern: 'repeating-linear-gradient(45deg, #F59F00, #F59F00 4px, #D97706 4px, #D97706 8px)' },
    { id: 'full',    label: 'Full Intervene',    icon: '✓', value: allIntervene, color: '#22734F' },
  ]

  const maxVal = total

  return (
    <div className="whatif card">
      <div className="whatif-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <h3 className="section-title">What If We Act?</h3>
          <span
            className="whatif-info-tag"
            title="35% and 55% reductions are assumed policy scenario multipliers (not atmospheric model outputs). Illustrates potential acute exposure mitigation under prompt intervention."
            style={{ cursor: 'help', fontSize: '11px', color: 'var(--text-tertiary)' }}
          >
            ⓘ
          </span>
        </div>
        <div
          className="whatif-reduction"
          title="Assumed scenario multipliers: 35% reduction with school/hospital shielding; 55% with comprehensive NCR-wide intervention. These are assumed scenario parameters, not model output."
        >
          <span className="reduction-arrow">↓</span>
          <span className="reduction-pct">{reduction}%</span>
          <span className="reduction-label">Assumed scenario reduction<br/>in acute exposure</span>
        </div>
      </div>

      <div className="whatif-pop">
        Corridor population: <strong>{formatM(total)}</strong> ({siteCount} critical facilities)
      </div>

      <div className="whatif-bars">
        {bars.map(bar => {
          const isSelected = interventionScenario === bar.id
          return (
            <button
              key={bar.id}
              className={`bar-col interactive-scenario ${isSelected ? 'active' : ''}`}
              onClick={() => setInterventionScenario(bar.id)}
              title={`Simulate: ${bar.label} (${formatM(bar.value)} exposed)`}
              type="button"
            >
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    height: `${(bar.value / maxVal) * 100}%`,
                    background: bar.pattern || bar.color,
                  }}
                />
              </div>
              <div className="bar-value" style={{ color: bar.color }}>
                {formatM(bar.value)}
              </div>
              <div className="bar-label">
                <span style={{ marginRight: '3px', fontWeight: 700 }}>{bar.icon}</span>
                {bar.label}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
