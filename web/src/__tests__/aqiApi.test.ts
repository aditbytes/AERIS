import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAqi } from '@/services/api'

afterEach(() => { vi.unstubAllGlobals() })

describe('AQI metadata through the actual fetch/validation service', () => {
  it('retains partial metadata, zero values and ambiguous source time', async () => {
    const input = {
      generated_at: '2026-10-10T06:00:00Z', source: 'CPCB/data.gov.in',
      sources_with_readings: ['CPCB/data.gov.in'], sources_failed: ['OpenAQ'],
      fetch_status: 'PARTIAL', coverage_complete: false,
      source_fetch_status: { OpenAQ: 'FAILED', 'CPCB/data.gov.in': 'SUCCESS' },
      stations: [{ id: 'ISOLATED_ZERO_TEST', name: 'Isolated test', lat: 29, lon: 77, pm25: 0, aqi: 0,
        source: 'CPCB/data.gov.in', observed_at: null, source_timestamp: '10-10-2026 07:00:00' }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => input }))
    expect(await getAqi()).toEqual(input)
  })
  it('retains an explicit empty successful fetch without inventing complete coverage', async () => {
    const input = { generated_at: '2026-10-10T06:01:00Z', source: 'none', stations: [],
      fetch_status: 'COMPLETE', coverage_complete: null, sources_with_readings: [],
      source_fetch_status: { OpenAQ: 'SUCCESS', 'CPCB/data.gov.in': 'SUCCESS' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => input }))
    expect(await getAqi()).toEqual(input)
  })
  it('rejects changed invalid metadata even when the capture timestamp is unchanged', async () => {
    const input = { generated_at: '2026-10-10T06:02:00Z', stations: [], coverage_complete: null }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => input })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...input, coverage_complete: 'true' }) }))
    await getAqi()
    await expect(getAqi()).rejects.toThrow('Invalid aqi data received')
  })
})
