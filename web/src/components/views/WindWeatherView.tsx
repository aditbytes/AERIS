import { useMemo, useState } from 'react'
import { Gauge, Navigation, Waves, Wind } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { getFeedFreshness } from '@/services/api'
import { useClock } from '@/components/status/useClock'
import './WindWeatherView.css'

const PRESETS = [
  { name: 'Delhi NCR', lat: 28.5, lon: 77.2 }, { name: 'Sangrur', lat: 30.2, lon: 75.8 },
  { name: 'Patiala', lat: 30.3, lon: 76.4 }, { name: 'Karnal', lat: 29.7, lon: 77 },
  { name: 'Ludhiana', lat: 30.9, lon: 75.8 }, { name: 'Amritsar', lat: 31.6, lon: 74.9 },
]
const SECTORS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** Missing mixing heights break the area into segments; they never become zero. */
export function weatherPath(values: (number | null)[], maximum: number, area = false): string {
  const paths: string[] = []
  let segment: { x: number; y: number }[] = []
  const finish = () => {
    if (!segment.length) return
    const line = segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
    paths.push(area ? `${line} L${segment[segment.length - 1].x.toFixed(1)},185 L${segment[0].x.toFixed(1)},185 Z` : line)
    segment = []
  }
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) { finish(); return }
    segment.push({ x: 50 + index / Math.max(1, values.length - 1) * 680, y: 185 - value / Math.max(1, maximum) * 165 })
  })
  finish()
  return paths.join(' ')
}

