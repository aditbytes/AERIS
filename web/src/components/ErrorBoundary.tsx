import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <section className="error-screen" role="alert"><h2>View unavailable</h2><p>The view could not be loaded. Choose another view or retry.</p><button type="button" className="btn-primary" onClick={() => window.location.reload()}>Retry view</button></section> : this.props.children
  }
}
