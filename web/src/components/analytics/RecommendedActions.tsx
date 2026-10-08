import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, FileText, Hospital, School } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import type { SiteAction } from '@/types/schemas'
import './RecommendedActions.css'

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

  // Initialize checked state from localStorage
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('aeris_dispatched_actions')
      if (saved) return JSON.parse(saved)
    } catch {
      // Ignore
    }
    return { 's_1420-1': true, 's_0306-5': true }
  })

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

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem('aeris_dispatched_actions', JSON.stringify(next))
      } catch {
        // Ignore
      }
      return next
    })
  }

  const toggleGroupAll = (groupItems: SiteAction[], allChecked: boolean) => {
    setChecked(prev => {
      const next = { ...prev }
      groupItems.forEach(item => {
        const id = `${item.site_id}-${item.priority}`
        next[id] = !allChecked
      })
      try {
        localStorage.setItem('aeris_dispatched_actions', JSON.stringify(next))
      } catch {
        // Ignore
      }
      return next
    })
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
  const totalDispatchedCount = (actions?.actions ?? []).filter(a => !!checked[`${a.site_id}-${a.priority}`]).length

  const handleExportCsv = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!actions) {
      setShowActionsModal(true)
      return
    }

    const headers = ['Priority', 'Site_ID', 'Site_Name', 'Target_Entity', 'Action_Directive', 'Deadline_Hours', 'Status', 'Reason']
    const rows = actions.actions.map(a => {
      const id = `${a.site_id}-${a.priority}`
      const status = checked[id] ? 'DISPATCHED' : 'PENDING'
      const siteInfo = siteMap.get(a.site_id)
      return [
        `#${a.priority}`,
        `"${a.site_id}"`,
        `"${(siteInfo?.name ?? a.site_id).replace(/"/g, '""')}"`,
        `"${a.who.replace(/"/g, '""')}"`,
        `"${a.action.replace(/"/g, '""')}"`,
        `${a.deadline_hours}h`,
        status,
        `"${a.reason.replace(/"/g, '""')}"`,
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `AERIS_CPCB_Directives_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
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
              {totalDispatchedCount}/{totalActionsCount} Dispatched · 2 Directives (8 Sites)
            </span>
          )}
        </div>
        <button
          className="section-link export-btn"
          onClick={handleExportCsv}
          title="Download official CSV Action Directives Report"
          type="button"
        >
          <FileText size={12} />
          <span>Export Report ↓</span>
        </button>
      </div>

      <div className="actions-grouped-scrollable">
        {groups.map((group, gIdx) => {
          const groupKey = `group-${gIdx}`
          const isExpanded = !!expandedGroups[groupKey]
          const groupCheckedCount = group.items.filter(i => !!checked[`${i.site_id}-${i.priority}`]).length
          const isAllChecked = groupCheckedCount === group.items.length
          const isPartiallyChecked = groupCheckedCount > 0 && !isAllChecked

          return (
            <div key={groupKey} className="directive-group-card">
              {/* Directive Category Header */}
              <div
                className="directive-group-header"
                onClick={() => toggleGroup(groupKey)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(groupKey); } }}
                aria-expanded={isExpanded}
              >
                <div className="directive-header-left">
                  <button
                    type="button"
                    className="group-expand-btn"
                    onClick={(e) => { e.stopPropagation(); toggleGroup(groupKey); }}
                    aria-label={isExpanded ? 'Collapse directive group' : 'Expand directive group'}
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
                    title={isAllChecked ? 'Uncheck all in group' : 'Dispatch all in group'}
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
                    const id = `${item.site_id}-${item.priority}`
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
                              aria-label={`Dispatch directive for ${siteName}`}
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
      </div>
    </div>
  )
}
