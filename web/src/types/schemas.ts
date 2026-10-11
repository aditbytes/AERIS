/**
 * Runtime validators for real AERIS captures and explicitly modelled outputs.
 * Units and scientific limits are documented in docs/data-contracts.md.
 */
import { z } from 'zod'

// A timestamp must identify an actual instant, never the host's local timezone.
export const TimestampSchema = z.iso.datetime({ offset: true })
const LatitudeSchema = z.number().finite().min(-90).max(90)
const LongitudeSchema = z.number().finite().min(-180).max(180)
const NonnegativeSchema = z.number().finite().nonnegative()
const NameSchema = z.string().refine(value => value.trim().length > 0, 'Must not be blank')

export const ModelProvenanceSchema = z.object({
  schema_version: z.literal(1),
  artifact_kind: z.enum(['sources', 'corridor']),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  artifact_status: z.enum(['ARCHIVED_LEGACY', 'UNVERSIONED_UNKNOWN', 'MODELLED_WITH_COMPANION_PROVENANCE']),
  operational_validation: z.literal('NOT_ESTABLISHED'),
  generated_at: TimestampSchema,
  forecast_start: TimestampSchema.nullish(),
  wind_generated_at: TimestampSchema.nullish(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  semantics: z.record(z.string(), z.unknown()).optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  limitations: z.array(z.string()).optional(),
}).passthrough()
export type ModelProvenance = z.infer<typeof ModelProvenanceSchema>

export const SourceSchema = z.object({
  id: NameSchema,
  type: NameSchema,
  lat: LatitudeSchema,
  lon: LongitudeSchema,
  fire_count: z.number().int().positive(),
  total_frp_mw: NonnegativeSchema,
  radius_km: NonnegativeSchema,
  first_seen: TimestampSchema,
  last_seen: TimestampSchema,
  confidence: z.number().min(0).max(1),
  emission_strength: z.number().min(0).max(1),
  territory: z.enum(['india', 'transboundary']).optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  location_name: z.string().optional(),
  airshed_role: z.string().optional(),
})
export const SourcesFileSchema = z.object({
  generated_at: TimestampSchema,
  sources: z.array(SourceSchema),
  provenance: ModelProvenanceSchema.optional(),
})
export type Source = z.infer<typeof SourceSchema>
export type SourcesFile = z.infer<typeof SourcesFileSchema>

export const CorridorBandPropertiesSchema = z.object({
  kind: z.literal('band'),
  source_id: NameSchema,
  hour_from: NonnegativeSchema,
  hour_to: NonnegativeSchema,
  risk: z.number().min(0).max(1),
  pm25_delta_ugm3: NonnegativeSchema,
}).refine(band => band.hour_from < band.hour_to, 'Band start must precede its end')
export const CorridorCenterlinePropertiesSchema = z.object({
  kind: z.literal('centerline'),
  source_id: NameSchema,
  points_eta_hours: z.array(NonnegativeSchema),
})

const PositionSchema = z.tuple([LongitudeSchema, LatitudeSchema]).rest(z.number().finite())
const RingSchema = z.array(PositionSchema).min(4).refine(ring => (
  JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1])
), 'Polygon rings must be closed')
const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(RingSchema).min(1),
})
const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(PositionSchema).min(2),
})
const CorridorBandFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: PolygonSchema,
  properties: CorridorBandPropertiesSchema,
})
const CorridorCenterlineFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: LineStringSchema,
  properties: CorridorCenterlinePropertiesSchema,
}).refine(feature => (
  feature.properties.points_eta_hours.length === feature.geometry.coordinates.length
), 'Centreline frame times must match coordinates')
export const CorridorFeatureSchema = z.union([
  CorridorBandFeatureSchema, CorridorCenterlineFeatureSchema,
])
export const CorridorGeoJSONSchema = z.object({
  provenance: ModelProvenanceSchema.optional(),
  type: z.literal('FeatureCollection'),
  generated_at: TimestampSchema,
  forecast_start: TimestampSchema.optional(),
  wind_generated_at: TimestampSchema.optional(),
  features: z.array(CorridorFeatureSchema),
}).passthrough()
export type CorridorBandProperties = z.infer<typeof CorridorBandPropertiesSchema>
export type CorridorCenterlineProperties = z.infer<typeof CorridorCenterlinePropertiesSchema>
export type CorridorGeoJSON = z.infer<typeof CorridorGeoJSONSchema>

