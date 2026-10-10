import { useId } from 'react'
import { cellsInBounds, PM25_SCALE, pm25Color, type ObservationHeatmap } from './heatmap'
import './HeatmapControls.css'

interface Props {
  data: ObservationHeatmap
  enabled: boolean
  onToggle: (enabled: boolean) => void
  opacity: number
  onOpacity: (opacity: number) => void
  onFit?: () => void
  loading?: boolean
  error?: string
  bounds?: [number, number, number, number] | null
}

export default function HeatmapControls({ data, enabled, onToggle, opacity, onOpacity, onFit, loading, error, bounds = null }: Props) {
  const id = useId()
  const visible = cellsInBounds(data, bounds)
  return <section className="heatmap-controls" aria-label="Observed PM2.5 heatmap controls">
    <div className="heatmap-control-row">
      <label><input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} /> Observed PM2.5 heatmap</label>
      {enabled && <button type="button" className="btn-ghost" onClick={onFit} disabled={!onFit || !data.samples}>Fit observed cells</button>}
      {enabled && <label htmlFor={`${id}-opacity`}>Heatmap opacity <input aria-label="Heatmap opacity" id={`${id}-opacity`} type="range" min="0.2" max="1" step="0.1" value={opacity} onChange={e => onOpacity(Number(e.target.value))} /><output aria-label="Selected heatmap opacity">{Math.round(opacity * 100)}%</output></label>}
    </div>
    {enabled && <div className="heatmap-description">
      <strong>Observed station PM2.5 · station mean (µg/m³)</strong>
      <p>Occupied 0.1° cells only: arithmetic mean of available station readings, possibly at different times. No interpolation; unsampled areas are unavailable. This is not personal exposure or an area concentration estimate. Averaging interval unavailable.</p>
      <div className="heatmap-scale" aria-label="PM2.5 station mean legend, micrograms per cubic metre">
        {PM25_SCALE.map(band => <span key={band.label}><i aria-hidden="true" style={{ background: band.color }} />{band.label} µg/m³</span>)}
      </div>
      <p role="status" aria-label="Observation data status">{loading ? 'Loading observations…' : data.samples ? `${data.samples} station readings · ${visible.length} of ${data.geojson.features.length} occupied cells in view · ${data.staleCount} stale (>90 min).` : 'No valid geolocated PM2.5 observations available.'}
        {error && ` AQI feed unavailable: ${error}${data.samples ? ' Retained observations shown.' : ''}`}
        {data.rejected > 0 && ` ${data.rejected} readings excluded (missing/invalid value, time, source, or coordinates).`}
        {data.duplicates > 0 && ` ${data.duplicates} duplicate station IDs excluded; newest valid observation retained (first record on equal times).`}
      </p>
      {data.oldest && <p>Observation times (UTC): <time dateTime={data.oldest}>{data.oldest}</time> to <time dateTime={data.newest!}>{data.newest}</time>. Source: {data.sources.join(', ')}. Capture time is not observation time.</p>}
      {visible.length > 0 && <details><summary>Accessible cell values ({visible.length} in view)</summary>
        <div className="heatmap-values"><table><caption>Reported station means in occupied cells</caption><thead><tr><th scope="col">Cell (lon/lat indices)</th><th scope="col">Mean µg/m³</th><th scope="col">Stations</th><th scope="col">Observation range (UTC)</th></tr></thead><tbody>
          {visible.map(cell => <tr key={cell.properties.id}><th scope="row"><i aria-hidden="true" style={{ background: pm25Color(cell.properties.mean) }} />{cell.properties.id}</th><td>{cell.properties.mean.toFixed(1)}</td><td>{cell.properties.count}</td><td>{cell.properties.oldest} – {cell.properties.newest}</td></tr>)}
        </tbody></table></div>
      </details>}
    </div>}
  </section>
}
