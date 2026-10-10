import { expect, it } from 'vitest'
import { advisoryDeadline } from './advisoryEvidence'
import type { ActionsFile } from '@/types/schemas'

it('does not attach saved advice to an invented original forecast or a live countdown', () => {
  expect(advisoryDeadline(null, 0)).toBe('0h scheduling value; time reference unverified')
})

it('retains an explicit valid forecast reference without converting it to hours from now', () => {
  const actions = { model_context: { corridor: { schema_version: 1, artifact_kind: 'corridor', artifact_sha256: 'a'.repeat(64), artifact_status: 'MODELLED_WITH_COMPANION_PROVENANCE', operational_validation: 'NOT_ESTABLISHED', generated_at: '2026-10-10T00:00:00Z', forecast_start: '2026-10-07T18:00:00Z' } } } as unknown as ActionsFile
  expect(advisoryDeadline(actions, 0)).toBe('0h from declared forecast start 2026-10-07T18:00:00Z')
})

it('does not trust malformed or caller-labelled calibration metadata', () => {
  const actions = { model_context: { corridor: { artifact_status: 'CALIBRATED', forecast_start: '2026-10-10T00:00:00Z' } } } as unknown as ActionsFile
  expect(advisoryDeadline(actions, 2)).toContain('time reference unverified')
})
