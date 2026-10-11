import { Building, Clock, Download, FileText, Printer, Shield, Truck } from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import { actionKey, useActionChecklist } from '@/components/agent/actionChecklist'
import { buildCsv, downloadText } from './csv'
import './ActionsWorkbenchView.css'
import { advisoryDeadline } from '@/components/agent/advisoryEvidence'

export default function ActionsWorkbenchView() {
  const { actions } = useAeris()
  const { checked, toggle, setMany, clear } = useActionChecklist()
  const siteActions = actions?.actions ?? []
  const authorityActions = actions?.authority_actions ?? []
  const ids = [...siteActions, ...authorityActions].map(action => actionKey(actions?.generated_at, action))
  const completed = ids.filter(id => checked[id]).length
  const percent = ids.length ? Math.round(completed / ids.length * 100) : 0

  const exportCsv = () => {
    const rows = [...siteActions, ...authorityActions].map(action => [
      'site_id' in action ? String(action.site_id) : 'Authority', action.who, action.action, action.reason,
      'deadline_hours' in action ? advisoryDeadline(actions, Number(action.deadline_hours)) : null,
      checked[actionKey(actions?.generated_at, action)] ? 'MARKED LOCALLY' : 'UNMARKED',
    ])
    downloadText(`AERIS_Recommendations_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(['Site', 'Recipient', 'Recommendation', 'Rationale', 'Scheduling value and declared reference (not a live countdown)', 'Local Checklist'], rows))
  }

  return (
    <div className="actions-workbench-view">
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-badge"><Shield size={14} /><span>Model-informed advisory</span></div>
          <h1 className="view-title">Protective Actions &amp; Local Checklist</h1>
          <p className="view-subtitle">Recommendations require human review. This dashboard does not establish legal orders, send alerts, or confirm real-world completion.</p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer size={15} /><span>Print Advisory</span></button>
          <button type="button" className="btn-primary" onClick={exportCsv} disabled={!actions}><Download size={15} /><span>Export Recommendations CSV</span></button>
        </div>
      </div>
      <div className="grap-banner">
        <div className="grap-text"><span className="grap-level">LOCAL REVIEW STATUS</span><span className="grap-desc">Uncalibrated model risk informs these recommendations. No current GRAP stage or statutory enforcement order is supplied by the data contract.</span></div>
        <div className="grap-progress-box">
          <div className="progress-labels"><span>Checklist:</span><strong>{completed} of {ids.length} marked locally ({percent}%)</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Recommendations marked locally" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
        </div>
      </div>
      {!actions && <p role="status">Action recommendations unavailable.</p>}
      {actions && ids.length === 0 && <p role="status">No action recommendations in this snapshot.</p>}
      <section className="authorities-section">
        <div className="section-header">
          <div className="sec-title-group"><Truck size={18} /><h2>Authority Recommendations</h2></div>
          <div className="sec-actions"><button type="button" className="btn-text" onClick={() => setMany(ids, true)} disabled={!ids.length}>Mark All Locally</button><button type="button" className="btn-text" onClick={clear}>Reset Local Checklist</button></div>
        </div>
        <div className="authorities-grid">
          {authorityActions.map(action => {
            const id = actionKey(actions?.generated_at, action), done = !!checked[id]
            return <div key={id} className={`auth-card ${done ? 'done' : ''}`}>
              <label className="auth-card-top"><span className="auth-who">{action.who}</span><input type="checkbox" checked={done} onChange={() => toggle(id)} className="auth-checkbox" aria-label={`Mark recommendation for ${action.who} locally`} /></label>
              <div className="auth-action-text">{action.action}</div><div className="auth-reason">{action.reason}</div>
              <div className="auth-card-footer"><span className={`status-pill ${done ? 'dispatched' : 'pending'}`}>{done ? 'Marked locally' : 'Unmarked'}</span></div>
            </div>
          })}
        </div>
      </section>
      <section className="facilities-section">
        <div className="section-header"><div className="sec-title-group"><Building size={18} /><h2>Facility Recommendations</h2></div></div>
        <div className="facility-directives-list">
          {siteActions.map(action => {
            const id = actionKey(actions?.generated_at, action), done = !!checked[id]
            return <div key={id} className={`fac-directive-row ${done ? 'done' : ''}`}>
              <label className="fac-check-col"><input type="checkbox" checked={done} onChange={() => toggle(id)} className="auth-checkbox" aria-label={`Mark recommendation for ${action.who} locally`} /><span className="fac-priority">Priority #{action.priority}</span></label>
              <div className="fac-main-col"><div className="fac-who-row"><strong>{action.who}</strong><span className="fac-eta-badge" title={advisoryDeadline(actions, action.deadline_hours)}><Clock size={12} /> Scheduling: {action.deadline_hours}h (review reference)</span></div><div className="fac-action-stmt">{action.action}</div><div className="fac-reason-stmt">{action.reason}</div></div>
              <div className="fac-status-col"><span className={`status-pill ${done ? 'dispatched' : 'pending'}`}>{done ? 'Marked locally' : 'Unmarked'}</span></div>
            </div>
          })}
        </div>
      </section>
      {actions?.summary && <section className="agent-brief-panel"><div className="brief-header"><FileText size={16} /><h3>Generated Advisory Brief</h3></div><div className="brief-content">{actions.summary}</div><p className="panel-sub">Generated: {actions.generated_at}</p></section>}
    </div>
  )
}
