import { useAeris } from '@/services/dataContext'
import AgentWidget from '@/components/agent/AgentWidget'
import ActionsModal from '@/components/agent/ActionsModal'
import AqiForecast12h from '@/components/analytics/AqiForecast12h'
import RecommendedActions from '@/components/analytics/RecommendedActions'
import SourceBreakdown from '@/components/analytics/SourceBreakdown'
import WhatIfWeAct from '@/components/analytics/WhatIfWeAct'
import MetricGrid from '@/components/kpi/MetricGrid'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import MapContainer from '@/components/map/MapContainer'
import MapExplorerView from '@/components/map/MapExplorerView'
import TopAffectedAreas from '@/components/sites/TopAffectedAreas'
import AnalyticsView from '@/components/views/AnalyticsView'
import WindWeatherView from '@/components/views/WindWeatherView'
import FireSourcesView from '@/components/views/FireSourcesView'
import PopulationRiskView from '@/components/views/PopulationRiskView'
import ActionsWorkbenchView from '@/components/views/ActionsWorkbenchView'
import SettingsView from '@/components/views/SettingsView'
import './App.css'

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22734F" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2C6 8 4 13 8 17c1.5 1.5 4 2 6 2" />
          <path d="M12 2c6 6 8 11 4 15-1.5 1.5-4 2-6 2" />
          <line x1="12" y1="2" x2="12" y2="10" />
        </svg>
      </div>
      <div className="loading-title">AERIS</div>
      <div className="loading-sub">Loading real-time environmental data...</div>
      <div className="loading-bar"><div className="loading-bar-fill" /></div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="error-screen">
      <div className="error-icon">⚠️</div>
      <div className="error-title">Data Unavailable</div>
      <div className="error-msg">{message}</div>
      <div className="error-hint">
        Ensure <code>data/live/</code> snapshot files are present, or set{' '}
        <code>VITE_API_BASE_URL</code> to the live API endpoint.
      </div>
    </div>
  )
}

function Dashboard() {
  const { loading, error, activeTab } = useAeris()

  if (loading) return <LoadingScreen />
  if (error)   return <ErrorScreen message={error} />

  const isDedicatedView = ['map', 'analytics', 'wind', 'sources', 'population', 'shield', 'settings'].includes(activeTab)

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Header />
        {activeTab === 'map' && <MapExplorerView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'wind' && <WindWeatherView />}
        {activeTab === 'sources' && <FireSourcesView />}
        {activeTab === 'population' && <PopulationRiskView />}
        {activeTab === 'shield' && <ActionsWorkbenchView />}
        {activeTab === 'settings' && <SettingsView />}

        {!isDedicatedView && (
          <div className="dashboard-body">
            {/* Row 1: KPI Metrics */}
            <MetricGrid />

            {/* Row 2: 3 Columns - Map + Top Areas + Agent */}
            <div className="main-row">
              <div className="map-area">
                <MapContainer />
              </div>
              <div className="sites-area">
                <TopAffectedAreas />
              </div>
              <div className="agent-area">
                <AgentWidget />
              </div>
            </div>

            {/* Row 3: Analytics */}
            <div className="analytics-row">
              <SourceBreakdown />
              <AqiForecast12h />
              <RecommendedActions />
              <WhatIfWeAct />
            </div>
          </div>
        )}
      </div>
      <ActionsModal />
    </div>
  )
}

export default Dashboard
