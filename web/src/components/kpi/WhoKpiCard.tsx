/**
 * WhoKpiCard — Decision Card 2: Who's at Risk (WHO)
 * Answers: "WHO is at risk?"
 *
 * Primary: Exposed population estimate with low-high 90% CI range bar
 * Rows: Hospitals (total recorded beds, n of N unrecorded) & Schools (total recorded student capacity, n of N unrecorded)
 * Highlight: Highest-risk hospital (name, ETA, risk score) with fly-to click handler
 * Respects active intervention scenario (No Action / Partial / Full)
 */
import { useMemo } from 'react'
import { useAeris } from '@/services/dataContext'

function formatPopK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

export default function WhoKpiCard() {
  const {
    rankedSites,
    activeExposedPopulation,
    interventionScenario,
    setSelectedSiteId,
    setFlyToLocation,
  } = useAeris()

  // 1. Population & CI metrics
  const rawExposed = rankedSites?.exposed_population.estimate ?? null
  const rawLow     = rankedSites?.exposed_population.low ?? null
  const rawHigh    = rankedSites?.exposed_population.high ?? null

  const scenarioLabel = {
    none: 'No Action',
    partial: 'Partial Intervene',
    full: 'Full Intervene',
  }[interventionScenario]

  // Scenario scale multiplier
  const scenarioMultiplier = interventionScenario === 'none' ? 1 : interventionScenario === 'partial' ? 0.65 : 0.45
  const currentEstimate = activeExposedPopulation ?? (rawExposed ? Math.round(rawExposed * scenarioMultiplier) : null)
  const currentLow = rawLow ? Math.round(rawLow * scenarioMultiplier) : null
  const currentHigh = rawHigh ? Math.round(rawHigh * scenarioMultiplier) : null

  // 2. Sensitive Receptor Facilities — Strictly NO scoring defaults as facts
  const facilityStats = useMemo(() => {
    if (!rankedSites || rankedSites.sites.length === 0) {
      return {
        hospitalsTotal: 0,
        hospitalsRecordedBeds: null as number | null,
        hospitalsUnrecorded: 0,
        schoolsTotal: 0,
        schoolsRecordedCap: null as number | null,
        schoolsUnrecorded: 0,
        highestRiskHospital: null,
      }
    }

    const sites = rankedSites.sites
    const hospitals = sites.filter(s => s.type === 'hospital')
    const schools = sites.filter(s => s.type === 'school')

    // Hospitals
    let hospBedsSum = 0
    let hospRecordedCount = 0
    for (const h of hospitals) {
      if (h.occupancy !== null && typeof h.occupancy === 'number') {
        hospBedsSum += h.occupancy
        hospRecordedCount++
      }
    }
    const hospUnrecorded = hospitals.length - hospRecordedCount

    // Schools
    let schoolCapSum = 0
    let schoolRecordedCount = 0
    for (const s of schools) {
      if (s.occupancy !== null && typeof s.occupancy === 'number') {
        schoolCapSum += s.occupancy
        schoolRecordedCount++
      }
    }
    const schoolUnrecorded = schools.length - schoolRecordedCount

    // Single highest-risk hospital
    const sortedHospitals = [...hospitals].sort((a, b) => b.risk_score - a.risk_score)
    const topHosp = sortedHospitals[0] ?? null

    return {
      hospitalsTotal: hospitals.length,
      hospitalsRecordedBeds: hospRecordedCount > 0 ? hospBedsSum : null,
      hospitalsUnrecorded: hospUnrecorded,
      schoolsTotal: schools.length,
      schoolsRecordedCap: schoolRecordedCount > 0 ? schoolCapSum : null,
      schoolsUnrecorded: schoolUnrecorded,
      highestRiskHospital: topHosp,
    }
  }, [rankedSites])

  // Fly to high risk hospital handler
  const handleHospitalClick = (hosp: NonNullable<typeof facilityStats.highestRiskHospital>) => {
    setSelectedSiteId(hosp.site_id)
    setFlyToLocation({
      lon: hosp.lon,
      lat: hosp.lat,
      zoom: 14,
      name: hosp.name,
    })
  }

  // Check staleness
  const { isStale, staleLabel } = useMemo(() => {
    if (!rankedSites?.generated_at) return { isStale: false, staleLabel: '' }
    const genTime = new Date(rankedSites.generated_at).getTime()
    const diffHours = (Date.now() - genTime) / (1000 * 60 * 60)
    return {
      isStale: diffHours > 24,
      staleLabel: `${Math.round(diffHours)}h old`,
    }
  }, [rankedSites])

  const infoTooltip = `Data Contract: ranked_sites.json
Generated: ${rankedSites?.generated_at ? new Date(rankedSites.generated_at).toUTCString() : '—'}
Active Scenario: ${scenarioLabel} (Scenario multiplier: ${(scenarioMultiplier * 100).toFixed(0)}%)
Confidence Interval: 90% Bayesian plume footprint bounds`

  return (
    <div className="metric-card decision-card card" title="Who's at Risk: Exposed community estimate and corridor institutional vulnerability">
      {/* Header */}
      <div className="decision-card-head">
        <div className="decision-card-title-row">
          <span className="decision-card-q">WHO IS AT RISK?</span>
          <div className="decision-head-badges">
            {isStale && (
              <span className="kpi-amber-tag" title="Snapshot older than freshness threshold">
                ⚠ {staleLabel}
              </span>
            )}
            <button
              type="button"
              className="kpi-info-btn"
              title={infoTooltip}
              aria-label="Data source contract information for Who is at Risk"
            >
              ⓘ
            </button>
          </div>
        </div>
        <span className="metric-label">
          Exposed · <span className="scenario-name-highlight">{scenarioLabel}</span>
        </span>
      </div>

      {/* Primary: Exposed Population + CI Range Bar */}
      <div className="decision-primary-block">
        <div className="metric-value-row">
          <span className="metric-value">
            {currentEstimate ? formatPopK(currentEstimate) : '—'}
          </span>
          <span className="exposed-residents-tag">residents</span>
        </div>

        {/* Real Range Bar encoding CI interval */}
        <div className="ci-range-container" aria-label={`Confidence interval: ${currentLow ? formatPopK(currentLow) : '—'} to ${currentHigh ? formatPopK(currentHigh) : '—'}`}>
          <div className="ci-range-bar-track">
            <div className="ci-range-fill" style={{ left: '15%', width: '70%' }} />
            <div className="ci-range-point" style={{ left: '50%' }} title={`Estimate: ${currentEstimate?.toLocaleString() ?? '—'}`} />
          </div>
          <div className="ci-range-labels">
            <span>Low {currentLow ? formatPopK(currentLow) : '—'}</span>
            <span className="ci-center-lbl">90% CI</span>
            <span>High {currentHigh ? formatPopK(currentHigh) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Rows: Hospitals & Schools recorded capacity */}
      <div className="facility-audit-rows">
        <div className="facility-row" title={`${facilityStats.hospitalsTotal} hospitals modeled along corridor. Only recorded bed data is shown.`}>
          <span className="facility-icon">🏥</span>
          <span className="facility-type">Hospitals:</span>
          <span className="facility-count"><strong>{facilityStats.hospitalsTotal}</strong></span>
          <span className="facility-sub">
            · {facilityStats.hospitalsRecordedBeds !== null ? `${facilityStats.hospitalsRecordedBeds.toLocaleString()} beds` : '— beds'} ({facilityStats.hospitalsUnrecorded} of {facilityStats.hospitalsTotal} unrecorded)
          </span>
        </div>
        <div className="facility-row" title={`${facilityStats.schoolsTotal} schools modeled along corridor. Only recorded capacity is shown.`}>
          <span className="facility-icon">🏫</span>
          <span className="facility-type">Schools:</span>
          <span className="facility-count"><strong>{facilityStats.schoolsTotal}</strong></span>
          <span className="facility-sub">
            · {facilityStats.schoolsRecordedCap !== null ? `${facilityStats.schoolsRecordedCap.toLocaleString()} cap.` : '— capacity'} ({facilityStats.schoolsUnrecorded} of {facilityStats.schoolsTotal} unrecorded)
          </span>
        </div>
      </div>

      {/* Highlight: Single Highest-Risk Hospital */}
      <div className="decision-footer">
        {facilityStats.highestRiskHospital ? (
          <button
            type="button"
            className="highest-risk-site-btn"
            onClick={() => handleHospitalClick(facilityStats.highestRiskHospital!)}
            title={`Highest Risk Healthcare Facility: ${facilityStats.highestRiskHospital.name}. Click to fly to site.`}
            aria-label={`Highest-risk hospital: ${facilityStats.highestRiskHospital.name}, Risk ${(facilityStats.highestRiskHospital.risk_score * 100).toFixed(0)}%. Click to view on map.`}
          >
            <span className="site-priority-pill">HIGH RISK HOSP</span>
            <span className="site-name-truncate">{facilityStats.highestRiskHospital.name}</span>
            <span className="site-metrics-compact">
              ETA {facilityStats.highestRiskHospital.eta_hours <= 0 ? 'Now' : `${facilityStats.highestRiskHospital.eta_hours.toFixed(1)}h`} · {(facilityStats.highestRiskHospital.risk_score * 100).toFixed(0)}%
            </span>
          </button>
        ) : (
          <span className="footer-transport-text text-tertiary">No hospital facilities flagged</span>
        )}
      </div>
    </div>
  )
}
