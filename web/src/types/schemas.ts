/**
 * AERIS Data Contract Schemas
 * Zod validators mirroring docs/data-contracts.md exactly.
 * These validate real snapshot data from data/live/ and reject any invented values.
 */

import { z } from 'zod'

// ─── sources.json (Pritam) ───────────────────────────────────────────────────
export const SourceSchema = z.object({
  id:                z.string(),
  type:              z.string(),
  lat:               z.number(),
  lon:               z.number(),
  fire_count:        z.number(),
  total_frp_mw:      z.number(),
  radius_km:         z.number(),
  first_seen:        z.string(),
  last_seen:         z.string(),
  confidence:        z.number().min(0).max(1),
  emission_strength: z.number().min(0).max(1),
  territory:         z.enum(['india', 'transboundary']).optional(),
  district:          z.string().optional(),
  state:             z.string().optional(),
  country:           z.string().optional(),
  location_name:     z.string().optional(),
  airshed_role:      z.string().optional(),
})

export const SourcesFileSchema = z.object({
  generated_at: z.string(),
  sources:      z.array(SourceSchema),
})

export type Source      = z.infer<typeof SourceSchema>
export type SourcesFile = z.infer<typeof SourcesFileSchema>

// ─── corridor.geojson (Pritam) ───────────────────────────────────────────────
export const CorridorBandPropertiesSchema = z.object({
  kind:             z.literal('band'),
  source_id:        z.string(),
  hour_from:        z.number(),
  hour_to:          z.number(),
  risk:             z.number().min(0).max(1),
  pm25_delta_ugm3:  z.number(),
})

export const CorridorCenterlinePropertiesSchema = z.object({
  kind:             z.literal('centerline'),
  source_id:        z.string(),
  points_eta_hours: z.array(z.number()),
})

export const CorridorFeatureSchema = z.object({
  type:       z.literal('Feature'),
  geometry:   z.any(),
  properties: z.union([CorridorBandPropertiesSchema, CorridorCenterlinePropertiesSchema]),
})

export const CorridorGeoJSONSchema = z.object({
  type:     z.literal('FeatureCollection'),
  features: z.array(CorridorFeatureSchema),
})

export type CorridorBandProperties      = z.infer<typeof CorridorBandPropertiesSchema>
export type CorridorCenterlineProperties = z.infer<typeof CorridorCenterlinePropertiesSchema>
export type CorridorGeoJSON             = z.infer<typeof CorridorGeoJSONSchema>

// ─── ranked_sites.json (Meenal) ─────────────────────────────────────────────
export const RankedSiteSchema = z.object({
  rank:            z.number(),
  site_id:         z.string(),
  name:            z.string(),
  type:            z.enum(['school', 'hospital']),
  lat:             z.number(),
  lon:             z.number(),
  occupancy:       z.number().nullable(),
  eta_hours:       z.number(),
  pm25_delta_ugm3: z.number(),
  risk_score:      z.number().min(0).max(1),
  source_id:       z.string(),
})

export const RankedSitesFileSchema = z.object({
  generated_at:       z.string(),
  exposed_population: z.object({
    estimate:       z.number(),
    low:            z.number(),
    high:           z.number(),
    method:         z.string().optional(),
    data_available: z.boolean().optional(),
  }),
  sites: z.array(RankedSiteSchema),
})

export type RankedSite      = z.infer<typeof RankedSiteSchema>
export type RankedSitesFile = z.infer<typeof RankedSitesFileSchema>

// ─── actions.json (Saba / Strands Agent) ─────────────────────────────────────
export const SiteActionSchema = z.object({
  priority:       z.number(),
  site_id:        z.string(),
  who:            z.string(),
  action:         z.string(),
  reason:         z.string(),
  deadline_hours: z.number(),
})

export const AuthorityActionSchema = z.object({
  who:    z.string(),
  action: z.string(),
  reason: z.string(),
})

export const ActionsFileSchema = z.object({
  generated_at:      z.string(),
  summary:           z.string(),
  summary_hi:        z.string().optional(),
  actions:           z.array(SiteActionSchema),
  authority_actions: z.array(AuthorityActionSchema),
})

export type SiteAction      = z.infer<typeof SiteActionSchema>
export type AuthorityAction = z.infer<typeof AuthorityActionSchema>
export type ActionsFile     = z.infer<typeof ActionsFileSchema>

// ─── aqi.json (Meenal / CPCB / OpenAQ) ───────────────────────────────────────
export const AqiStationSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  lat:          z.number(),
  lon:          z.number(),
  pm25:         z.number().nullable().optional(),
  pm10:         z.number().nullable().optional(),
  aqi:          z.number().nullable().optional(),
  aqi_category: z.string().nullable().optional(),
  observed_at:  z.string().nullable().optional(),
  source:       z.string(),
})

export const AqiFileSchema = z.object({
  generated_at: z.string(),
  stations:     z.array(AqiStationSchema),
})

export type AqiStation = z.infer<typeof AqiStationSchema>
export type AqiFile    = z.infer<typeof AqiFileSchema>

// ─── wind.json (Open-Meteo GFS) ─────────────────────────────────────────────
export interface WindHour {
  t: string
  u_ms: number
  v_ms: number
  speed_ms: number
  dir_from_deg: number
  pblh_m: number
}

export interface WindPoint {
  lat: number
  lon: number
  hours: WindHour[]
}

export interface WindFile {
  generated_at: string
  source: string
  points: WindPoint[]
}

// ─── Risk level helper ───────────────────────────────────────────────────────
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
    'high':      'badge badge-h',
    'medium':    'badge badge-m',
    'low':       'badge badge-l',
  }
  return map[level]
}

export function riskLabel(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    'very-high': 'Very High',
    'high':      'High',
    'medium':    'Medium',
    'low':       'Low',
  }
  return map[level]
}

