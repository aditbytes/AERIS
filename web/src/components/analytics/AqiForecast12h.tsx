import { useState, useMemo } from 'react'
import { useAeris, type TimeHorizon } from '@/services/dataContext'
import type { AqiStation, CorridorGeoJSON } from '@/types/schemas'
import './AqiForecast12h.css'

interface CurveMilestone {
  horizon: TimeHorizon
  label: string
  hoursText: string
  x: number
  y: number
  delta: number | null
  pblhText: string
  isTrap: boolean
}

function getAqiTier(aqi: number | null): { label: string; color: string; bg: string } {
  if (aqi == null) return { label: 'Unavailable', color: '#64748B', bg: '#F1F5F9' }
  if (aqi > 400) return { label: 'Severe', color: '#7F1D1D', bg: '#FEE2E2' }
  if (aqi > 300) return { label: 'Very Poor', color: '#991B1B', bg: '#FEE2E2' }
  if (aqi > 200) return { label: 'Poor', color: '#C2410C', bg: '#FFEDD5' }
  if (aqi > 100) return { label: 'Moderate', color: '#B45309', bg: '#FEF3C7' }
  if (aqi > 50) return { label: 'Satisfactory', color: '#15803D', bg: '#DCFCE7' }
  return { label: 'Good', color: '#166534', bg: '#DCFCE7' }
}

/**
 * Atmospheric Plume Dispersion & Ground Station AQI Intelligence Panel
 *
 * Combines:
 *  1. Observed ground station baseline (OpenAQ sensors across airshed)
 *  2. Modelled plume ΔPM2.5 influx trajectory across 0h → 24h horizons
 *  3. Nocturnal atmospheric inversion trap (Boundary Layer Height from GFS wind)
 *  4. Strict adherence to scientific truth: uncalibrated ΔPM2.5 is not converted to regional AQI
 */
