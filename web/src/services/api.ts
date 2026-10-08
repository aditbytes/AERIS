/**
 * AERIS API Service
 * Dual-mode data fetcher:
 *  - If VITE_API_BASE_URL is set → fetches from live API Gateway endpoints
 *  - If not set (local dev) → fetches snapshot files from /public/data/
 *
 * Per project rules: NEVER invents or falls back to hardcoded data.
 * If a source fails, throws an error — the UI shows an error state.
 */

import {
  ActionsFileSchema,
  AqiFileSchema,
  CorridorGeoJSONSchema,
  RankedSitesFileSchema,
  SourcesFileSchema,
  type ActionsFile,
  type AqiFile,
  type CorridorGeoJSON,
  type RankedSitesFile,
  type SourcesFile,
} from '@/types/schemas'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

interface CacheEntry<T> {
  generatedAt?: string | null
  etag?: string | null
  parsed: T
}

const validationCache = new Map<string, CacheEntry<unknown>>()

async function fetchAndValidate<T>(
  url: string,
  schema: { parse: (data: unknown) => T },
  label: string
): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`[AERIS] Failed to fetch ${label}: HTTP ${res.status} from ${url}`)
  }
  const etag = res.headers.get('etag')
  const json = await res.json()

  // Compare generated_at before expensive schema re-parsing on refresh
  const incomingGenAt = (json && typeof json === 'object' && 'generated_at' in json && typeof (json as { generated_at: unknown }).generated_at === 'string')
    ? (json as { generated_at: string }).generated_at
    : null

  const cached = validationCache.get(url) as CacheEntry<T> | undefined
  if (cached) {
    if (incomingGenAt && cached.generatedAt === incomingGenAt) {
      return cached.parsed
    }
    if (etag && cached.etag === etag) {
      return cached.parsed
    }
  }

  try {
    const parsed = schema.parse(json)
    validationCache.set(url, { generatedAt: incomingGenAt, etag, parsed })
    return parsed
  } catch (e) {
    throw new Error(`[AERIS] Schema validation failed for ${label}: ${String(e)}`)
  }
}

function endpoint(liveRoute: string, snapshotFile: string): string {
  if (API_BASE) return `${API_BASE}${liveRoute}`
  return `./data/${snapshotFile}`
}

export async function getSources(): Promise<SourcesFile> {
  return fetchAndValidate(
    endpoint('/sources', 'sources.json'),
    SourcesFileSchema,
    'sources'
  )
}

export async function getCorridor(): Promise<CorridorGeoJSON> {
  return fetchAndValidate(
    endpoint('/corridor', 'corridor.geojson'),
    CorridorGeoJSONSchema,
    'corridor'
  )
}

export async function getRankedSites(): Promise<RankedSitesFile> {
  return fetchAndValidate(
    endpoint('/sites/ranked', 'ranked_sites.json'),
    RankedSitesFileSchema,
    'ranked_sites'
  )
}

export async function getActions(): Promise<ActionsFile> {
  return fetchAndValidate(
    endpoint('/actions', 'actions.json'),
    ActionsFileSchema,
    'actions'
  )
}

export async function getAqi(): Promise<AqiFile> {
  return fetchAndValidate(
    endpoint('/aqi', 'aqi.json'),
    AqiFileSchema,
    'aqi'
  )
}

export async function getWind(): Promise<import('@/types/schemas').WindFile> {
  const url = endpoint('/wind', 'wind.json')
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`[AERIS] Failed to fetch wind data: HTTP ${res.status} from ${url}`)
  }
  return res.json()
}

