import { useState } from 'react'
import { FileText } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './RecommendedActions.css'

type Priority = 'high' | 'medium' | 'low'

interface ActionItem {
  id: string
  text: string
  priority: Priority
}

function priorityBadge(p: Priority) {
  const map: Record<Priority, string> = {
    high:   'badge badge-vh',
    medium: 'badge badge-m',
    low:    'badge badge-l',
  }
  const label: Record<Priority, string> = {
    high:   'High Priority',
    medium: 'Medium',
    low:    'Low',
  }
  return <span className={map[p]}>{label[p]}</span>
}

export default function RecommendedActions() {
  const { actions, setShowActionsModal } = useAeris()

  // Map real agent actions to display items (no fallback mock items)
  const items: ActionItem[] = actions?.actions.slice(0, 4).map(a => ({
    id: `${a.site_id}-${a.priority}`,
    text: a.action,
    priority: a.priority <= 2 ? 'high' : a.priority <= 4 ? 'medium' : 'low',
  })) ?? []

  // Initialize checked state from localStorage
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('aeris_dispatched_actions')
      if (saved) return JSON.parse(saved)
    } catch {
      // Ignore
    }
    return { 's_0-1': true, 's_1-2': true }
  })

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

  const dispatchedCount = items.filter(i => !!checked[i.id]).length

  const handleExportCsv = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!actions) {
      setShowActionsModal(true)
      return
    }

    const headers = ['Priority', 'Site_ID', 'Target_Entity', 'Action_Directive', 'Deadline_Hours', 'Status', 'Reason']
    const rows = actions.actions.map(a => {
      const id = `${a.site_id}-${a.priority}`
      const status = checked[id] ? 'DISPATCHED' : 'PENDING'
      return [
        `#${a.priority}`,
        `"${a.site_id}"`,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 className="section-title">Recommended Actions</h3>
          {items.length > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#22734F',
                background: '#E6F2EB',
                padding: '2px 7px',
                borderRadius: '9999px',
              }}
            >
              {dispatchedCount}/{items.length} Ready
            </span>
          )}
        </div>
        <button
          className="section-link"
          onClick={handleExportCsv}
          title="Download official CSV Action Directives Report"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <FileText size={12} />
          Export Report ↓
        </button>
      </div>

      <ul className="actions-list">
        {items.map(item => (
          <li key={item.id} className={`action-row ${checked[item.id] ? 'done' : ''}`}>
            <label className="action-check-label">
              <input
                type="checkbox"
                className="action-checkbox"
                checked={!!checked[item.id]}
                onChange={() => toggleCheck(item.id)}
                aria-label={item.text}
              />
              <span className="checkmark" />
            </label>
            <span className="action-text">{item.text}</span>
            {priorityBadge(item.priority)}
          </li>
        ))}
      </ul>
    </div>
  )
}
