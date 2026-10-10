import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sources from '../../public/data/sources.json?raw'
import corridor from '../../public/data/corridor.geojson?raw'
import { snapshotProvenance } from '@/services/modelProvenance'

beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })
const bytes = (body: string) => new TextEncoder().encode(body).buffer as ArrayBuffer

describe('exact snapshot identity', () => {
  it.each([['sources', sources], ['corridor', corridor]] as const)('identifies %s by exact bytes', async (kind, body) => {
    expect((await snapshotProvenance(bytes(body), kind)).artifact_status).toBe('ARCHIVED_LEGACY')
  })
  it.each([['sources', sources], ['corridor', corridor]] as const)('recognizes the evidenced Git LF variant of %s', async (kind, body) => {
    const metadata = await snapshotProvenance(bytes(body.replace(/\r\n/g, '\n')), kind)
    expect(metadata.artifact_status).toBe('ARCHIVED_LEGACY')
    expect(metadata.byte_variant).toBe('GIT_COMMITTED_LF_COPY')
  })
  it.each([sources + ' ', JSON.stringify(JSON.parse(sources))])('does not identify changed or reserialized bytes as an archive', async body => {
    expect((await snapshotProvenance(bytes(body), 'sources')).artifact_status).toBe('UNVERSIONED_UNKNOWN')
  })
  it('retains legacy metadata through actual fetch, validation and freshness recording', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('BASE_URL', '/')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(sources))))
    const { getSources } = await import('@/services/api')
    const result = await getSources()
    expect(result.sources).toHaveLength(10)
    expect(result.provenance?.artifact_status).toBe('ARCHIVED_LEGACY')
    expect(result.provenance?.original_parameter_binding).toBe('NOT_RECORDED')
  })
  it('ignores caller-supplied archive/calibration labels in static payloads', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...JSON.parse(sources), provenance: { artifact_status: 'CALIBRATED' } }))))
    const { getSources } = await import('@/services/api')
    expect((await getSources()).provenance?.artifact_status).toBe('UNVERSIONED_UNKNOWN')
  })
})
