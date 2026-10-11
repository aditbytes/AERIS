import { useEffect, useRef, useState } from 'react'
import { X, Download, ShieldCheck, AlertCircle, Building2, School, Clock, CheckCircle2 } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './ActionsModal.css'
import { actionKey, useActionChecklist } from './actionChecklist'
import { downloadText } from '@/components/views/csv'
import { advisoryDeadline, ADVISORY_LIMITS } from './advisoryEvidence'

export default function ActionsModal() {
  const { actions, showActionsModal, setShowActionsModal } = useAeris()
  const [activeTab, setActiveTab] = useState<'sites' | 'authority'>('sites')
  const { checked, toggle } = useActionChecklist()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!showActionsModal || !actions) return
    const opener = document.activeElement as HTMLElement | null
    const background = Array.from(document.querySelectorAll<HTMLElement>('.sidebar, .main-content'))
    const priorInert = background.map(element => element.inert)
    background.forEach(element => { element.inert = true })
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setShowActionsModal(false); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]') ?? [])
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      background.forEach((element, index) => { element.inert = priorInert[index] })
      if (opener?.isConnected) opener.focus()
    }
  }, [showActionsModal, actions, setShowActionsModal])

  if (!showActionsModal || !actions) return null

  const exportAdvisory = () => {
    const lines = [
      '========================================================================',
      '               AERIS MODEL-INFORMED ADVISORY — NOT AN OFFICIAL ORDER',
      '========================================================================',
      `Issued: ${actions.generated_at}`,
      ADVISORY_LIMITS,
      `Model context: ${JSON.stringify(actions.model_context ?? { lineage_status: 'UNVERSIONED_UNKNOWN' })}`,
      '',
      'EXECUTIVE SUMMARY:',
      actions.summary,
      '',
      '------------------------------------------------------------------------',
      'SITE-SPECIFIC RECOMMENDATIONS:',
      '------------------------------------------------------------------------',
      ...actions.actions.map(
        a => `[Priority #${a.priority}] To: ${a.who}\nAction: ${a.action}\nScheduling: ${advisoryDeadline(actions, a.deadline_hours)} | Reason: ${a.reason}\n`
      ),
      '------------------------------------------------------------------------',
      'AUTHORITY RECOMMENDATIONS:',
      '------------------------------------------------------------------------',
      ...actions.authority_actions.map(
        a => `Authority: ${a.who}\nRecommendation: ${a.action}\nReason: ${a.reason}\n`
      ),
      '========================================================================',
    ]

    downloadText(`AERIS_Advisory_${new Date().toISOString().slice(0, 10)}.txt`, lines.join('\n'), 'text/plain;charset=utf-8')
  }

  return (
    <div className="modal-backdrop" onClick={() => setShowActionsModal(false)}>
      <div ref={dialogRef} className="modal-container card" role="dialog" aria-modal="true" aria-labelledby="actions-modal-title" aria-describedby="actions-modal-description" tabIndex={-1} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-icon-badge">
              <ShieldCheck size={20} color="#22734F" />
            </div>
            <div>
              <div className="modal-title-row">
                <h2 id="actions-modal-title" className="modal-title">AERIS Action Recommendations</h2>
                <span className="badge-active">Model-informed advisory</span>
              </div>
              <p id="actions-modal-description" className="modal-subtitle">Local checklist only. Marking an action sends no alert or official order. Model risk is uncalibrated. {ADVISORY_LIMITS}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            className="icon-btn modal-close-btn"
            onClick={() => setShowActionsModal(false)}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Executive Summary */}
        <div className="modal-summary-banner">
          <AlertCircle size={18} className="summary-banner-icon" />
          <div className="summary-banner-text">{actions.summary}</div>
        </div>

        {/* Navigation Tabs */}
        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'sites' ? 'active' : ''}`}
            onClick={() => setActiveTab('sites')}
            aria-pressed={activeTab === 'sites'}
          >
            Institutional Actions ({actions.actions.length})
          </button>
          <button
            className={`modal-tab ${activeTab === 'authority' ? 'active' : ''}`}
            onClick={() => setActiveTab('authority')}
            aria-pressed={activeTab === 'authority'}
          >
            Authority Recommendations ({actions.authority_actions.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="modal-body">
          {activeTab === 'sites' ? (
            <div className="actions-card-list">
              {actions.actions.map(item => {
                const id = actionKey(actions.generated_at, item)
                const isDispatched = !!checked[id]
                const isHospital = item.who.toLowerCase().includes('hospital') || item.who.toLowerCase().includes('medical')
                return (
                  <div key={id} className="action-detail-card">
                    <div className="action-card-top">
                      <div className="action-target-info">
                        <span className="action-priority-tag">#{item.priority} Priority</span>
                        <div className="action-facility-icon">
                          {isHospital ? <Building2 size={16} /> : <School size={16} />}
                        </div>
                        <span className="action-who">{item.who}</span>
                      </div>
                      <div className="action-deadline">
                        <Clock size={13} />
                        <span title={advisoryDeadline(actions, item.deadline_hours)}>Scheduling: {item.deadline_hours}h (review reference)</span>
                      </div>
                    </div>

                    <div className="action-instruction">{item.action}</div>

                    <div className="action-footer">
                      <div className="action-reason">
                        <strong>Evidence:</strong> {item.reason}
                      </div>
                      <button
                        className={`dispatch-btn ${isDispatched ? 'dispatched' : ''}`}
                        onClick={() => toggle(id)}
                        aria-pressed={isDispatched}
                      >
                        {isDispatched ? (
                          <>
                            <CheckCircle2 size={13} /> Marked locally
                          </>
                        ) : (
                          'Mark reviewed locally'
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="actions-card-list">
              {actions.authority_actions.map((item, idx) => (
                <div key={idx} className="action-detail-card authority-card">
                  <div className="action-card-top">
                    <span className="authority-name">{item.who}</span>
                    <span className="authority-scope-tag">Advisory</span>
                  </div>
                  <div className="action-instruction">{item.action}</div>
                  <div className="action-reason">
                    <strong>Jurisdiction & Trigger:</strong> {item.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="modal-footer-note">
            Snapshot: {actions.generated_at}. Use Refresh data for updates; no automatic dispatch.
          </div>
          <div className="modal-footer-actions">
            <button className="btn-secondary" onClick={exportAdvisory}>
              <Download size={14} />
              Export Advisory (TXT)
            </button>
            <button className="btn-primary" onClick={() => setShowActionsModal(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
