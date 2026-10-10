import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AerisState } from '@/services/dataContext'
import { SourcesFileSchema, CorridorGeoJSONSchema } from '@/types/schemas'
import sourceBody from '../../../public/data/sources.json?raw'
import corridorBody from '../../../public/data/corridor.geojson?raw'
import manifestBody from '../../../public/data/model-provenance.json?raw'
import ModelProvenanceNotice from './ModelProvenanceNotice'

let state: AerisState
vi.mock('@/services/dataContext', () => ({ useAeris: () => state }))
beforeEach(() => { state = { sources: null, corridor: null } as AerisState })

describe('visible scientific provenance', () => {
  it('does not invent provenance while feeds are unavailable', () => {
    render(<ModelProvenanceNotice />)
    expect(screen.queryByRole('complementary')).toBeNull()
  })
  it('preserves and exposes the exact archived source/corridor disclosures', () => {
    const manifest = JSON.parse(manifestBody)
    state.sources = SourcesFileSchema.parse({ ...JSON.parse(sourceBody), provenance: manifest.artifacts.sources })
    state.corridor = CorridorGeoJSONSchema.parse({ ...JSON.parse(corridorBody), provenance: manifest.artifacts.corridor })
    render(<ModelProvenanceNotice />)
    expect(screen.getByRole('complementary').textContent).toContain('Archived ten-source')
    expect(screen.getByRole('complementary').textContent).toContain('obsolete concentration and risk floors')
    expect(screen.getByRole('complementary').textContent).toContain('not current Gaussian')
    const bindings = screen.getAllByText(/"original_input_binding"/)
    expect(bindings).toHaveLength(2)
    for (const binding of bindings) expect(binding.textContent).toContain('NOT_RECORDED')
  })
  it('discloses unknown provenance instead of treating it as a calibrated run', () => {
    state.sources = SourcesFileSchema.parse(JSON.parse(sourceBody))
    render(<ModelProvenanceNotice />)
    expect(screen.getByRole('complementary').textContent).toContain('Provenance unavailable')
    expect(screen.getByRole('complementary').textContent).toContain('heuristic proxies')
  })
})