export default function WindWeatherView() {
  const { wind, feedErrors, staleFeeds } = useAeris()
  const [presetIndex, setPresetIndex] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const now = useClock()
  const point = useMemo(() => {
    const preset = PRESETS[presetIndex]
    return wind?.points.reduce<(typeof wind.points)[number] | null>((nearest, candidate) => {
      const distance = (item: typeof candidate) => Math.hypot(item.lat - preset.lat, (item.lon - preset.lon) * Math.cos(preset.lat * Math.PI / 180))
      return nearest == null || distance(candidate) < distance(nearest) ? candidate : nearest
    }, null) ?? null
  }, [wind, presetIndex])
  const hours = point?.hours ?? []
  const current = hours[Math.min(frameIndex, Math.max(0, hours.length - 1))]
  const speedMax = Math.max(1, ...hours.map(hour => hour.speed_ms))
  const mixingMax = Math.max(1, ...hours.map(hour => hour.pblh_m ?? 0))
  const rose = SECTORS.map((sector, index) => {
    const count = hours.filter(hour => Math.floor(((hour.dir_from_deg + 11.25) % 360) / 22.5) === index).length
    return { sector, count, percent: hours.length ? count / hours.length * 100 : 0 }
  })
  const ventilation = current?.pblh_m == null ? null : Math.round(current.speed_ms * current.pblh_m)
  const freshness = getFeedFreshness('wind', wind?.generated_at, now, !!feedErrors.wind || staleFeeds.some(feed => feed.label === 'wind'))
  return (
    <div className="wind-weather-view">
      <div className="view-header"><div className="view-title-group"><div className="view-badge"><Wind size={14} /><span>Modelled meteorology</span></div><h1 className="view-title">Wind &amp; Mixing Depth</h1><p className="view-subtitle">{wind?.source ?? 'Forecast source unavailable'}. File freshness: {freshness.status}. Generated: {wind?.generated_at ?? 'unavailable'}.</p></div><div className="view-actions"><label className="location-picker"><span className="picker-label">Nearest grid to:</span><select className="picker-select" aria-label="Forecast grid location" value={presetIndex} onChange={event => { setPresetIndex(Number(event.target.value)); setFrameIndex(0) }}>{PRESETS.map((preset, index) => <option key={preset.name} value={index}>{preset.name}</option>)}</select></label></div></div>
      {!current ? <p role="status">Wind forecast unavailable. No modelled readings are substituted.</p> : <>
        <p className="panel-sub">Actual grid: {point?.lat.toFixed(3)}°N, {point?.lon.toFixed(3)}°E. Selected forecast frame: {current.t}. This is a model forecast, not a station observation.</p>
        <div className="weather-kpi-grid">
          <div className="weather-card"><div className="card-top"><span className="card-label">Wind speed</span><Gauge size={18} /></div><div className="card-val-row"><span className="card-num">{current.speed_ms.toFixed(2)}</span><span>m/s ({(current.speed_ms * 3.6).toFixed(1)} km/h)</span></div></div>
          <div className="weather-card"><div className="card-top"><span className="card-label">Direction from</span><Navigation size={18} /></div><div className="card-val-row"><span className="card-num">{current.dir_from_deg.toFixed(1)}°</span><span>{SECTORS[Math.floor(((current.dir_from_deg + 11.25) % 360) / 22.5)]}</span></div><p className="panel-sub">Meteorological bearing; transport is toward the opposite direction.</p></div>
          <div className="weather-card"><div className="card-top"><span className="card-label">Mixing height (PBLH)</span><Waves size={18} /></div><div className="card-val-row"><span className="card-num">{current.pblh_m == null ? 'Unavailable' : Math.round(current.pblh_m)}</span>{current.pblh_m != null && <span>m</span>}</div><p className="panel-sub">Low modelled mixing height alone does not prove an inversion.</p></div>
          <div className="weather-card"><span className="card-label">Ventilation proxy</span><div className="card-val-row"><span className="card-num">{ventilation == null ? 'Unavailable' : ventilation.toLocaleString()}</span>{ventilation != null && <span>m²/s</span>}</div><p className="panel-sub">Wind speed × mixing height; no validated health-risk threshold.</p></div>
        </div>
        <div className="weather-main-grid">
          <section className="chart-panel"><div className="panel-header"><div><h2 className="panel-title">Forecast profile ({hours.length} frames)</h2><p className="panel-sub">Blue line: wind speed (m/s). Green area: mixing height (m). Each has a separately labelled scale. Missing heights leave gaps.</p></div></div>
            <svg viewBox="0 0 760 220" className="weather-chart-svg" role="img" aria-label="Forecast wind speed and mixing height; exact selected values shown above">
              {[0, .5, 1].map(fraction => <g key={fraction}><line x1={50} x2={730} y1={185 - fraction * 165} y2={185 - fraction * 165} stroke="#CBD5E1" /><text x={45} y={190 - fraction * 165} textAnchor="end" fontSize={11} fill="#164E35">{Math.round(fraction * mixingMax)}m</text><text x={735} y={190 - fraction * 165} fontSize={11} fill="#1D4ED8">{(fraction * speedMax).toFixed(1)}</text></g>)}
              <path d={weatherPath(hours.map(hour => hour.pblh_m), mixingMax, true)} fill="rgba(34,115,79,.2)" stroke="#164E35" />
              <path d={weatherPath(hours.map(hour => hour.speed_ms), speedMax)} fill="none" stroke="#2563EB" strokeWidth={2.5} />
              <text x={50} y={211} fontSize={11} fill="#334155">{hours[0].t}</text>{hours.length > 1 && <text x={730} y={211} textAnchor="end" fontSize={11} fill="#334155">{hours[hours.length - 1].t}</text>}
            </svg>
            <label>Forecast frame {Math.min(frameIndex + 1, hours.length)} of {hours.length}<input aria-label="Selected forecast frame" type="range" min={0} max={Math.max(0, hours.length - 1)} value={Math.min(frameIndex, hours.length - 1)} onChange={event => setFrameIndex(Number(event.target.value))} /></label>
          </section>
          <section className="polar-panel"><h2 className="panel-title">Direction frequency</h2><p className="panel-sub">Fraction of forecast frames by direction from. Counts and percentages below provide the color-independent values.</p><svg viewBox="0 0 240 240" className="wind-rose-svg" role="img" aria-label="Directional frequency chart">
            <circle cx={120} cy={120} r={90} fill="none" stroke="#CBD5E1" />
            {rose.filter(item => item.count > 0).map(item => { const angle = SECTORS.indexOf(item.sector) * 22.5 - 90, radians = angle * Math.PI / 180, length = item.percent / 100 * 90; return <line key={item.sector} x1={120} y1={120} x2={120 + length * Math.cos(radians)} y2={120 + length * Math.sin(radians)} stroke="#164E35" strokeWidth={6} /> })}
            <text x={120} y={18} textAnchor="middle" fontSize={12}>N</text><text x={231} y={125} fontSize={12}>E</text><text x={120} y={236} textAnchor="middle" fontSize={12}>S</text><text x={2} y={125} fontSize={12}>W</text>
          </svg><ul className="weather-direction-values">{rose.filter(item => item.count > 0).map(item => <li key={item.sector}>{item.sector}: {item.count} frames ({item.percent.toFixed(1)}%)</li>)}</ul><p className="panel-sub">Plume transit ETA requires the full transport model; a fixed distance divided by one wind speed is not a supported arrival forecast.</p></section>
        </div>
      </>}
    </div>
  )
}
