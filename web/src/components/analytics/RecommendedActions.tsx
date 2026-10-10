import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, FileText, Hospital, School } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import type { SiteAction } from '@/types/schemas'
import './RecommendedActions.css'
import { actionKey, useActionChecklist } from '@/components/agent/actionChecklist'
import { buildCsv, downloadText } from '@/components/views/csv'

interface GroupedDirective {
  actionText: string
  title: string
  facilityType: 'school' | 'hospital' | 'mixed'
  items: SiteAction[]
  earliestDeadline: number
  highestPriority: number
}

function getCondensedTitle(action: string, count: number, facilityType: 'school' | 'hospital' | 'mixed'): string {
  const typePlural = facilityType === 'school' ? 'schools' : facilityType === 'hospital' ? 'hospitals' : 'facilities'
  if (action.toLowerCase().includes('assembly') || action.toLowerCase().includes('indoors')) {
    return `Move morning assembly indoors (${count} ${typePlural})`
  }
  if (action.toLowerCase().includes('hepa') || action.toLowerCase().includes('hvac')) {
    return `Activate hospital HVAC HEPA filtration (${count} ${typePlural})`
  }
  return `${action.slice(0, 48)}... (${count} ${typePlural})`
}

export default function RecommendedActions() {
  const { actions, rankedSites, setShowActionsModal } = useAeris()

  const { checked, toggle: toggleCheck, setMany } = useActionChecklist()

  // State to track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'group-0': true,
    'group-1': true,
  })

  // State to track expanded reason details per site
  const [expandedReasons, setExpandedReasons] = useState<Record<string, boolean>>({})

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  const toggleReason = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedReasons(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleGroupAll = (groupItems: SiteAction[], allChecked: boolean) => {
    setMany(groupItems.map(item => actionKey(actions?.generated_at, item)), !allChecked)
  }

  // Lookup map for site names from ranked_sites
  const siteMap = useMemo(() => {
    const map = new Map<string, { name: string; type: string; lat: number; lon: number }>()
    if (rankedSites?.sites) {
      for (const s of rankedSites.sites) {
        map.set(s.site_id, { name: s.name, type: s.type, lat: s.lat, lon: s.lon })
      }
    }
    return map
  }, [rankedSites])

  // Group actions by unique action text
  const groups: GroupedDirective[] = useMemo(() => {
    if (!actions?.actions) return []
    const map = new Map<string, SiteAction[]>()
    actions.actions.forEach(a => {
      const list = map.get(a.action) ?? []
      list.push(a)
      map.set(a.action, list)
    })

    return Array.from(map.entries()).map(([actionText, items]) => {
      // Determine facility type
      const types = items.map(it => siteMap.get(it.site_id)?.type ?? (it.who.toLowerCase().includes('hospital') ? 'hospital' : 'school'))
      const allSchool = types.every(t => t === 'school')
      const allHosp = types.every(t => t === 'hospital')
      const facilityType = allSchool ? 'school' : allHosp ? 'hospital' : 'mixed'

      const earliestDeadline = Math.min(...items.map(i => i.deadline_hours))
      const highestPriority = Math.min(...items.map(i => i.priority))

      return {
        actionText,
        title: getCondensedTitle(actionText, items.length, facilityType),
        facilityType,
        items,
        earliestDeadline,
        highestPriority,
      }
    })
  }, [actions, siteMap])

  const totalActionsCount = actions?.actions.length ?? 0
  const totalDispatchedCount = (actions?.actions ?? []).filter(a => !!checked[actionKey(actions?.generated_at, a)]).length

  const handleExportCsv = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!actions) {
      setShowActionsModal(true)
      return
    }

    const headers = ['Priority', 'Site ID', 'Site Name', 'Recipient', 'Recommendation', 'Deadline Hours', 'Local Checklist', 'Reason']
    const rows = actions.actions.map(a => [a.priority, a.site_id, siteMap.get(a.site_id)?.name ?? a.site_id, a.who, a.action, a.deadline_hours, checked[actionKey(actions.generated_at, a)] ? 'MARKED LOCALLY' : 'UNMARKED', a.reason])
    downloadText(`AERIS_Recommendations_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(headers, rows))
  }

  return (
    <div className="rec-actions card">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h3 className="section-title">Recommended Actions</h3>
          {totalActionsCount > 0 && (
            <span
              className="rec-actions-status-pill"
              title={`Showing ${totalActionsCount} field directives across ${groups.length} grouped operation categories`}
            >
              {totalDispatchedCount}/{totalActionsCount} marked locally · {groups.length} groups
            </span>
          )}
        </div>
        <button
          className="section-link export-btn"
          onClick={handleExportCsv}
          title="Download recommendation CSV with local checklist marks"
          type="button"
        >
          <FileText size={12} />
          <span>Export Report ↓</span>
        </button>
      </div>

      <p className="panel-sub">Local review checklist only; no alerts are sent.</p>
      <div className="actions-grouped-scrollable">
        {groups.map((group, gIdx) => {
          const groupKey = `group-${gIdx}`
          const isExpanded = !!expandedGroups[groupKey]
          const groupCheckedCount = group.items.filter(i => !!checked[actionKey(actions?.generated_at, i)]).length
          const isAllChecked = groupCheckedCount === group.items.length

          return (
            <div key={groupKey} className="directive-group-card">
              {/* Directive Category Header */}
              <div
                className="directive-group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                <div className="directive-header-left">
                  <button
                    type="button"
                    className="group-expand-btn"
                    onClick={(e) => { e.stopPropagation(); toggleGroup(groupKey); }}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} recommendation group: ${group.title}`}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <span className="group-facility-icon">
                    {group.facilityType === 'hospital' ? (
                      <Hospital size={14} className="icon-hospital" />
                    ) : (
                      <School size={14} className="icon-school" />
                    )}
                  </span>
                  <div className="group-title-wrap">
                    <span className="directive-group-title">{group.title}</span>
                    <span className="directive-meta-sub">
                      Priority #{group.highestPriority} · Due in {group.earliestDeadline}h
                    </span>
                  </div>
                </div>

                <div className="directive-header-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`group-batch-toggle ${isAllChecked ? 'all-done' : ''}`}
                    onClick={() => toggleGroupAll(group.items, isAllChecked)}
                    title={isAllChecked ? 'Unmark all locally in group' : 'Mark all locally in group'}
                  >
                    {isAllChecked && <CheckCircle2 size={13} />}
                    <span>{groupCheckedCount}/{group.items.length} Ready</span>
                  </button>
                </div>
              </div>

              {/* Sub-item Sites List (Expandable) */}
              {isExpanded && (
                <ul className="directive-sub-items-list">
                  {group.items.map(item => {
                    const id = actionKey(actions?.generated_at, item)
                    const isDone = !!checked[id]
                    const siteInfo = siteMap.get(item.site_id)
                    const siteName = siteInfo?.name ?? item.who.split(',')[1]?.trim() ?? item.site_id
                    const isReasonOpen = !!expandedReasons[id]

                    return (
                      <li key={id} className={`action-row ${isDone ? 'done' : ''}`}>
                        <div className="action-row-main">
                          <label className="action-check-label">
                            <input
                              type="checkbox"
                              className="action-checkbox"
                              checked={isDone}
                              onChange={() => toggleCheck(id)}
                              aria-label={`Mark recommendation for ${siteName} locally`}
                            />
                            <span className="checkmark" />
                          </label>

                          <div className="action-body">
                            <div className="action-site-header">
                              <span className="action-site-name">{siteName}</span>
                              <span className="action-site-id">#{item.site_id}</span>
                              <span className="action-deadline-badge">⏱ {item.deadline_hours}h</span>
                            </div>
                            <div className="action-who-role">{item.who}</div>
                          </div>

                          <button
                            type="button"
                            className="reason-toggle-btn"
                            onClick={(e) => toggleReason(id, e)}
                            title="Toggle technical reason details"
                            aria-expanded={isReasonOpen}
                          >
                            <span>Reason</span>
                            {isReasonOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          </button>
                        </div>

                        {/* Expandable Reason Row */}
                        {isReasonOpen && (
                          <div className="action-reason-drawer">
                            <span className="reason-label">Trigger Condition:</span>
                            <span className="reason-text">{item.reason}</span>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
        {groups.length === 0 && <p role="status">No recommendations available.</p>}
      </div>
    </div>
  )
}
