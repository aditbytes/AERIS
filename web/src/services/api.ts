/** Validated access to real API results or archived publication snapshots. */
import {
  ActionsFileSchema, AqiFileSchema, CorridorGeoJSONSchema, RankedSitesFileSchema,
  SourcesFileSchema, TimestampSchema, WindFileSchema,
  type ActionsFile, type AqiFile, type CorridorGeoJSON, type RankedSitesFile,
  type SourcesFile, type WindFile,
} from '@/types/schemas'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
export const DATA_MODE = API_BASE ? 'api' : 'snapshot'
export type FeedName = 'sources' | 'corridor' | 'ranked_sites' | 'actions' | 'aqi' | 'wind'

export interface Freshness {
  label: string
  stale: boolean
  generatedAt: string | null
  ageSeconds: number | null
  status: 'current' | 'stale' | 'unknown'
  reason?: string
}

/** Capture freshness is separate from a station's observed_at measurement time. */
export function getFeedFreshness(
  label: string,
  generatedAt: string | null | undefined,
  now = Date.now(),
  serverStale = false,
): Freshness {
  const time = generatedAt && TimestampSchema.safeParse(generatedAt).success ? Date.parse(generatedAt) : NaN
  if (!Number.isFinite(time) || !Number.isFinite(now) || time > now + 5 * 60_000) {
    return {
      label, stale: true, generatedAt: generatedAt || null, ageSeconds: null,
      status: 'unknown', reason: 'Missing, invalid, or future timestamp',
    }
  }
  const ageSeconds = Math.max(0, Math.floor((now - time) / 1000))
  const budget = label === 'wind' ? 3 * 3600 : 90 * 60
  const stale = serverStale || ageSeconds > budget
  return { label, stale, generatedAt: generatedAt!, ageSeconds, status: stale ? 'stale' : 'current' }
}

interface Capture {
  generatedAt: string | null
  serverStale: boolean
}
const captures = new Map<string, Capture>()
// Metadata belongs to the validated object returned to a caller. An in-flight
// replacement cannot change the freshness of an older object still on screen.
const resultCaptures = new WeakMap<object, Capture>()
const validationCache = new Map<string, { payload: string; parsed: unknown }>()

export function getCommittedFeedFreshness(
  feeds: Partial<Record<FeedName, { generated_at: string } | null>>,
  now: number,
): Freshness[] {
  return Object.entries(feeds).flatMap(([label, data]) => {
    if (!data) return []
    const capture = resultCaptures.get(data)
    const value = getFeedFreshness(label, data.generated_at, now, capture?.serverStale ?? false)
    return value.stale ? [value] : []
  })
}

/** Recalculate ages so a previously current capture cannot remain current forever. */
export function getStaleFeeds(): Freshness[] {
  return [...captures].map(([label, capture]) => getFeedFreshness(
    label, capture.generatedAt, Date.now(), capture.serverStale,
  )).filter(feed => feed.stale)
}

function recordFreshness(label: string, json: unknown, parsed: unknown): void {
  const object = json as { generated_at?: unknown; stale?: unknown }
  const capture = {
    generatedAt: typeof object.generated_at === 'string' ? object.generated_at : null,
    serverStale: object.stale === true,
  }
  captures.set(label, capture)
  if (parsed && typeof parsed === 'object') resultCaptures.set(parsed, capture)
}

async function fetchAndValidate<T>(
  url: string, schema: { parse: (data: unknown) => T }, label: string, signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 20_000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Unable to retrieve ${label} data (HTTP ${response.status}). Retry to recover.`)
    let json: unknown
    try { json = await response.json() }
    catch { throw new Error(`Invalid JSON in ${label} data. Retry to recover.`) }
    if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError')

    // Neither generated_at nor an ETag proves that a changed body is valid.
    const payload = JSON.stringify(json)
    const cached = validationCache.get(url)
    let parsed: T
    if (cached?.payload === payload) parsed = cached.parsed as T
    else {
      try { parsed = schema.parse(json) }
      catch { throw new Error(`Invalid ${label} data received. Retry to recover.`) }
      validationCache.set(url, { payload, parsed })
    }
    // Failed or cancelled responses never replace successful freshness metadata.
    recordFreshness(label, json, parsed)
    return parsed
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (timedOut) throw new Error(`Timed out retrieving ${label} data. Retry to recover.`)
    if (error instanceof Error && /^(Unable to retrieve|Invalid .* data)/.test(error.message)) throw error
    throw new Error(`Unable to retrieve ${label} data. Check your connection and retry.`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

function endpoint(liveRoute: string, snapshotFile: string): string {
  if (API_BASE) return `${API_BASE}${liveRoute}`
  return `${import.meta.env.BASE_URL}data/${snapshotFile}`
}

export function getSources(signal?: AbortSignal): Promise<SourcesFile> {
  return fetchAndValidate(endpoint('/sources', 'sources.json'), SourcesFileSchema, 'sources', signal)
}
export function getCorridor(signal?: AbortSignal): Promise<CorridorGeoJSON> {
  return fetchAndValidate(endpoint('/corridor', 'corridor.geojson'), CorridorGeoJSONSchema, 'corridor', signal)
}
export function getRankedSites(signal?: AbortSignal): Promise<RankedSitesFile> {
  return fetchAndValidate(endpoint('/sites/ranked', 'ranked_sites.json'), RankedSitesFileSchema, 'ranked_sites', signal)
}
export function getActions(signal?: AbortSignal): Promise<ActionsFile> {
  return fetchAndValidate(endpoint('/actions', 'actions.json'), ActionsFileSchema, 'actions', signal)
}
export function getAqi(signal?: AbortSignal): Promise<AqiFile> {
  return fetchAndValidate(endpoint('/aqi', 'aqi.json'), AqiFileSchema, 'aqi', signal)
}
export function getWind(signal?: AbortSignal): Promise<WindFile> {
  return fetchAndValidate(endpoint('/wind', 'wind.json'), WindFileSchema, 'wind', signal)
}
