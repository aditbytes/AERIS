import { useAeris } from '@/services/dataContext'
import './ModelProvenanceNotice.css'

export default function ModelProvenanceNotice() {
  const { sources, corridor } = useAeris()
  if (!sources && !corridor) return null
  const legacySources = sources?.provenance?.artifact_status === 'ARCHIVED_LEGACY'
  const legacyCorridor = corridor?.provenance?.artifact_status === 'ARCHIVED_LEGACY'
  return <aside className="model-provenance-notice" aria-label="Model provenance and scientific limitations">
    <strong>Model evidence and limitations</strong>
    <p>{legacySources ? 'Archived ten-source detector output; this is not the current detector replay. Original input and parameter bindings were not recorded.' : 'Candidate source types, confidence and emission strength are heuristic proxies, not verified land use, probabilities or measured emission mass.'}</p>
    <p>{legacyCorridor ? 'Archived legacy corridor: obsolete concentration and risk floors. These simulation values are not current Gaussian model output, observed PM2.5 or calibrated forecasts.' : 'Corridor PM2.5 is a source-band grid/time peak, not receptor concentration. Parameters are uncalibrated unless independent calibration evidence is provided; risk is not health probability.'}</p>
    <p>Arrival times are relative to forecast start. Population is a spatial proxy. Saved recommendations require human review against current observations; they are not operational, medical or legal instructions. The observed PM2.5 layer shows station readings without interpolation.</p>
    <details><summary>Inspect source and corridor provenance</summary>
      {([['sources', sources], ['corridor', corridor]] as const).map(([kind, data]) => <section key={kind}>
        <h2>{kind}: {data?.provenance?.artifact_status ?? 'Provenance unavailable'}</h2>
        <pre tabIndex={0} aria-label={`${kind} provenance details`}>{JSON.stringify(data?.provenance ?? { artifact_status: 'UNVERSIONED_UNKNOWN', generated_at: data?.generated_at ?? null }, null, 2)}</pre>
      </section>)}
    </details>
  </aside>
}
