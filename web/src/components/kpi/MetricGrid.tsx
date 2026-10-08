/**
 * MetricGrid — Top 4 Decision Cards Row for CAQM / DPCC Duty Officers
 *
 * Card 1: Time to Impact (WHEN) — Earliest ETA, next deadline, corridor arrival strip, wind transport context
 * Card 2: Who's at Risk (WHO)   — Exposed population with CI range bar, recorded hospital/school capacities, highest-risk hospital
 * Card 3: Dominant Source (WHERE/WHY) — Top FRP cluster, detection age, top 3 stacked bar, neutral territory split
 * Card 4: Ground AQI (CPCB / OpenAQ)  — Real sensor average, CAQM revised GRAP trigger distance
 */
import WhenKpiCard from './WhenKpiCard'
import WhoKpiCard from './WhoKpiCard'
import WhereKpiCard from './WhereKpiCard'
import AqiKpiCard from './AqiKpiCard'
import './MetricGrid.css'

export default function MetricGrid() {
  return (
    <div className="metric-grid" role="region" aria-label="Incident Decision Metrics">
      {/* 1. WHEN does it hit? */}
      <WhenKpiCard />

      {/* 2. WHO is at risk? */}
      <WhoKpiCard />

      {/* 3. WHERE / WHY is it coming from? */}
      <WhereKpiCard />

      {/* 4. Ground AQI Telemetry & GRAP Status */}
      <AqiKpiCard />
    </div>
  )
}
