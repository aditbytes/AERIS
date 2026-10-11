import manifestBody from '../../public/data/model-provenance.json?raw'
import { ModelProvenanceSchema, type ModelProvenance } from '@/types/schemas'

const manifest = JSON.parse(manifestBody) as { artifacts: Record<string, unknown>; byte_variants?: Record<string, unknown[]> }

/** Match the downloaded bytes; never identify a replay by count or timestamp. */
export async function snapshotProvenance(bytes: ArrayBuffer, kind: 'sources' | 'corridor'): Promise<ModelProvenance> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  for (const value of [manifest.artifacts[kind], ...(manifest.byte_variants?.[kind] ?? [])]) {
    const candidate = ModelProvenanceSchema.safeParse(value)
    if (candidate.success && candidate.data.artifact_kind === kind && candidate.data.artifact_sha256 === hash) return candidate.data
  }
  const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { generated_at: string }
  return ModelProvenanceSchema.parse({ schema_version: 1, artifact_kind: kind, artifact_sha256: hash,
    artifact_status: 'UNVERSIONED_UNKNOWN', operational_validation: 'NOT_ESTABLISHED', generated_at: document.generated_at })
}
