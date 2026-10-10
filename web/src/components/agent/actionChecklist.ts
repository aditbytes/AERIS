import { useCallback, useEffect, useState } from 'react'
import type { AuthorityAction, SiteAction } from '@/types/schemas'

const STORAGE_KEY = 'aeris_action_checklist_v2'
const CHANGE_EVENT = 'aeris-checklist-change'
type Checklist = Record<string, boolean>
let memory: Checklist = {}
let storageUnavailable = false

export function parseChecklist(raw: string | null): Checklist {
  if (raw == null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'))
  } catch { return {} }
}

function readChecklist(): Checklist {
  if (storageUnavailable) return memory
  try { memory = parseChecklist(localStorage.getItem(STORAGE_KEY)) } catch { /* Keep this session's state if storage is blocked. */ }
  return memory
}

function publish(next: Checklist): void {
  memory = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); storageUnavailable = false } catch { storageUnavailable = true }
  window.dispatchEvent(new CustomEvent<Checklist>(CHANGE_EVENT, { detail: next }))
}

/** Status belongs to this recommendation and snapshot, never a mutable array index. */
export function actionKey(generatedAt: string | undefined, action: SiteAction | AuthorityAction): string {
  return JSON.stringify([generatedAt ?? '', 'site_id' in action ? action.site_id : 'authority', action.who, action.action, action.reason, 'deadline_hours' in action ? action.deadline_hours : null])
}

export function clearActionChecklist(): void {
  publish({})
  for (const key of ['aeris_action_checklist', 'aeris_dispatched_actions']) {
    try { localStorage.removeItem(key) } catch { /* Storage may be unavailable. */ }
  }
}

/** All action panels share a local checklist. This sends no alerts or orders. */
export function useActionChecklist() {
  const [checked, setChecked] = useState<Checklist>(readChecklist)
  useEffect(() => {
    const handleChange = (event: Event) => setChecked((event as CustomEvent<Checklist>).detail ?? readChecklist())
    const handleStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) setChecked(readChecklist()) }
    window.addEventListener(CHANGE_EVENT, handleChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])
  const setMany = useCallback((ids: string[], value: boolean) => {
    const next = { ...readChecklist() }
    for (const id of ids) next[id] = value
    publish(next)
  }, [])
  const toggle = useCallback((id: string) => {
    const next = readChecklist()
    publish({ ...next, [id]: !next[id] })
  }, [])
  return { checked, toggle, setMany, clear: clearActionChecklist }
}
