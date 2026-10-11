import { ModelProvenanceSchema, type ActionsFile } from '@/types/schemas'

export function advisoryDeadline(actions: ActionsFile | null, hours: number): string {
  const context = ModelProvenanceSchema.safeParse(actions?.model_context?.corridor)
  return context.success && context.data.forecast_start
    ? `${hours}h from declared forecast start ${context.data.forecast_start}`
    : `${hours}h scheduling value; time reference unverified`
}

export const ADVISORY_LIMITS = 'Saved model advice requires human review against current observations. It is not medical advice or a legal order. Scheduling values are not live countdowns; missing original bindings remain unknown.'
