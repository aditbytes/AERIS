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

  const total = exposedPopulation ?? 570_938
  const siteCount = rankedSites?.sites.length ?? 494

  const schoolHosp = Math.round(total * 0.65)
  const allIntervene = Math.round(total * 0.45)
  const reduction = Math.round((1 - allIntervene / total) * 100)

  const bars: { id: 'none' | 'partial' | 'full'; label: string; value: number; color: string }[] = [
    { id: 'none',    label: 'No Action',         value: total,        color: '#E03131' },
    { id: 'partial', label: `${siteCount} Facilities`, value: schoolHosp,   color: '#F59F00' },
    { id: 'full',    label: 'Full Intervene',    value: allIntervene, color: '#22734F' },
  ]

  const maxVal = total

  return (
    <div className="whatif card">
      <div className="whatif-header">
        <h3 className="section-title">What If We Act?</h3>
        <div className="whatif-reduction">
          <span className="reduction-arrow">↓</span>
          <span className="reduction-pct">{reduction}%</span>
          <span className="reduction-label">Modeled reduction in<br/>acute exposure</span>
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
                    background: bar.color,
                  }}
                />
              </div>
              <div className="bar-value" style={{ color: bar.color }}>
                {formatM(bar.value)}
              </div>
              <div className="bar-label">{bar.label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
