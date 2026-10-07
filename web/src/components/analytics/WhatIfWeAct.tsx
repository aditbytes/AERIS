/** "What If We Act?" — Counterfactual Impact Comparison */
import { useAeris } from '@/services/dataContext'
import './WhatIfWeAct.css'

function formatM(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${(n / 1_000).toFixed(0)}K`
}

export default function WhatIfWeAct() {
  const { exposedPopulation } = useAeris()
  const total = exposedPopulation ?? 1_200_000
  const schoolHosp = Math.round(total * 0.65)
  const allIntervene = Math.round(total * 0.45)
  const reduction = Math.round((1 - allIntervene / total) * 100)

  const bars = [
    { label: 'No Action',         value: total,       color: '#E03131', subColor: '#FFCDD2' },
    { label: 'School + Hospital', value: schoolHosp,  color: '#F59F00', subColor: '#FEF3C7' },
    { label: 'All Interventions', value: allIntervene, color: '#22734F', subColor: '#E6F2EB' },
  ]

  const maxVal = total

  return (
    <div className="whatif card">
      <div className="whatif-header">
        <h3 className="section-title">What If We Act?</h3>
        <div className="whatif-reduction">
          <span className="reduction-arrow">↓</span>
          <span className="reduction-pct">{reduction}%</span>
          <span className="reduction-label">Potential reduction in<br/>high-risk exposure</span>
        </div>
      </div>

      <div className="whatif-pop">
        Estimated exposed population: <strong>{formatM(total)}</strong>
      </div>

      <div className="whatif-bars">
        {bars.map(bar => (
          <div key={bar.label} className="bar-col">
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
          </div>
        ))}
      </div>
    </div>
  )
}
