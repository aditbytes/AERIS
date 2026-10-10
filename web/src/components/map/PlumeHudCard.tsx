import { useAeris } from '@/services/dataContext'
import './PlumeHudCard.css'

export default function PlumeHudCard() {
  const { etaHours, corridor } = useAeris()
  return <div className="plume-hud card"><div className="hud-headline">Minimum ranked-site model ETA<span className="hud-eta">{etaHours == null ? ' Unavailable' : ` ${etaHours.toFixed(1)} hours`}</span></div><p>Relative to forecast start: {corridor?.forecast_start ?? 'unavailable'}. Uncalibrated baseline, not guaranteed arrival. AQI forecast and observational model validation are unavailable.</p></div>
}
