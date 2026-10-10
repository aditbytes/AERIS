import type { FeatureCollection, Point } from 'geojson'
import type { CorridorGeoJSON } from '../../types/schemas'

export function corridorAtHorizon(corridor: CorridorGeoJSON | null, horizon: number) {
  return { type: 'FeatureCollection' as const, features: (corridor?.features ?? []).filter(f => f.properties.kind === 'centerline' || f.properties.hour_from <= horizon) }
}

export function etaMilestones(corridor: CorridorGeoJSON | null): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: (corridor?.features ?? []).flatMap(f => {
    if (f.properties.kind !== 'centerline' || f.geometry.type !== 'LineString') return []
    const coordinates = f.geometry.coordinates
    return f.properties.points_eta_hours.flatMap((eta, index) => [2, 4, 8, 12, 18, 24].includes(eta) && coordinates[index] ? [{
      type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: coordinates[index] },
      properties: { eta, label: `${f.properties.source_id} +${eta}h` },
    }] : [])
  }) }
}
