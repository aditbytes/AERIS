import type { FeatureCollection, Polygon } from 'geojson'
import { TimestampSchema, type AqiFile } from '../../types/schemas'

// This is a sample aggregation grid, not a concentration field or interpolation.
export const HEATMAP_CELL_DEGREES = 0.1
export const OBSERVATION_STALE_MS = 90 * 60 * 1000
export const PM25_SCALE = [
  { max: 10, label: '0–10', color: '#440154' },
  { max: 25, label: '>10–25', color: '#414487' },
  { max: 50, label: '>25–50', color: '#2a788e' },
  { max: 100, label: '>50–100', color: '#22a884' },
  { max: 200, label: '>100–200', color: '#7ad151' },
  { max: Infinity, label: '>200', color: '#fde725' },
] as const

export function pm25Color(value: number): string {
  return PM25_SCALE.find(band => value <= band.max)!.color
}

export function validCoordinate(lon: unknown, lat: unknown): boolean {
  return typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180
    && typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
}

export interface HeatmapCell {
  id: string
  mean: number
  count: number
  oldest: string
  newest: string
  staleCount: number
  sources: string[]
  stationNames: string[]
}

export interface ObservationHeatmap {
  geojson: FeatureCollection<Polygon, HeatmapCell>
  samples: number
  rejected: number
  duplicates: number
  staleCount: number
  oldest: string | null
  newest: string | null
  sources: string[]
}

export function buildObservationHeatmap(aqi: AqiFile | null, now: number): ObservationHeatmap {
  const cells = new Map<string, { x: number; y: number; mean: number; count: number; oldest: number; newest: number; stale: number; names: string[]; sources: Set<string> }>()
  const result: ObservationHeatmap = {
    geojson: { type: 'FeatureCollection', features: [] }, samples: 0,
    rejected: 0, duplicates: 0, staleCount: 0, oldest: null, newest: null, sources: [],
  }
  const selected = new Map<string, { station: AqiFile['stations'][number]; time: number }>()
  const sources = new Set<string>()
  let oldest = Infinity, newest = -Infinity
  for (const station of aqi?.stations ?? []) {
    const time = station.observed_at ? Date.parse(station.observed_at) : NaN
    if (!validCoordinate(station.lon, station.lat) || typeof station.pm25 !== 'number'
      || !Number.isFinite(station.pm25) || station.pm25 < 0 || !Number.isFinite(time)
      || !TimestampSchema.safeParse(station.observed_at).success
      || time > now + 5 * 60 * 1000 || !station.source?.trim()) {
      result.rejected++
      continue
    }
    // One reported sample per station ID; retain the newest valid observation.
    // Equal-time duplicates retain the first record, without averaging twice.
    const previous = selected.get(station.id)
    if (previous) result.duplicates++
    if (!previous || time > previous.time) selected.set(station.id, { station, time })
  }
  for (const { station, time } of selected.values()) {
    const x = Math.min(1799, Math.floor(station.lon * 10))
    const y = Math.min(899, Math.floor(station.lat * 10))
    const key = `${x}:${y}`
    const cell = cells.get(key) ?? { x, y, mean: 0, count: 0, oldest: Infinity, newest: -Infinity, stale: 0, names: [], sources: new Set<string>() }
    const stale = now - time > OBSERVATION_STALE_MS
    cell.count++
    // Values are nonnegative: this incremental mean avoids overflow of a finite sum.
    cell.mean += (station.pm25! - cell.mean) / cell.count
    cell.oldest = Math.min(cell.oldest, time)
    cell.newest = Math.max(cell.newest, time)
    cell.names.push(station.name)
    cell.sources.add(station.source)
    if (stale) { cell.stale++; result.staleCount++ }
    cells.set(key, cell)
    sources.add(station.source)
    oldest = Math.min(oldest, time)
    newest = Math.max(newest, time)
    result.samples++
  }
  for (const [id, cell] of cells) {
    const west = cell.x / 10, south = cell.y / 10
    const east = (cell.x + 1) / 10, north = (cell.y + 1) / 10
    result.geojson.features.push({
      type: 'Feature', id,
      geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
      properties: {
        id, mean: cell.mean,
        count: cell.count, oldest: new Date(cell.oldest).toISOString(),
        newest: new Date(cell.newest).toISOString(), staleCount: cell.stale,
        sources: [...cell.sources], stationNames: cell.names,
      },
    })
  }
  result.oldest = result.samples ? new Date(oldest).toISOString() : null
  result.newest = result.samples ? new Date(newest).toISOString() : null
  result.sources = [...sources]
  return result
}

export function cellsInBounds(data: ObservationHeatmap, bounds: [number, number, number, number] | null) {
  if (!bounds) return data.geojson.features
  const [west, south, east, north] = bounds
  return data.geojson.features.filter(cell => {
    const ring = cell.geometry.coordinates[0]
    return ring[0][0] <= east && ring[1][0] >= west && ring[0][1] <= north && ring[2][1] >= south
  })
}

export function observationBounds(data: ObservationHeatmap): [number, number, number, number] | null {
  if (!data.geojson.features.length) return null
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const feature of data.geojson.features) {
    const ring = feature.geometry.coordinates[0]
    west = Math.min(west, ring[0][0]); south = Math.min(south, ring[0][1])
    east = Math.max(east, ring[2][0]); north = Math.max(north, ring[2][1])
  }
  return [west, south, east, north]
}
