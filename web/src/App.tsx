import { lazy, Suspense } from 'react'
import { useAeris } from '@/services/dataContext'
import AgentWidget from '@/components/agent/AgentWidget'
import AqiForecast12h from '@/components/analytics/AqiForecast12h'
import RecommendedActions from '@/components/analytics/RecommendedActions'
import SourceBreakdown from '@/components/analytics/SourceBreakdown'
import WhatIfWeAct from '@/components/analytics/WhatIfWeAct'
import MetricGrid from '@/components/kpi/MetricGrid'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import MapContainer from '@/components/map/MapContainer'
import TopAffectedAreas from '@/components/sites/TopAffectedAreas'
import './App.css'

// Lazy-loaded non-dashboard views for route-level code splitting
const MapExplorerView = lazy(() => import('@/components/map/MapExplorerView'))
const AnalyticsView = lazy(() => import('@/components/views/AnalyticsView'))
const WindWeatherView = lazy(() => import('@/components/views/WindWeatherView'))
const FireSourcesView = lazy(() => import('@/components/views/FireSourcesView'))
const PopulationRiskView = lazy(() => import('@/components/views/PopulationRiskView'))
const ActionsWorkbenchView = lazy(() => import('@/components/views/ActionsWorkbenchView'))
const SettingsView = lazy(() => import('@/components/views/SettingsView'))
const ActionsModal = lazy(() => import('@/components/agent/ActionsModal'))

function ViewSkeleton() {
  return (
    <div className="view-skeleton-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="skeleton-box" style={{ height: '40px', width: '280px', borderRadius: '8px' }} />
      <div className="skeleton-box" style={{ height: '540px', width: '100%', borderRadius: '12px' }} />
    </div>
  )
}

function SkeletonDashboard() {
  return (
    <div className="dashboard-body skeleton-mode">
      {/* KPI Skeleton Row */}
      <div className="kpi-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card skeleton-card" style={{ height: '110px' }}>
            <div className="skeleton-box" style={{ width: '40%', height: '14px', marginBottom: '12px' }} />
            <div className="skeleton-box" style={{ width: '60%', height: '28px', marginBottom: '10px' }} />
            <div className="skeleton-box" style={{ width: '80%', height: '12px' }} />
          </div>
        ))}
      </div>

      {/* Main Map + Agent Row */}
      <div className="main-row">
        <div className="map-area">
          <div className="card skeleton-card" style={{ height: '440px', width: '100%' }}>
            <div className="skeleton-box" style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
        <div className="agent-area">
          <div className="card skeleton-card" style={{ height: '440px', width: '100%' }}>
            <div className="skeleton-box" style={{ width: '50%', height: '20px', marginBottom: '16px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '80px', marginBottom: '12px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '180px' }} />
          </div>
        </div>
      </div>

      {/* Analytics Row */}
      <div className="analytics-row-3col">
        {[1, 2, 3].map(i => (
          <div key={i} className="card skeleton-card" style={{ height: '220px' }}>
            <div className="skeleton-box" style={{ width: '50%', height: '16px', marginBottom: '14px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '140px' }} />
          </div>
        ))}
      </div>

      {/* Receptors Row */}
      <div className="receptors-row-2col">
        {[1, 2].map(i => (
          <div key={i} className="card skeleton-card" style={{ height: '260px' }}>
            <div className="skeleton-box" style={{ width: '40%', height: '16px', marginBottom: '14px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '180px' }} />
          </div>
        ))}
      </div>
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

  if (error) return <ErrorScreen message={error} />

  const isDedicatedView = ['map', 'analytics', 'wind', 'sources', 'population', 'shield', 'settings'].includes(activeTab)

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Header />

        <Suspense fallback={<ViewSkeleton />}>
          {activeTab === 'map' && <MapExplorerView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'wind' && <WindWeatherView />}
          {activeTab === 'sources' && <FireSourcesView />}
          {activeTab === 'population' && <PopulationRiskView />}
          {activeTab === 'shield' && <ActionsWorkbenchView />}
          {activeTab === 'settings' && <SettingsView />}
        </Suspense>

        {!isDedicatedView && (
          loading ? (
            <SkeletonDashboard />
          ) : (
            <div className="dashboard-body">
              {/* Row 1: KPI Metrics */}
              <MetricGrid />

              {/* Row 2: 2 Columns - Expanded Map (span 3) + Agent (span 1) */}
              <div className="main-row">
                <div className="map-area">
                  <MapContainer />
                </div>
                <div className="agent-area">
                  <AgentWidget />
                </div>
              </div>

              {/* Row 3: 3 tabs in a row - Environmental & Forecasting Analytics */}
              <div className="analytics-row-3col">
                <SourceBreakdown />
                <AqiForecast12h />
                <WhatIfWeAct />
              </div>

              {/* Row 4: Top Affected Areas and Recommended Actions in the row below */}
              <div className="receptors-row-2col">
                <TopAffectedAreas />
                <RecommendedActions />
              </div>
            </div>
          )
        )}
      </div>

      <Suspense fallback={null}>
        <ActionsModal />
      </Suspense>
    </div>
  )
}

export default Dashboard