export const RankedSiteSchema = z.object({
  rank: z.number().int().positive(),
  site_id: NameSchema,
  name: z.string(),
  type: z.enum(['school', 'hospital']),
  lat: LatitudeSchema,
  lon: LongitudeSchema,
  occupancy: NonnegativeSchema.nullable(),
  eta_hours: NonnegativeSchema,
  pm25_delta_ugm3: NonnegativeSchema,
  risk_score: z.number().min(0).max(1),
  source_id: NameSchema,
})
export const RankedSitesFileSchema = z.object({
  model_context: z.record(z.string(), z.unknown()).optional(),
  generated_at: TimestampSchema,
  exposed_population: z.object({
    estimate: NonnegativeSchema.int(),
    low: NonnegativeSchema.int(),
    high: NonnegativeSchema.int(),
    method: z.string().optional(),
    data_available: z.boolean().optional(),
  }),
  sites: z.array(RankedSiteSchema),
})
export type RankedSite = z.infer<typeof RankedSiteSchema>
export type RankedSitesFile = z.infer<typeof RankedSitesFileSchema>

export const SiteActionSchema = z.object({
  priority: z.number().int(),
  site_id: NameSchema,
  who: NameSchema,
  action: NameSchema,
  reason: NameSchema,
  deadline_hours: NonnegativeSchema,
})
export const AuthorityActionSchema = z.object({
  who: NameSchema,
  action: NameSchema,
  reason: NameSchema,
})
export const ActionsFileSchema = z.object({
  advisory_only: z.boolean().optional(),
  model_context: z.record(z.string(), z.unknown()).optional(),
  generated_at: TimestampSchema,
  summary: NameSchema,
  summary_hi: z.string().optional(),
  actions: z.array(SiteActionSchema),
  authority_actions: z.array(AuthorityActionSchema),
  generator: z.string().optional(),
})
export type SiteAction = z.infer<typeof SiteActionSchema>
export type AuthorityAction = z.infer<typeof AuthorityActionSchema>
export type ActionsFile = z.infer<typeof ActionsFileSchema>

