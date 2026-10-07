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
  const { actions } = useAeris()

  // Map real agent actions to display items (no fallback mock items)
  const items: ActionItem[] = actions?.actions.slice(0, 4).map(a => ({
    id: `${a.site_id}-${a.priority}`,
    text: a.action,
    priority: a.priority <= 2 ? 'high' : a.priority <= 4 ? 'medium' : 'low',
  })) ?? []


  const [checked, setChecked] = useState<Record<string, boolean>>({ a1: true, a2: true })

  return (
    <div className="rec-actions card">
      <div className="section-header">
        <h3 className="section-title">Recommended Actions</h3>
        <button className="section-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <FileText size={12} />
          Generate Report →
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
                onChange={() => setChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
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
