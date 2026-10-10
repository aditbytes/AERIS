import { useState, useMemo } from 'react'
import { useAeris, type TimeHorizon } from '@/services/dataContext'
import { getFeedFreshness } from '@/services/api'
import { AqiFileSchema, CorridorGeoJSONSchema } from '@/types/schemas'
import { useClock } from '@/components/status/useClock'
import './AqiForecast12h.css'

function getAqiTier(aqi: number | null): { label: string; color: string; bg: string } {
  if (aqi == null) return { label: 'Unavailable', color: '#64748B', bg: '#F1F5F9' }
  if (aqi > 400) return { label: 'Severe', color: '#7F1D1D', bg: '#FEE2E2' }
  if (aqi > 300) return { label: 'Very Poor', color: '#991B1B', bg: '#FEE2E2' }
  if (aqi > 200) return { label: 'Poor', color: '#C2410C', bg: '#FFEDD5' }
  if (aqi > 100) return { label: 'Moderate', color: '#B45309', bg: '#FEF3C7' }
  if (aqi > 50) return { label: 'Satisfactory', color: '#15803D', bg: '#DCFCE7' }
  return { label: 'Good', color: '#166534', bg: '#DCFCE7' }
}

/** Observed station AQI and reported model band peaks; neither is an AQI forecast. */
export default function AqiForecast12h() {
  const { avgAqi, aqi, corridor, timeHorizon, setTimeHorizon, loading, feedErrors, staleFeeds } = useAeris()
  const now = useClock()
  const [activeTab, setActiveTab] = useState<'dispersion' | 'stations'>('dispersion')
  const parsedCorridor = useMemo(() => corridor == null ? null : CorridorGeoJSONSchema.safeParse(corridor), [corridor])
  const parsedAqi = useMemo(() => aqi == null ? null : AqiFileSchema.safeParse(aqi), [aqi])
  const model = parsedCorridor?.success ? parsedCorridor.data : null
  const bandRows = useMemo(() => {
    const grouped = new Map<string, { from: number; to: number; peak: number }>()
    for (const feature of model?.features ?? []) {
      const p = feature.properties
      if (p.kind !== 'band') continue
      const key = `${p.hour_from}-${p.hour_to}`
      const existing = grouped.get(key)
      grouped.set(key, { from: p.hour_from, to: p.hour_to, peak: Math.max(existing?.peak ?? 0, p.pm25_delta_ugm3) })
    }
    return [...grouped.values()].sort((a, b) => a.from - b.from || a.to - b.to)
  }, [model])
  const maxDelta = bandRows.length ? bandRows.reduce((peak, row) => Math.max(peak, row.peak), 0) : null
  const modelFreshness = getFeedFreshness('corridor', model?.generated_at, now, staleFeeds.some(feed => feed.label === 'corridor' && feed.stale))
  const forecastEnd = model?.forecast_start && bandRows.length
    ? Date.parse(model.forecast_start) + bandRows.reduce((end, row) => Math.max(end, row.to), 0) * 3_600_000 : null
  const plumeStatus = !parsedCorridor
    ? 'Plume band peaks unavailable: corridor feed missing.'
    : !parsedCorridor.success
      ? 'Plume band peaks unavailable: invalid corridor data.'
      : !bandRows.length
        ? 'Plume band peaks unavailable: no band features.'
        : modelFreshness.status === 'unknown'
          ? 'Model capture age unknown; retained band peaks shown.'
          : modelFreshness.stale
            ? 'Stale model capture; retained band peaks shown.'
            : forecastEnd != null && forecastEnd <= now
              ? 'Expired model forecast; retained band peaks shown.'
              : 'Reported uncalibrated model band peaks.'
  const stations = useMemo(() => parsedAqi?.success ? parsedAqi.data.stations : [], [parsedAqi])
  const stationStats = useMemo(() => {
    const valid = stations.filter(s => s.aqi != null)
    const total = valid.length || 1
    const severe = valid.filter(s => s.aqi! > 400).length
    const veryPoor = valid.filter(s => s.aqi! > 300 && s.aqi! <= 400).length
    const poor = valid.filter(s => s.aqi! > 200 && s.aqi! <= 300).length
    const moderate = valid.filter(s => s.aqi! > 100 && s.aqi! <= 200).length
    const satisfactory = valid.filter(s => s.aqi! <= 100).length
    return {
      count: valid.length, severe, veryPoor, poor, moderate, satisfactory,
      shares: { severe: severe / total * 100, veryPoor: veryPoor / total * 100, poor: poor / total * 100, moderate: moderate / total * 100, satisfactory: satisfactory / total * 100 },
      topStations: [...valid].sort((a, b) => b.aqi! - a.aqi!).slice(0, 3),
    }
  }, [stations])
  const observedAverage = avgAqi != null && Number.isFinite(avgAqi) && avgAqi >= 0 && parsedAqi?.success !== false ? avgAqi : null
  const tier = getAqiTier(observedAverage)
  const aqiFreshness = getFeedFreshness('aqi', parsedAqi?.success ? parsedAqi.data.generated_at : null, now, staleFeeds.some(feed => feed.label === 'aqi' && feed.stale))
  const observationAges = stations.filter(s => s.aqi != null).map(s => getFeedFreshness('aqi', s.observed_at, now))
  const stationStatus = !parsedAqi ? 'Station data unavailable: feed missing.'
    : !parsedAqi.success ? 'Invalid station data; readings unavailable.'
      : !stationStats.count ? 'No reported station AQI values.'
        : observationAges.some(age => age.status === 'unknown') ? 'Observation age unknown for some stations.'
          : observationAges.some(age => age.stale) ? 'Stale station observations retained.'
            : 'Recent station observations; capture time is not observation time.'

  return (
    <section className="aqi-forecast card" aria-label="AQI forecast availability">
      <div className="section-header aqi-forecast-head">
        <div className="forecast-title-group">
          <div className="title-row">
            <h3 className="section-title">AQI Forecast</h3>
            <span className="modeled-tag-badge">Uncalibrated Model</span>
          </div>
          <span className="forecast-sub">Reported plume band peaks and observed station AQI</span>
        </div>
        <div className="forecast-mode-toggle">
          <button type="button" className={`mode-btn ${activeTab === 'dispersion' ? 'active' : ''}`} aria-pressed={activeTab === 'dispersion'} onClick={() => setActiveTab('dispersion')}>
            Plume bands
          </button>
          <button type="button" className={`mode-btn ${activeTab === 'stations' ? 'active' : ''}`} aria-pressed={activeTab === 'stations'} onClick={() => setActiveTab('stations')}>
            Stations ({stationStats.count})
          </button>
        </div>
      </div>

      {activeTab === 'dispersion' ? (
        <div className="forecast-dispersion-body">
          <div className="dispersion-kpi-col">
            <div className="baseline-readout">
              <span className="readout-label">Observed station mean</span>
              <div className="readout-val-wrap">
                <span className="readout-val">{observedAverage ?? '—'}</span>
                <span className="readout-unit">AQI</span>
              </div>
              <span className="readout-tier-badge" style={{ color: tier.color, background: tier.bg }}>{tier.label}</span>
            </div>
          </div>
          <div className="dispersion-band-col">
            <p className="forecast-data-note" role="status" aria-label="Plume data status">
              {loading && 'Loading corridor data… '}{plumeStatus}
              {feedErrors.corridor && ` Corridor feed unavailable: ${feedErrors.corridor}.${model ? ' Retained model data shown.' : ''}`}
            </p>
            {maxDelta != null && <p className="forecast-band-peak">Largest reported band peak: +{maxDelta} µg/m³</p>}
            {bandRows.length > 0 && (
              <>
                <table className="forecast-band-table">
                  <caption>Largest reported source-band peak by forecast interval (µg/m³)</caption>
                  <thead><tr><th scope="col">Interval</th><th scope="col">ΔPM2.5 µg/m³</th></tr></thead>
                  <tbody>{bandRows.map(row => (
                    <tr key={`${row.from}-${row.to}`}><th scope="row">{row.from}–{row.to}h</th><td>+{row.peak}</td></tr>
                  ))}</tbody>
                </table>
                <p className="forecast-data-note">Maximum across reported source bands in each interval; not a receptor concentration or additive exposure.</p>
                <p className="forecast-data-note">Model capture: <time dateTime={model!.generated_at}>{model!.generated_at}</time>.</p>
                <p className="forecast-data-note">{model!.forecast_start
                  ? <>Forecast start: <time dateTime={model!.forecast_start}>{model!.forecast_start}</time>; intervals are forecast-relative.</>
                  : 'Forecast start unavailable; intervals are forecast-relative.'}</p>
              </>
            )}
            <p className="forecast-data-note">Trajectory unavailable: band peaks are not a receptor time series. Mixing-height and inversion diagnostics unavailable in this panel.</p>
            <div className="horizon-sync-strip" role="group" aria-label="Plume band horizon">
              <span className="horizon-strip-label">Map horizon:</span>
              {[
                { h: 0 as TimeHorizon, txt: '0–2h' }, { h: 2 as TimeHorizon, txt: '2–4h' },
                { h: 4 as TimeHorizon, txt: '4–8h' }, { h: 8 as TimeHorizon, txt: '8–24h' },
              ].map(item => (
                <button key={item.txt} type="button" className={`horizon-pill-btn ${timeHorizon === item.h ? 'active' : ''}`} aria-pressed={timeHorizon === item.h} onClick={() => setTimeHorizon(item.h)} title={`Focus map on ${item.txt} forecast band`}>
                  {item.txt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="forecast-stations-body">
          <p className="forecast-data-note" role="status" aria-label="Station data status">
            {loading && 'Loading station data… '}{stationStatus}
            {parsedAqi?.success && (aqiFreshness.status === 'unknown' ? ' Station capture age unknown.' : aqiFreshness.stale ? ' Stale station capture.' : '')}
            {feedErrors.aqi && ` AQI feed unavailable: ${feedErrors.aqi}.${stations.length ? ' Retained observations shown.' : ''}`}
          </p>
          <div className="station-bar-wrap">
            <div className="station-bar-header"><span className="text-xs font-semibold text-secondary">Reported Station AQI Distribution ({stationStats.count} stations)</span></div>
            <div className="station-stacked-meter" aria-label="AQI Category Distribution">
              {stationStats.shares.severe > 0 && <div className="meter-seg seg-severe" style={{ width: `${stationStats.shares.severe}%` }} title={`Severe (>400): ${stationStats.severe} stations`} />}
              {stationStats.shares.veryPoor > 0 && <div className="meter-seg seg-verypoor" style={{ width: `${stationStats.shares.veryPoor}%` }} title={`Very Poor (301-400): ${stationStats.veryPoor} stations`} />}
              {stationStats.shares.poor > 0 && <div className="meter-seg seg-poor" style={{ width: `${stationStats.shares.poor}%` }} title={`Poor (201-300): ${stationStats.poor} stations`} />}
              {stationStats.shares.moderate > 0 && <div className="meter-seg seg-moderate" style={{ width: `${stationStats.shares.moderate}%` }} title={`Moderate (101-200): ${stationStats.moderate} stations`} />}
              {stationStats.shares.satisfactory > 0 && <div className="meter-seg seg-satisfactory" style={{ width: `${stationStats.shares.satisfactory}%` }} title={`≤100: ${stationStats.satisfactory} stations`} />}
            </div>
            <div className="meter-legend-row">
              <span className="m-leg"><span className="c-dot satisfactory" /> ≤100: {stationStats.satisfactory}</span>
              <span className="m-leg"><span className="c-dot moderate" /> 101–200: {stationStats.moderate}</span>
              <span className="m-leg"><span className="c-dot poor" /> 201–300: {stationStats.poor}</span>
              <span className="m-leg"><span className="c-dot verypoor" /> &gt;300: {stationStats.veryPoor + stationStats.severe}</span>
            </div>
          </div>
          <div className="top-stations-list">
            {stationStats.topStations.map(stn => {
              const stnTier = getAqiTier(stn.aqi ?? null)
              const age = getFeedFreshness('aqi', stn.observed_at, now)
              return (
                <div key={stn.id} className="top-station-item">
                  <div className="stn-info">
                    <span className="stn-name" title={stn.name}>{stn.name}</span>
                    <span className="stn-pm25">{stn.pm25 != null ? `${stn.pm25.toFixed(1)} µg/m³` : 'PM2.5 unavailable'}</span>
                    <span className="stn-observation">{age.status === 'unknown' ? 'Observation age unknown' : age.stale ? 'Stale observation' : 'Observation'}{stn.observed_at && <>: <time dateTime={stn.observed_at}>{stn.observed_at}</time></>}</span>
                  </div>
                  <span className="stn-aqi-chip" style={{ color: stnTier.color, background: stnTier.bg }}>{stn.aqi} AQI</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="aqi-contract-disclaimer">
        <p className="panel-sub"><strong>Unavailable.</strong> A validated AQI forecasting contract is not provided.</p>
        <p className="panel-sub">Observed station average: {observedAverage == null ? 'unavailable' : `${observedAverage} AQI`}.</p>
        <p className="panel-sub">{stationStatus}{parsedAqi?.success && aqiFreshness.stale && ' Station capture stale or age unknown.'}</p>
        <p className="panel-sub">Plume ΔPM2.5 is modelled and uncalibrated. It cannot be converted to regional AQI with a fixed multiplier.</p>
      </div>
    </section>
  )
}