export const AqiStationSchema = z.object({
  aqi_method: z.enum(['PROVIDER_REPORTED', 'PM25_SUBINDEX_AVERAGING_PERIOD_UNVERIFIED', 'UNAVAILABLE']).optional(),
  source_timestamp: z.string().nullable().optional(),
  timestamp_status: z.enum(['SOURCE_TIMEZONE_KNOWN', 'UNAVAILABLE_OR_AMBIGUOUS']).optional(),
  id: NameSchema,
  name: z.string(),
  lat: LatitudeSchema,
  lon: LongitudeSchema,
  pm25: NonnegativeSchema.nullable().optional(),
  pm10: NonnegativeSchema.nullable().optional(),
  aqi: NonnegativeSchema.nullable().optional(),
  aqi_category: z.string().nullable().optional(),
  observed_at: TimestampSchema.nullable().optional(),
  source: NameSchema,
})
export const AqiFileSchema = z.object({
  source: NameSchema.optional(),
  sources_failed: z.array(NameSchema).optional(),
  fetch_status: z.enum(['COMPLETE', 'PARTIAL', 'FAILED', 'UNAVAILABLE', 'UNKNOWN']).optional(),
  source_fetch_status: z.record(NameSchema, z.enum(['SUCCESS', 'PARTIAL_FAILURE', 'FAILED', 'NOT_CONFIGURED', 'UNKNOWN'])).refine(value => Object.keys(value).length > 0).optional(),
  data_status: z.enum(['READINGS_AVAILABLE', 'UNAVAILABLE_OR_EMPTY']).optional(),
  coverage_complete: z.boolean().nullable().optional(),
  sources_with_readings: z.array(NameSchema).optional(),
  generated_at: TimestampSchema,
  stations: z.array(AqiStationSchema),
}).superRefine((file, ctx) => {
  const statuses = Object.values(file.source_fetch_status ?? {})
  if (file.fetch_status === 'COMPLETE' && (file.sources_failed?.length || statuses.some(value => value !== 'SUCCESS'))) {
    ctx.addIssue({ code: 'custom', message: 'Complete fetch contradicts source status', path: ['fetch_status'] })
  }
  if (file.coverage_complete === true && (
    file.sources_failed?.length || ['PARTIAL', 'FAILED', 'UNAVAILABLE'].includes(file.fetch_status ?? '') ||
    statuses.some(value => ['PARTIAL_FAILURE', 'FAILED', 'NOT_CONFIGURED'].includes(value))
  )) {
    ctx.addIssue({ code: 'custom', message: 'Complete coverage contradicts known fetch gaps', path: ['coverage_complete'] })
  }
  const hasReadings = file.stations.some(station => [station.pm25, station.pm10, station.aqi].some(value => value != null))
  if (file.data_status && file.data_status !== (hasReadings ? 'READINGS_AVAILABLE' : 'UNAVAILABLE_OR_EMPTY')) {
    ctx.addIssue({ code: 'custom', message: 'Data status contradicts available readings', path: ['data_status'] })
  }
  if (hasReadings && ['FAILED', 'UNAVAILABLE'].includes(file.fetch_status ?? '')) {
    ctx.addIssue({ code: 'custom', message: 'Failed/unavailable fetch contradicts available readings', path: ['fetch_status'] })
  }
})
export type AqiStation = z.infer<typeof AqiStationSchema>
export type AqiFile = z.infer<typeof AqiFileSchema>

export const WindHourSchema = z.object({
  t: TimestampSchema,
  u_ms: z.number().finite(),
  v_ms: z.number().finite(),
  speed_ms: NonnegativeSchema,
  dir_from_deg: z.number().finite().min(0).max(360),
  pblh_m: NonnegativeSchema.nullable(),
})
export const WindPointSchema = z.object({
  lat: LatitudeSchema,
  lon: LongitudeSchema,
  hours: z.array(WindHourSchema).refine(hours => hours.every((hour, index) => (
    index === 0 || Date.parse(hour.t) > Date.parse(hours[index - 1].t)
  )), 'Wind timestamps must be unique and increasing'),
})
export const WindFileSchema = z.object({
  usable_hourly_coverage_complete: z.boolean().optional(),
  generated_at: TimestampSchema,
  source: NameSchema,
  points: z.array(WindPointSchema),
  // Existing ingest metadata: successful batches do not prove plume coverage.
  coverage_complete: z.boolean().optional(),
})
export type WindHour = z.infer<typeof WindHourSchema>
export type WindPoint = z.infer<typeof WindPointSchema>
export type WindFile = z.infer<typeof WindFileSchema>

export type RiskLevel = 'very-high' | 'high' | 'medium' | 'low'
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 0.85) return 'very-high'
  if (score >= 0.65) return 'high'
  if (score >= 0.40) return 'medium'
  return 'low'
}
export function riskBadgeClass(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    'very-high': 'badge badge-vh',
    'high': 'badge badge-h',
    'medium': 'badge badge-m',
    'low': 'badge badge-l',
  }
  return map[level]
}
export function riskLabel(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    'very-high': 'Very High',
    'high': 'High',
    'medium': 'Medium',
    'low': 'Low',
  }
  return map[level]
}