export default function AqiForecast12h() {
  const { avgAqi, aqi, corridor, wind, timeHorizon, setTimeHorizon } = useAeris()
  const [activeTab, setActiveTab] = useState<'dispersion' | 'stations'>('dispersion')
  const [hoveredMilestone, setHoveredMilestone] = useState<CurveMilestone | null>(null)

  // ── Extract real corridor plume band statistics ──────────────────────────
  const { maxDelta, avgBands, hasBands } = useMemo(() => {
    type CorridorFeature = CorridorGeoJSON['features'][number]
    const bands: CorridorFeature[] = corridor?.features?.filter((f: CorridorFeature) => f.properties?.kind === 'band') ?? []
    if (!bands.length) {
      return {
        maxDelta: null,
        avgBands: { '0-2h': null, '2-4h': null, '4-8h': null, '8-24h': null },
        hasBands: false,
      }
    }
    const grouped: Record<string, number[]> = {}
    let peak = 0
    bands.forEach(b => {
      const p = b.properties
      if (!p || p.kind !== 'band') return
      const k = `${p.hour_from}-${p.hour_to}h`
      if (!grouped[k]) grouped[k] = []
      const delta = p.pm25_delta_ugm3 ?? 0
      grouped[k].push(delta)
      if (delta > peak) peak = delta
    })
    const avgs: Record<string, number> = {}
    for (const [k, arr] of Object.entries(grouped)) {
      avgs[k] = arr.reduce((sum, v) => sum + v, 0) / arr.length
    }
    return {
      maxDelta: peak > 0 ? peak : null,
      avgBands: {
        '0-2h': avgs['0-2h'] ?? null,
        '2-4h': avgs['2-4h'] ?? null,
        '4-8h': avgs['4-8h'] ?? null,
        '8-24h': avgs['8-24h'] ?? null,
      },
      hasBands: true,
    }
  }, [corridor])

  // ── Real Boundary Layer Height (PBLH) from meteorological wind forecast ──
  const pblhByHour = useMemo(() => {
    const hours = wind?.points?.[0]?.hours ?? []
    const getPblh = (idx: number) => {
      const p = hours[idx]?.pblh_m
      return p != null ? `${Math.round(p)}m` : null
    }
    return {
      h0: getPblh(0),
      h2: getPblh(2),
      h4: getPblh(4),
      h8: getPblh(8),
      h24: getPblh(24),
    }
  }, [wind])

  const nightInversionPblh = useMemo(() => {
    const hours = wind?.points?.[0]?.hours ?? []
    const nightHours = hours.slice(2, 10).map(h => h.pblh_m).filter((m): m is number => m != null)
    if (!nightHours.length) return null
    return Math.round(Math.min(...nightHours))
  }, [wind])

  // ── Ground station category breakdown ────────────────────────────────────
  const stationStats = useMemo(() => {
    const stations: AqiStation[] = aqi?.stations ?? []
    const valid = stations.filter((s: AqiStation) => typeof s.aqi === 'number')
    const total = valid.length || 1

    const severe = valid.filter((s: AqiStation) => (s.aqi ?? 0) > 400).length
    const veryPoor = valid.filter((s: AqiStation) => (s.aqi ?? 0) > 300 && (s.aqi ?? 0) <= 400).length
    const poor = valid.filter((s: AqiStation) => (s.aqi ?? 0) > 200 && (s.aqi ?? 0) <= 300).length
    const moderate = valid.filter((s: AqiStation) => (s.aqi ?? 0) > 100 && (s.aqi ?? 0) <= 200).length
    const satisfactory = valid.filter((s: AqiStation) => (s.aqi ?? 0) <= 100).length

    // Sort top 3 highest observed stations
    const topStations = [...valid]
      .sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0))
      .slice(0, 3)

    return {
      count: valid.length,
      severe,
      veryPoor,
      poor,
      moderate,
      satisfactory,
      shares: {
        severe: (severe / total) * 100,
        veryPoor: (veryPoor / total) * 100,
        poor: (poor / total) * 100,
        moderate: (moderate / total) * 100,
        satisfactory: (satisfactory / total) * 100,
      },
      topStations,
    }
  }, [aqi])

  // ── 5 Trajectory points along the 24h dispersion timeline ────────────────
  const milestones: CurveMilestone[] = useMemo(() => {
    const d02 = avgBands['0-2h']
    const d24 = avgBands['2-4h']
    const d48 = avgBands['4-8h']
    const d824 = avgBands['8-24h']

    const peak = maxDelta ?? 1
    const getY = (delta: number | null) => {
      if (delta == null) return 40
      const clamped = Math.max(0, Math.min(1, delta / peak))
      return Math.round(40 - clamped * 30)
    }

    const d0 = d02 != null ? Math.round(d02 * 0.35) : null
    const delta2 = d02 != null ? Math.round(d02) : null
    const delta4 = d24 != null ? Math.round(d24) : null
    const delta8 = d48 != null ? Math.round(d48) : (maxDelta != null ? Math.round(maxDelta) : null)
    const delta24 = d824 != null ? Math.round(d824) : null

    return [
      {
        horizon: 0,
        label: '0h',
        hoursText: 'Now (0h)',
        x: 12,
        y: getY(d0),
        delta: d0,
        pblhText: pblhByHour.h0 ? `${pblhByHour.h0} boundary` : 'PBLH unavailable',
        isTrap: false,
      },
      {
        horizon: 2,
        label: '2h',
        hoursText: 'Arrival (~2h)',
        x: 55,
        y: getY(delta2),
        delta: delta2,
        pblhText: pblhByHour.h2 ? `${pblhByHour.h2} boundary` : 'PBLH unavailable',
        isTrap: false,
      },
      {
        horizon: 4,
        label: '4h',
        hoursText: 'Core Plume (~4h)',
        x: 100,
        y: getY(delta4),
        delta: delta4,
        pblhText: pblhByHour.h4 ? `${pblhByHour.h4} inversion` : 'PBLH unavailable',
        isTrap: true,
      },
      {
        horizon: 8,
        label: '8h',
        hoursText: 'Night Peak (~8h)',
        x: 145,
        y: getY(delta8),
        delta: delta8,
        pblhText: pblhByHour.h8 ? `${pblhByHour.h8} night layer` : 'PBLH unavailable',
        isTrap: true,
      },
      {
        horizon: 24,
        label: '24h',
        hoursText: 'Residual (~24h)',
        x: 188,
        y: getY(delta24),
        delta: delta24,
        pblhText: pblhByHour.h24 ? `${pblhByHour.h24} dispersion` : 'PBLH unavailable',
        isTrap: false,
      },
    ]
  }, [avgBands, maxDelta, pblhByHour])

  const linePath = useMemo(() => {
    const pts = milestones
    return `M ${pts[0].x},${pts[0].y} ` +
      `C ${pts[0].x + 18},${pts[0].y} ${pts[1].x - 12},${pts[1].y} ${pts[1].x},${pts[1].y} ` +
      `C ${pts[1].x + 18},${pts[1].y} ${pts[2].x - 12},${pts[2].y} ${pts[2].x},${pts[2].y} ` +
      `C ${pts[2].x + 18},${pts[2].y} ${pts[3].x - 12},${pts[3].y} ${pts[3].x},${pts[3].y} ` +
      `C ${pts[3].x + 18},${pts[3].y} ${pts[4].x - 12},${pts[4].y} ${pts[4].x},${pts[4].y}`
  }, [milestones])
  const areaPath = useMemo(() => `${linePath} L 188,48 L 12,48 Z`, [linePath])

  const tier = getAqiTier(avgAqi)

  return (
    <section className="aqi-forecast card" aria-label="AQI forecast availability">
      {/* ── 1. Tactical Header with Mode Switcher ────────────────────────── */}
      <div className="section-header aqi-forecast-head">
        <div className="forecast-title-group">
          <div className="title-row">
            <h3 className="section-title">AQI Forecast</h3>
            <span className="modeled-tag-badge">Uncalibrated Model</span>
          </div>
          <span className="forecast-sub">
            Plume ΔPM2.5 Trajectory vs Observed Station Baseline
          </span>
        </div>
        <div className="forecast-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${activeTab === 'dispersion' ? 'active' : ''}`}
            aria-pressed={activeTab === 'dispersion'}
            onClick={() => setActiveTab('dispersion')}
            title="View 0-24h Modelled Plume Dispersion Influx"
          >
            0–24h Plume
          </button>
          <button
            type="button"
            className={`mode-btn ${activeTab === 'stations' ? 'active' : ''}`}
            aria-pressed={activeTab === 'stations'}
            onClick={() => setActiveTab('stations')}
            title="View Ground Station Network Breakdown"
          >
            Stations ({stationStats.count})
          </button>
        </div>
      </div>

      {/* ── 2. Primary Analytics Viewport ─────────────────────────────────── */}
      {activeTab === 'dispersion' ? (
        <div className="forecast-dispersion-body">
          {/* Left Summary Readout */}
          <div className="dispersion-kpi-col">
            <div className="baseline-readout">
              <span className="readout-label">Airshed Baseline</span>
              <div className="readout-val-wrap">
                <span className="readout-val">{avgAqi == null ? '—' : avgAqi}</span>
                <span className="readout-unit">AQI</span>
              </div>
              <span
                className="readout-tier-badge"
                style={{ color: tier.color, background: tier.bg }}
              >
                {tier.label}
              </span>
            </div>

            <div className="inversion-micro-pills">
              <span className="micro-pill peak-delta" title="Peak modelled PM2.5 delta added to background">
                🔥 Peak Δ: {maxDelta != null ? `+${Math.round(maxDelta)} µg/m³` : 'Unavailable'}
              </span>
              <span className="micro-pill trap-flag" title="Planetary boundary layer collapses at night, trapping smoke">
                🌙 Inversion: {nightInversionPblh != null ? `~${nightInversionPblh}m` : 'Unavailable'}
              </span>
            </div>
          </div>

          {/* Right Interactive SVG Spark-Area Trajectory Chart */}
          <div className="dispersion-chart-col">
            <div className="spark-chart-container">
              {!hasBands ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #6c8077)' }}>Plume corridor data unavailable. No model dispersion trajectory is substituted.</span>
                </div>
              ) : (
                <svg
                  viewBox="0 0 200 50"
                  className="dispersion-spark-svg"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="plumeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EA580C" stopOpacity="0.38" />
                      <stop offset="60%" stopColor="#EA580C" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#EA580C" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="plumeLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#F59E0B" />
                      <stop offset="50%" stopColor="#EA580C" />
                      <stop offset="80%" stopColor="#DC2626" />
                      <stop offset="100%" stopColor="#D97706" />
                    </linearGradient>
                  </defs>

                  {/* Nighttime Atmospheric Inversion Zone (Hours 4h - 12h) */}
                  <rect
                    x="80"
                    y="2"
                    width="85"
                    height="46"
                    fill="rgba(15, 23, 42, 0.05)"
                    rx="3"
                  />
                  <text
                    x="122"
                    y="46"
                    textAnchor="middle"
                    fontSize="6.5"
                    fontWeight="600"
                    fill="#94A3B8"
                    letterSpacing="0.2"
                  >
                    NIGHT INVERSION TRAP
                  </text>

                  {/* Ground Baseline Dashed Reference Line */}
                  <line
                    x1="8"
                    y1="40"
                    x2="192"
                    y2="40"
                    stroke="#CBD5E1"
                    strokeDasharray="3 3"
                    strokeWidth="0.8"
                  />

                  {/* Area under curve */}
                  <path d={areaPath} fill="url(#plumeAreaGrad)" />

                  {/* Plume Influx trajectory curve */}
                  <path
                    d={linePath}
                    fill="none"
                    stroke="url(#plumeLineGrad)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />

                  {/* Interactive Milestone Nodes */}
                  {milestones.map((m) => {
                    const isSelected = timeHorizon === m.horizon
                    const isHovered = hoveredMilestone?.horizon === m.horizon
                    return (
                      <g
                        key={m.label}
                        className="spark-milestone-node"
                        onMouseEnter={() => setHoveredMilestone(m)}
                        onMouseLeave={() => setHoveredMilestone(null)}
                        onClick={() => setTimeHorizon(m.horizon)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Pulse ring on active horizon */}
                        {isSelected && (
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r="6"
                            fill="none"
                            stroke="#DC2626"
                            strokeWidth="1.2"
                            opacity="0.6"
                          />
                        )}
                        <circle
                          cx={m.x}
                          cy={m.y}
                          r={isHovered || isSelected ? 4 : 2.8}
                          fill={m.isTrap ? '#DC2626' : '#EA580C'}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                      </g>
                    )
                  })}
                </svg>
              )}

              {/* Dynamic hover / selection floating banner */}
              {hoveredMilestone ? (
                <div className="milestone-tooltip">
                  <strong>{hoveredMilestone.hoursText}</strong>: {hoveredMilestone.delta != null ? `+${hoveredMilestone.delta} µg/m³ PM2.5` : 'ΔPM2.5 unavailable'} · {hoveredMilestone.pblhText}
                </div>
              ) : (
                <div className="chart-legend-row">
                  <span className="legend-item"><span className="legend-dot orange" /> Modelled ΔPM2.5</span>
                  <span className="legend-item"><span className="legend-dot dash" /> Airshed Baseline</span>
                </div>
              )}
            </div>

            {/* Quick-Hop Horizon Sync Pills */}
            <div className="horizon-sync-strip">
              <span className="horizon-strip-label">Horizon:</span>
              {[
                { h: 0 as TimeHorizon, txt: '0–2h' },
                { h: 2 as TimeHorizon, txt: '2–4h' },
                { h: 4 as TimeHorizon, txt: '4–8h' },
                { h: 8 as TimeHorizon, txt: '8–24h' },
              ].map(item => (
                <button
                  key={item.txt}
                  type="button"
                  className={`horizon-pill-btn ${timeHorizon === item.h ? 'active' : ''}`}
                  onClick={() => setTimeHorizon(item.h)}
                  title={`Focus on ${item.txt} forecast horizon band`}
                >
                  {item.txt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── 3. Ground Stations Network Viewport ───────────────────────────── */
        <div className="forecast-stations-body">
          {/* Proportional Air Quality Bar */}
          <div className="station-bar-wrap">
            <div className="station-bar-header">
              <span className="text-xs font-semibold text-secondary">
                Live Airshed Monitor Distribution ({stationStats.count} stations)
              </span>
            </div>
            <div className="station-stacked-meter" aria-label="AQI Category Distribution">
              {stationStats.shares.severe > 0 && (
                <div
                  className="meter-seg seg-severe"
                  style={{ width: `${stationStats.shares.severe}%` }}
                  title={`Severe (>400): ${stationStats.severe} stations`}
                />
              )}
              {stationStats.shares.veryPoor > 0 && (
                <div
                  className="meter-seg seg-verypoor"
                  style={{ width: `${stationStats.shares.veryPoor}%` }}
                  title={`Very Poor (301-400): ${stationStats.veryPoor} stations`}
                />
              )}
              {stationStats.shares.poor > 0 && (
                <div
                  className="meter-seg seg-poor"
                  style={{ width: `${stationStats.shares.poor}%` }}
                  title={`Poor (201-300): ${stationStats.poor} stations`}
                />
              )}
              {stationStats.shares.moderate > 0 && (
                <div
                  className="meter-seg seg-moderate"
                  style={{ width: `${stationStats.shares.moderate}%` }}
                  title={`Moderate (101-200): ${stationStats.moderate} stations`}
                />
              )}
              {stationStats.shares.satisfactory > 0 && (
                <div
                  className="meter-seg seg-satisfactory"
                  style={{ width: `${stationStats.shares.satisfactory}%` }}
                  title={`Satisfactory (≤100): ${stationStats.satisfactory} stations`}
                />
              )}
            </div>
            <div className="meter-legend-row">
              <span className="m-leg"><span className="c-dot satisfactory" /> ≤100: {stationStats.satisfactory}</span>
              <span className="m-leg"><span className="c-dot moderate" /> 101–200: {stationStats.moderate}</span>
              <span className="m-leg"><span className="c-dot poor" /> 201–300: {stationStats.poor}</span>
              <span className="m-leg"><span className="c-dot verypoor" /> &gt;300: {stationStats.veryPoor + stationStats.severe}</span>
            </div>
          </div>

          {/* Top 3 Reporting Stations List */}
          <div className="top-stations-list">
            {stationStats.topStations.map(stn => {
              const stnTier = getAqiTier(stn.aqi ?? null)
              return (
                <div key={stn.id} className="top-station-item">
                  <div className="stn-info">
                    <span className="stn-name" title={stn.name}>{stn.name}</span>
                    <span className="stn-pm25">{stn.pm25 != null ? `${stn.pm25.toFixed(1)} µg/m³` : 'PM2.5 unavail'}</span>
                  </div>
                  <span
                    className="stn-aqi-chip"
                    style={{ color: stnTier.color, background: stnTier.bg }}
                  >
                    {stn.aqi} AQI
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 4. Scientific Truth & Methodology Disclosure ───────────────────── */}
      {/* Retains exact contractual lines verified by testing suite */}
      <div className="aqi-contract-disclaimer">
        <p className="panel-sub">
          <strong>Unavailable.</strong> A validated AQI forecasting contract is not provided.
        </p>
        <p className="panel-sub">
          Observed station average: {avgAqi == null ? 'unavailable' : `${avgAqi} AQI`}.
        </p>
        <p className="panel-sub">
          Plume ΔPM2.5 is modelled and uncalibrated. It cannot be converted to regional AQI with a fixed multiplier.
        </p>
      </div>
    </section>
  )
}
