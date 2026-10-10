import { useMemo } from 'react'
import type { RankedSitesFile, SourcesFile, CorridorGeoJSON } from '../../types/schemas'
import { corridorAtHorizon } from './mapData'
import { pm25Color, validCoordinate, type ObservationHeatmap } from './heatmap'

interface Props {
  sources: SourcesFile | null
  rankedSites: RankedSitesFile | null
  scopeFilter: 'all' | 'india' | 'transboundary'
  corridor?: CorridorGeoJSON | null
  horizon?: number
  heatmap?: ObservationHeatmap
  heatmapEnabled?: boolean
  opacity?: number
}

export function projectPosition(position: number[], bounds: number[]): [number, number] | null {
  if (!validCoordinate(position[0], position[1])) return null
  const [west, south, east, north] = bounds
  return [20 + (position[0] - west) / (east - west) * 640, 360 - (position[1] - south) / (north - south) * 340]
}

export default function SvgFallbackMap({ sources, rankedSites, scopeFilter, corridor = null, horizon = 24, heatmap, heatmapEnabled = false, opacity = 0.7 }: Props) {
  const sourcePoints = (sources?.sources ?? []).filter(s => validCoordinate(s.lon, s.lat) && (scopeFilter === 'all' || s.territory === scopeFilter))
  const validSites = (rankedSites?.sites ?? []).filter(s => validCoordinate(s.lon, s.lat))
  const sites = validSites.slice(0, 12)
  const features = useMemo(() => corridorAtHorizon(corridor, horizon).features, [corridor, horizon])
  const cells = heatmapEnabled ? heatmap?.geojson.features ?? [] : []
  const points = [...sourcePoints, ...sites].map(p => [p.lon, p.lat])
  for (const f of features) {
    if (f.geometry.type === 'Polygon') points.push(...f.geometry.coordinates.flat())
    if (f.geometry.type === 'LineString') points.push(...f.geometry.coordinates)
  }
  for (const cell of cells) points.push(...cell.geometry.coordinates[0])
  const valid = points.filter(p => validCoordinate(p[0], p[1]))
  const bounds = valid.length ? [Infinity, Infinity, -Infinity, -Infinity] : [58, 5, 100, 39]
  for (const [lon, lat] of valid) {
    bounds[0] = Math.min(bounds[0], lon - 0.1); bounds[1] = Math.min(bounds[1], lat - 0.1)
    bounds[2] = Math.max(bounds[2], lon + 0.1); bounds[3] = Math.max(bounds[3], lat + 0.1)
  }
  const path = (rings: number[][][]) => rings.map(ring => ring.map((p, i) => {
    const xy = projectPosition(p, bounds)
    return xy ? `${i === 0 ? 'M' : 'L'}${xy[0]},${xy[1]}` : ''
  }).join(' ') + ' Z').join(' ')
  return <div className="map-fallback-canvas">
    <p className="static-map-note" role="status">WebGL unavailable: static WGS84 overview of feed geometry. Pan, zoom, and basemap controls unavailable.</p>
    {validSites.length > sites.length && <p className="static-map-note">Showing the first {sites.length} of {validSites.length} ranked facilities. The facility table contains the full list.</p>}
    <svg viewBox="0 0 680 380" className="svg-map" role="img" aria-label="Static map of actual source candidates, modelled corridor geometry, and reported station cells">
      <title>Actual feed geometry; no invented plume or boundary</title>
      <rect width="680" height="380" fill="#edf1ec" />
      <text x="24" y="20" fill="#374151" fontSize="11">Longitude / latitude (WGS84) · north up</text>
      {features.map((f, i) => f.geometry.type === 'Polygon' ? <path key={i} data-kind="band" d={path(f.geometry.coordinates)} fill="#dc2626" opacity="0.3" fillRule="evenodd"><title>Modelled corridor for {f.properties.source_id} · uncalibrated band peak, not observed concentration</title></path> : <polyline key={i} points={f.geometry.coordinates.map(p => projectPosition(p, bounds)?.join(',')).join(' ')} fill="none" stroke="#991b1b" strokeWidth="1.5"><title>Modelled centreline for {f.properties.source_id}</title></polyline>)}
      {cells.map(cell => <path key={cell.properties.id} d={path(cell.geometry.coordinates)} fill={pm25Color(cell.properties.mean)} opacity={opacity} stroke="#fff" strokeWidth="0.5"><title>{cell.properties.mean.toFixed(1)} µg/m³ station mean · {cell.properties.count} readings · {cell.properties.oldest} to {cell.properties.newest}</title></path>)}
      {sourcePoints.map(src => {
        const [x, y] = projectPosition([src.lon, src.lat], bounds)!
        return <g key={src.id} transform={`translate(${x}, ${y})`}><circle r="4" fill="#dc2626" /><title>{src.id}: source candidate · {src.total_frp_mw.toFixed(1)} MW FRP</title><text x="6" y="3" fontSize="9" fill="#374151">{src.id}</text></g>
      })}
      {sites.map(site => {
        const [x, y] = projectPosition([site.lon, site.lat], bounds)!
        return <g key={site.site_id} transform={`translate(${x}, ${y})`}><circle r="3" fill="#164e35" /><title>{site.name}: {site.type}, uncalibrated model ranking</title></g>
      })}
      {!valid.length && <text x="24" y="70" fill="#374151">No valid geospatial data available.</text>}
    </svg>
  </div>
}
