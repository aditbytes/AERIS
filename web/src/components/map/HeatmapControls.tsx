import { useId } from 'react'
import { Focus, Info } from 'lucide-react'
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

  return (
    <section className="heatmap-controls" aria-label="Observed PM2.5 heatmap controls">
      <div className="heatmap-control-row">
        <div className="heatmap-toggle-group">
          <label className="heatmap-checkbox-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => onToggle(e.target.checked)}
            />
            <span className="heatmap-toggle-title">Observed PM2.5 heatmap</span>
          </label>
          {enabled && (
            <span className="heatmap-unit-badge">
              Observed station PM2.5 · station mean (µg/m³)
            </span>
          )}
        </div>

        {enabled && (
          <div className="heatmap-actions-group">
            {/* Inline Compact 6-Band Color Ramp */}
            <div className="heatmap-scale" tabIndex={0} role="region" aria-label="PM2.5 station mean legend, micrograms per cubic metre">
              {PM25_SCALE.map(band => (
                <span key={band.label} className="scale-item">
                  <i aria-hidden="true" style={{ background: band.color }} />
                  <span className="scale-text">{band.label} µg/m³</span>
                </span>
              ))}
            </div>

            <div className="heatmap-actions-divider" />

            <button
              type="button"
              className="heatmap-fit-btn"
              onClick={onFit}
              disabled={!onFit || !data.samples}
              title="Fit map view to observed station cells"
            >
              <Focus size={11} />
              <span>Fit observed cells</span>
            </button>

            <div className="heatmap-opacity-group">
              <label htmlFor={`${id}-opacity`} className="opacity-label">Heatmap opacity</label>
              <input
                aria-label="Heatmap opacity"
                id={`${id}-opacity`}
                type="range"
                min="0.2"
                max="1"
                step="0.1"
                value={opacity}
                onChange={e => onOpacity(Number(e.target.value))}
                className="opacity-slider"
              />
              <output aria-label="Selected heatmap opacity" className="opacity-value">
                {Math.round(opacity * 100)}%
              </output>
            </div>
          </div>
        )}
      </div>

      {enabled && (
        <div className="heatmap-description">
          {/* Status strip */}
          <div className="heatmap-status-strip" role="status" aria-label="Observation data status">
            <span className="status-indicator-dot" />
            <span className="status-text">
              {loading
                ? 'Loading observations…'
                : data.samples
                  ? `${data.samples} station readings · ${visible.length} of ${data.geojson.features.length} occupied cells in view · ${data.staleCount} stale (>90 min).`
                  : 'No valid geolocated PM2.5 observations available.'}
              {error && ` AQI feed unavailable: ${error}${data.samples ? ' Retained observations shown.' : ''}`}
              {data.rejected > 0 && ` ${data.rejected} readings excluded (missing/invalid value, time, source, or coordinates).`}
              {data.duplicates > 0 && ` ${data.duplicates} duplicate station IDs excluded; newest valid observation retained (first record on equal times).`}
            </span>
          </div>

          {/* Collapsible Scientific Methodology & Times Details */}
          <details className="heatmap-methodology-details">
            <summary className="heatmap-summary">
              <Info size={11} />
              <span>Methodology & Observation Provenance (OpenAQ · 0.1° cells · No interpolation)</span>
            </summary>
            <div className="heatmap-methodology-content">
              <p>Occupied 0.1° cells only: arithmetic mean of available station readings, possibly at different times. No interpolation; unsampled areas are unavailable. This is not personal exposure or an area concentration estimate. Averaging interval unavailable.</p>
              {data.oldest && (
                <p>Observation times (UTC): <time dateTime={data.oldest}>{data.oldest}</time> to <time dateTime={data.newest!}>{data.newest}</time>. Source: {data.sources.join(', ')}. Capture time is not observation time.</p>
              )}
            </div>
          </details>

          {/* Accessible Table */}
          {visible.length > 0 && (
            <details className="heatmap-table-details">
              <summary className="heatmap-summary">Accessible cell values ({visible.length} in view)</summary>
              <div className="heatmap-values" tabIndex={0} role="region" aria-label="Observed cell values; scroll with arrow keys">
                <table>
                  <caption>Reported station means in occupied cells</caption>
                  <thead>
                    <tr>
                      <th scope="col">Cell (lon/lat indices)</th>
                      <th scope="col">Mean µg/m³</th>
                      <th scope="col">Stations</th>
                      <th scope="col">Observation range (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(cell => (
                      <tr key={cell.properties.id}>
                        <th scope="row">
                          <i aria-hidden="true" style={{ background: pm25Color(cell.properties.mean) }} />
                          {cell.properties.id}
                        </th>
                        <td>{cell.properties.mean.toFixed(1)}</td>
                        <td>{cell.properties.count}</td>
                        <td>{cell.properties.oldest} – {cell.properties.newest}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

