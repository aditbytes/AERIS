import { useAeris } from '@/services/dataContext'
import './PlumeHudCard.css'

export default function PlumeHudCard() {
  const { etaHours, timeHorizon } = useAeris()

  const displayEta = etaHours != null
    ? `~ ${etaHours.toFixed(1).replace('.0', '')} hours`
    : '~ 2 hours'

  const expectedAqi = timeHorizon === 0 ? '280 – 320'
    : timeHorizon === 1 ? '350 – 420'
    : timeHorizon === 2 ? '400 – 480'
    : '430 – 520'

  return (
    <div className="plume-hud card">
      <div className="hud-headline">
        Plume will reach Delhi in
        <span className="hud-eta"> {displayEta}</span>
      </div>
      <div className="hud-metrics">
        <div className="hud-metric">
          <div className="hud-metric-icon">💨</div>
          <div>
            <div className="hud-metric-label">Wind Direction</div>
            <div className="hud-metric-value">NW → SE</div>
          </div>
        </div>
        <div className="hud-metric">
          <div className="hud-metric-icon">🌫</div>
          <div>
            <div className="hud-metric-label">Expected AQI</div>
            <div className="hud-metric-value">{expectedAqi}</div>
          </div>
        </div>
        <div className="hud-metric">
          <div className="hud-metric-icon">✅</div>
          <div>
            <div className="hud-metric-label">Confidence</div>
            <div className="hud-metric-value">82%</div>
          </div>
        </div>
      </div>
    </div>
  )
}
