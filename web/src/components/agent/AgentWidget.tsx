import { ArrowRight, MoreHorizontal } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './AgentWidget.css'

export default function AgentWidget() {
  const { actions, setShowActionsModal } = useAeris()

  return (
    <div className="agent-card card">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="8" r="3"/>
            <path d="M6 20v-1a6 6 0 0 1 12 0v1"/>
            <path d="M12 14v2m-2 2h4"/>
          </svg>
        </div>
        <div className="agent-title-group">
          <span className="agent-title">AERIS Agent</span>
          <span className="agent-status">● Active</span>
        </div>
        <button className="icon-btn" aria-label="Agent options">
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* Summary */}
      <div className="agent-summary">
        {actions?.summary ? (
          <p className="agent-text">{actions.summary}</p>
        ) : (
          <p className="agent-text text-tertiary">
            Awaiting action plan generation from Strands Action Agent...
          </p>
        )}
      </div>


      {/* CTA */}
      <button
        className="btn-primary agent-cta"
        onClick={() => setShowActionsModal(true)}
      >
        View Recommended Actions
        <ArrowRight size={14} />
      </button>
    </div>
  )
}
