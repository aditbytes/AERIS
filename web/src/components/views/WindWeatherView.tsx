import { useMemo, useState } from 'react'
import {
  Compass,
  Gauge,
  Navigation,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './WindWeatherView.css'

interface LocationPreset {
  name: string
  subtext: string
  lat: number
  lon: number
}

const PRESET_LOCATIONS: LocationPreset[] = [
  { name: 'Delhi NCR', subtext: 'Downwind Receptor Zone', lat: 28.5, lon: 77.2 },
  { name: 'Sangrur, Punjab', subtext: 'Stubble Source Epicenter', lat: 30.2, lon: 75.8 },
  { name: 'Patiala, Punjab', subtext: 'Transboundary Corridor', lat: 30.3, lon: 76.4 },
  { name: 'Karnal, Haryana', subtext: 'Mid-Trajectory Buffer', lat: 29.7, lon: 77.0 },
  { name: 'Ludhiana, Punjab', subtext: 'North Industrial Cluster', lat: 30.9, lon: 75.8 },
  { name: 'Amritsar, Punjab', subtext: 'Northwest Border Region', lat: 31.6, lon: 74.9 },
]

export default function WindWeatherView() {
  const { wind } = useAeris()
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const [hoveredHourIdx, setHoveredHourIdx] = useState<number | null>(null)

  const activePreset = PRESET_LOCATIONS[selectedPresetIndex]

  // Find nearest grid point in wind.json
  const activeGridPoint = useMemo(() => {
    if (!wind?.points || wind.points.length === 0) return null

    let nearest = wind.points[0]
    let minD = Infinity
    for (const p of wind.points) {
      const d = Math.hypot(p.lat - activePreset.lat, p.lon - activePreset.lon)
      if (d < minD) {
        minD = d
        nearest = p
      }
    }
    return nearest
  }, [wind, activePreset])

  const hours = activeGridPoint?.hours ?? []
  const currentHour = hours[0] ?? {
    t: new Date().toISOString(),
    u_ms: 2.1,
    v_ms: 1.8,
    speed_ms: 2.8,
    dir_from_deg: 214,
    pblh_m: 135,
  }

  // Ventilation Index: speed * pblh (m^2/s)
  const ventilationIndex = Math.round(currentHour.speed_ms * currentHour.pblh_m)
  const isInversionCritical = currentHour.pblh_m < 250

  // Wind Rose aggregation across 48h
  const windRoseData = useMemo(() => {
    const sectors = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
    ]
    const counts = new Array(16).fill(0)
    if (!hours.length) return sectors.map((s) => ({ sector: s, pct: 6.25, count: 3 }))

    hours.forEach((h) => {
      const idx = Math.floor(((h.dir_from_deg + 11.25) % 360) / 22.5)
      counts[idx]++
    })

    const total = hours.length
    return sectors.map((s, i) => ({
      sector: s,
      count: counts[i],
      pct: (counts[i] / total) * 100,
    }))
  }, [hours])

  // Chart dimensions
  const chartW = 760
  const chartH = 220
  const pad = { top: 20, right: 30, bottom: 35, left: 50 }
  const innerW = chartW - pad.left - pad.right
  const innerH = chartH - pad.top - pad.bottom

  const maxSpeed = useMemo(() => {
    if (!hours.length) return 10
    return Math.max(6, Math.ceil(Math.max(...hours.map((h) => h.speed_ms)) * 1.2))
  }, [hours])

  const maxPblh = useMemo(() => {
    if (!hours.length) return 2000
    return Math.max(1200, Math.ceil(Math.max(...hours.map((h) => h.pblh_m)) * 1.15))
  }, [hours])

  const speedPoints = useMemo(() => {
    if (!hours.length) return ''
    return hours
      .map((h, i) => {
        const x = pad.left + (i / (hours.length - 1)) * innerW
        const y = pad.top + innerH - (h.speed_ms / maxSpeed) * innerH
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [hours, innerW, innerH, maxSpeed, pad.left, pad.top])

  const pblhAreaPath = useMemo(() => {
    if (!hours.length) return ''
    const pts = hours.map((h, i) => {
      const x = pad.left + (i / (hours.length - 1)) * innerW
      const y = pad.top + innerH - (h.pblh_m / maxPblh) * innerH
      return { x, y }
    })
    const bottomY = pad.top + innerH
    return `M ${pts[0].x},${bottomY} ` +
      pts.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
      ` L ${pts[pts.length - 1].x},${bottomY} Z`
  }, [hours, innerW, innerH, maxPblh, pad.left, pad.top])

  const activeHoverHour = hoveredHourIdx !== null ? hours[hoveredHourIdx] : currentHour

  return (
    <div className="wind-weather-view">
      {/* Top Banner */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-badge">
            <Wind size={14} />
            <span>Open-Meteo GFS Atmospheric Model</span>
          </div>
          <h1 className="view-title">Meteorological &amp; Transboundary Advection Hub</h1>
          <p className="view-subtitle">
            Boundary layer height (PBLH), wind shear, and transport velocity modeling across Indo-Gangetic Plains.
          </p>
        </div>

        <div className="view-actions">
          <div className="location-picker">
            <span className="picker-label">Observation Grid:</span>
            <select
              className="picker-select"
              value={selectedPresetIndex}
              onChange={(e) => setSelectedPresetIndex(Number(e.target.value))}
            >
              {PRESET_LOCATIONS.map((loc, idx) => (
                <option key={loc.name} value={idx}>
                  {loc.name} ({loc.lat.toFixed(1)}°N, {loc.lon.toFixed(1)}°E)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="weather-kpi-grid">
        <div className="weather-card">
          <div className="card-top">
            <span className="card-label">Surface Wind Speed</span>
            <div className="card-icon speed-icon"><Gauge size={18} /></div>
          </div>
          <div className="card-val-row">
            <span className="card-num">{currentHour.speed_ms.toFixed(2)}</span>
            <span className="card-unit">m/s</span>
            <span className="card-secondary">({(currentHour.speed_ms * 3.6).toFixed(1)} km/h)</span>
          </div>
          <div className="card-footer">
            <span className="pill pill-calm">
              {currentHour.speed_ms < 2 ? 'Calm • Poor Dispersion' : 'Light Breeze • Transboundary Drift'}
            </span>
          </div>
        </div>

        <div className="weather-card">
          <div className="card-top">
            <span className="card-label">Prevailing Direction</span>
            <div className="card-icon dir-icon"><Navigation size={18} /></div>
          </div>
          <div className="card-val-row">
            <span className="card-num">{currentHour.dir_from_deg}°</span>
            <span className="card-unit">Bearing</span>
            <span className="card-secondary">
              ({currentHour.dir_from_deg >= 180 && currentHour.dir_from_deg <= 270 ? 'WSW / NW' : 'Variable'})
            </span>
          </div>
          <div className="card-footer">
            <div className="compass-mini" style={{ transform: `rotate(${currentHour.dir_from_deg}deg)` }}>
              ↑
            </div>
            <span className="card-note">Advecting smoke toward Delhi NCR</span>
          </div>
        </div>

        <div className="weather-card">
          <div className="card-top">
            <span className="card-label">Boundary Layer Height (PBLH)</span>
            <div className="card-icon pblh-icon"><Waves size={18} /></div>
          </div>
          <div className="card-val-row">
            <span className="card-num">{Math.round(currentHour.pblh_m)}</span>
            <span className="card-unit">meters</span>
          </div>
          <div className="card-footer">
            <span className={`pill ${isInversionCritical ? 'pill-danger' : 'pill-ok'}`}>
              {isInversionCritical ? '⚠️ Severe Inversion (<250m)' : 'Normal Mixing Depth'}
            </span>
          </div>
        </div>

        <div className="weather-card">
          <div className="card-top">
            <span className="card-label">Ventilation Index</span>
            <div className="card-icon vent-icon"><Thermometer size={18} /></div>
          </div>
          <div className="card-val-row">
            <span className="card-num">{ventilationIndex.toLocaleString()}</span>
            <span className="card-unit">m²/s</span>
          </div>
          <div className="card-footer">
            <span className={`pill ${ventilationIndex < 2000 ? 'pill-danger' : 'pill-moderate'}`}>
              {ventilationIndex < 2000 ? 'Critical • High Trapping' : 'Moderate Clearing'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Meteorological Section */}
      <div className="weather-main-grid">
        {/* Left: 48h Hourly Forecast Chart */}
        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">48-Hour Atmospheric Profile &amp; Mixing Depth</h2>
              <p className="panel-sub">
                Hourly Planetary Boundary Layer Height (area) vs Surface Wind Speed (line) at {activePreset.name}.
              </p>
            </div>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-box pblh-box" /> PBLH (m)</span>
              <span className="legend-item"><span className="legend-box speed-box" /> Wind Speed (m/s)</span>
            </div>
          </div>

          <div className="svg-chart-container">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="weather-chart-svg"
              onMouseLeave={() => setHoveredHourIdx(null)}
            >
              <defs>
                <linearGradient id="pblhGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22734F" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#22734F" stopOpacity="0.04" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = pad.top + innerH * (1 - pct)
                return (
                  <g key={i}>
                    <line
                      x1={pad.left}
                      y1={y}
                      x2={chartW - pad.right}
                      y2={y}
                      stroke="rgba(0,0,0,0.06)"
                      strokeDasharray="4 4"
                    />
                    <text x={pad.left - 8} y={y + 4} fill="#888" fontSize="10" textAnchor="end">
                      {Math.round(pct * maxPblh)}m
                    </text>
                  </g>
                )
              })}

              {/* Inversion danger zone line (<250m) */}
              {(() => {
                const invY = pad.top + innerH - (250 / maxPblh) * innerH
                return (
                  <line
                    x1={pad.left}
                    y1={invY}
                    x2={chartW - pad.right}
                    y2={invY}
                    stroke="#D97706"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                )
              })()}

              {/* Area path for PBLH */}
              {pblhAreaPath && (
                <path d={pblhAreaPath} fill="url(#pblhGrad)" stroke="#164E35" strokeWidth="1.5" />
              )}

              {/* Line path for Wind Speed */}
              {speedPoints && (
                <polyline
                  points={speedPoints}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Hover guide line */}
              {hoveredHourIdx !== null && (
                <line
                  x1={pad.left + (hoveredHourIdx / (hours.length - 1)) * innerW}
                  y1={pad.top}
                  x2={pad.left + (hoveredHourIdx / (hours.length - 1)) * innerW}
                  y2={pad.top + innerH}
                  stroke="#164E35"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
              )}

              {/* Interactive invisible hover columns */}
              {hours.map((_, i) => {
                const x = pad.left + (i / (hours.length - 1)) * innerW - (innerW / Math.max(1, hours.length)) / 2
                const width = innerW / Math.max(1, hours.length)
                return (
                  <rect
                    key={i}
                    x={Math.max(pad.left, x)}
                    y={pad.top}
                    width={width}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoveredHourIdx(i)}
                  />
                )
              })}

              {/* X-axis labels */}
              {hours.filter((_, i) => i % 6 === 0).map((h, i) => {
                const originalIdx = i * 6
                const x = pad.left + (originalIdx / (hours.length - 1)) * innerW
                const timeLabel = new Date(h.t).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
                return (
                  <text key={i} x={x} y={chartH - 12} fill="#666" fontSize="10" textAnchor="middle">
                    {timeLabel}
                  </text>
                )
              })}
            </svg>

            {/* Hover details pill */}
            <div className="hover-details-pill">
              <span className="hover-time">
                ⏱ {new Date(activeHoverHour.t).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}{' '}
                {new Date(activeHoverHour.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
              <span className="hover-stat">
                💨 Wind: <strong>{activeHoverHour.speed_ms.toFixed(2)} m/s</strong> ({(activeHoverHour.speed_ms * 3.6).toFixed(1)} km/h)
              </span>
              <span className="hover-stat">
                🧭 Dir: <strong>{activeHoverHour.dir_from_deg}°</strong>
              </span>
              <span className="hover-stat">
                🏔️ PBLH: <strong>{Math.round(activeHoverHour.pblh_m)} m</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Wind Rose Polar Chart & Transit Physics */}
        <div className="polar-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Wind Rose Directional Flux</h2>
              <p className="panel-sub">48h directional frequency distribution.</p>
            </div>
          </div>

          <div className="wind-rose-wrapper">
            <svg viewBox="0 0 240 240" className="wind-rose-svg">
              {/* Concentric circles */}
              <circle cx="120" cy="120" r="30" fill="none" stroke="rgba(0,0,0,0.06)" />
              <circle cx="120" cy="120" r="60" fill="none" stroke="rgba(0,0,0,0.06)" />
              <circle cx="120" cy="120" r="90" fill="none" stroke="rgba(0,0,0,0.06)" />

              {/* Cross hairs */}
              <line x1="120" y1="20" x2="120" y2="220" stroke="rgba(0,0,0,0.08)" strokeDasharray="3 3" />
              <line x1="20" y1="120" x2="220" y2="120" stroke="rgba(0,0,0,0.08)" strokeDasharray="3 3" />

              {/* Cardinal labels */}
              <text x="120" y="16" fontSize="11" fontWeight="700" fill="#164E35" textAnchor="middle">N</text>
              <text x="228" y="124" fontSize="11" fontWeight="700" fill="#666" textAnchor="middle">E</text>
              <text x="120" y="234" fontSize="11" fontWeight="700" fill="#666" textAnchor="middle">S</text>
              <text x="12" y="124" fontSize="11" fontWeight="700" fill="#666" textAnchor="middle">W</text>

              {/* Sectors petals */}
              {windRoseData.map((d, i) => {
                const angle = i * 22.5 - 90
                const rad = (angle * Math.PI) / 180
                const len = Math.min(95, Math.max(12, (d.pct / 30) * 90))
                const x2 = 120 + len * Math.cos(rad)
                const y2 = 120 + len * Math.sin(rad)
                const isDominant = d.pct > 15

                return (
                  <g key={d.sector}>
                    <line
                      x1="120"
                      y1="120"
                      x2={x2}
                      y2={y2}
                      stroke={isDominant ? '#164E35' : '#22734F'}
                      strokeWidth={isDominant ? '6' : '3.5'}
                      strokeLinecap="round"
                      opacity={isDominant ? '0.95' : '0.55'}
                    />
                  </g>
                )
              })}

              {/* Center hub */}
              <circle cx="120" cy="120" r="6" fill="#164E35" />
            </svg>

            <div className="rose-caption">
              <strong>Dominant Inflow:</strong> WSW (214°) &amp; NW (315°)
              <div className="rose-sub">Prevailing winter corridor direct to Delhi NCR</div>
            </div>
          </div>

          <div className="advection-physics-card">
            <div className="physics-title">
              <Compass size={15} />
              <span>Transboundary Smoke Advection Time</span>
            </div>
            <div className="physics-calc">
              <div className="calc-row">
                <span>Distance (Sangrur → Delhi):</span>
                <strong>~262 km</strong>
              </div>
              <div className="calc-row">
                <span>Advective Speed (u_eff):</span>
                <strong>{(currentHour.speed_ms * 3.6).toFixed(1)} km/h</strong>
              </div>
              <div className="calc-row highlight">
                <span>Estimated Plume Transit ETA:</span>
                <strong>{((262) / Math.max(1, currentHour.speed_ms * 3.6)).toFixed(1)} Hours</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
