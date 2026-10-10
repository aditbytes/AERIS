import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const time = '2026-10-07T18:00:00Z'
const observation = { id: 'test-observation', name: 'Mathematical test', lat: 28, lon: 77, pm25: 0, aqi: 0, observed_at: time, source: 'MATHEMATICAL_TEST' }
const payload = { generated_at: time, stations: [observation] }
function response(json: unknown, status = 200, etag = 'same-etag') {
  return { ok: status < 400, status, headers: new Headers({ etag }), json: async () => json }
}

beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_API_BASE_URL', ''); vi.stubEnv('BASE_URL', '/') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('validated API access', () => {
  it('loads the actual publication path and preserves zero-valued observations', async () => {
    const fetch = vi.fn().mockResolvedValue(response(payload))
    vi.stubGlobal('fetch', fetch)
    const { getAqi, DATA_MODE } = await import('@/services/api')
    expect((await getAqi()).stations[0].pm25).toBe(0)
    expect(fetch.mock.calls[0][0]).toBe('/data/aqi.json')
    expect(DATA_MODE).toBe('snapshot')
  })
  it('supports a configured API prefix without duplicated trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/aeris///')
    const fetch = vi.fn().mockResolvedValue(response(payload))
    vi.stubGlobal('fetch', fetch)
    const { getAqi, DATA_MODE } = await import('@/services/api')
    await getAqi()
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/aeris/aqi')
    expect(DATA_MODE).toBe('api')
  })
  it('revalidates malformed payloads even with the same timestamp and ETag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response({ generated_at: time, stations: 'malformed' })))
    const { getAqi } = await import('@/services/api')
    await getAqi()
    await expect(getAqi()).rejects.toThrow('Invalid aqi data')
  })
  it('updates valid changed values with unchanged timestamp and ETag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response({ ...payload, stations: [{ ...observation, pm25: 42 }] })))
    const { getAqi } = await import('@/services/api')
    expect((await getAqi()).stations[0].pm25).toBe(0)
    expect((await getAqi()).stations[0].pm25).toBe(42)
  })
  it('reuses only identical previously validated bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)))
    const { getAqi } = await import('@/services/api')
    const first = await getAqi()
    expect(await getAqi()).toBe(first)
  })
  it('validates wind instead of returning unchecked JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ generated_at: time, source: 'MATHEMATICAL_TEST', points: [{ lat: 200, lon: 77, hours: [] }] })))
    const { getWind } = await import('@/services/api')
    await expect(getWind()).rejects.toThrow('Invalid wind data')
  })
  it('reports HTTP, malformed JSON, and network failures without raw server details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error('raw private error')) }).mockRejectedValueOnce(new Error('https://private.example/token=secret')))
    const { getAqi } = await import('@/services/api')
    await expect(getAqi()).rejects.toThrow('HTTP 503')
    await expect(getAqi()).rejects.toThrow('Invalid JSON')
    await expect(getAqi()).rejects.toThrow('Check your connection')
  })
  it('keeps successful capture freshness when a newer malformed response fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response({ generated_at: '2026-10-09T18:00:00Z', stations: 'invalid' })))
    const { getAqi, getStaleFeeds } = await import('@/services/api')
    await getAqi()
    await expect(getAqi()).rejects.toThrow()
    expect(getStaleFeeds().find(feed => feed.label === 'aqi')?.generatedAt).toBe(time)
  })
  it('updates freshness as time passes and honors a server stale flag', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(time))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response({ ...payload, stale: true })))
    const { getAqi, getStaleFeeds } = await import('@/services/api')
    await getAqi()
    expect(getStaleFeeds()).toEqual([])
    vi.setSystemTime(new Date(Date.parse(time) + 91 * 60_000))
    expect(getStaleFeeds()[0].status).toBe('stale')
    vi.setSystemTime(new Date(time))
    await getAqi()
    expect(getStaleFeeds()[0].stale).toBe(true)
  })
  it('associates server freshness with the exact retained result instead of the latest response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(time))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ ...payload, stale: true })).mockResolvedValueOnce(response(payload)))
    const { getAqi, getStaleFeeds, getCommittedFeedFreshness } = await import('@/services/api')
    const retained = await getAqi()
    const latest = await getAqi()
    expect(getStaleFeeds()).toEqual([])
    expect(getCommittedFeedFreshness({ aqi: retained }, Date.now())[0]).toMatchObject({ label: 'aqi', stale: true })
    expect(getCommittedFeedFreshness({ aqi: latest }, Date.now())).toEqual([])
  })
  it('aborts cancelled requests and never publishes their freshness', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))))
    const { getAqi, getStaleFeeds } = await import('@/services/api')
    const controller = new AbortController()
    const request = getAqi(controller.signal)
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(getStaleFeeds()).toEqual([])
  })
  it('bounds network waits and clears timeout resources', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))))
    const { getAqi } = await import('@/services/api')
    const request = getAqi()
    const rejected = expect(request).rejects.toThrow('Timed out retrieving aqi data')
    await vi.advanceTimersByTimeAsync(20_000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('honest capture freshness', () => {
  it('marks old publication snapshots stale without depending on an API flag', async () => {
    const { getFeedFreshness } = await import('@/services/api')
    const result = getFeedFreshness('aqi', time, Date.parse('2026-10-09T18:00:00Z'))
    expect(result.status).toBe('stale')
    expect(result.ageSeconds).toBe(172800)
  })
  it('never calls invalid, missing or future timestamps current', async () => {
    const { getFeedFreshness } = await import('@/services/api')
    for (const stamp of [null, 'bad', '2026-02-30T12:00:00Z', '2026-10-07T18:00:00', '2026-11-01T00:00:00Z']) expect(getFeedFreshness('aqi', stamp, Date.parse(time))).toMatchObject({ status: 'unknown', stale: true })
  })
  it('honors server stale markers and separate wind capture budgets', async () => {
    const { getFeedFreshness } = await import('@/services/api')
    expect(getFeedFreshness('aqi', time, Date.parse(time), true).stale).toBe(true)
    const now = Date.parse(time) + 2 * 3600_000
    expect(getFeedFreshness('aqi', time, now).stale).toBe(true)
    expect(getFeedFreshness('wind', time, now).stale).toBe(false)
  })
})
