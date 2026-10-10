import { useAeris } from '@/services/dataContext'
import './AqiForecast12h.css'

/** A corridor delta is not a validated regional AQI forecast. */
export default function AqiForecast12h() {
  const { avgAqi } = useAeris()
  return (
    <section className="aqi-forecast card" aria-label="AQI forecast availability">
      <h3 className="section-title">AQI Forecast</h3>
      <p className="panel-sub"><strong>Unavailable.</strong> A validated AQI forecasting contract is not provided.</p>
      <p className="panel-sub">Observed station average: {avgAqi == null ? 'unavailable' : `${avgAqi} AQI`}.</p>
      <p className="panel-sub">Plume ΔPM2.5 is modelled and uncalibrated. It cannot be converted to regional AQI with a fixed multiplier.</p>
    </section>
  )
}
