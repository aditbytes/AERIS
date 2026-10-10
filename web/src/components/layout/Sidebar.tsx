import {
  BarChart2,
  LayoutDashboard,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Users,
  Wind,
  Zap,
} from 'lucide-react'
import { useAeris } from '@/services/dataContext'
import './Sidebar.css'

interface NavItemConfig {
  id: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  shortcut: string
  badgeText?: string
  badgeKey?: 'fires' | 'facilities' | 'actions' | 'wind'
  badgeType?: 'primary' | 'warning' | 'alert' | 'neutral'
}

interface NavSectionConfig {
  section: string
  items: NavItemConfig[]
}

const SECTIONS: NavSectionConfig[] = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '1' },
      { id: 'map', label: 'Map Explorer', icon: Map, shortcut: '2', badgeText: 'GIS', badgeType: 'neutral' },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart2, shortcut: '3' },
      { id: 'wind', label: 'Wind & Weather', icon: Wind, shortcut: '4', badgeKey: 'wind', badgeType: 'neutral' },
      { id: 'sources', label: 'Fire Sources', icon: Zap, shortcut: '5', badgeKey: 'fires', badgeType: 'alert' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { id: 'population', label: 'Population Risk', icon: Users, shortcut: '6', badgeKey: 'facilities', badgeType: 'warning' },
      { id: 'shield', label: 'Protective Actions', icon: Shield, shortcut: '7', badgeKey: 'actions', badgeType: 'primary' },
    ],
  },
  {
    section: 'System',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings, shortcut: '8' },
    ],
  },
]

export default function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    isSidebarCollapsed,
    toggleSidebar,
    setSidebarCollapsed,
    sources,
    rankedSites,
    actions,
    wind,
  } = useAeris()

  // Compute live badge values from scientific data
  const getBadgeValue = (item: NavItemConfig): string | null => {
    if (item.badgeText) return item.badgeText
    if (item.badgeKey === 'fires') {
      const count = sources?.sources?.length
      return count != null ? `${count}` : '—'
    }
    if (item.badgeKey === 'facilities') {
      const count = rankedSites?.sites?.length
      return count != null ? `${count}` : '—'
    }
    if (item.badgeKey === 'actions') {
      const count = actions?.actions?.length
      return count != null ? `${count}` : '—'
    }
    if (item.badgeKey === 'wind') {
      const firstSpeedMs = wind?.points?.[0]?.hours?.[0]?.speed_ms
      return firstSpeedMs != null ? `${Math.round(firstSpeedMs * 3.6)} km/h` : null
    }
    return null
  }

  return (
    <aside
      className={`sidebar ${isSidebarCollapsed ? 'collapsed' : 'expanded'}`}
      aria-label="Main Navigation"
    >
      {/* Top Brand / Logo Row */}
      <div className="sidebar-brand-container">
        <button
          className="sidebar-brand-btn"
          onClick={() => setActiveTab('dashboard')}
          aria-label="Go to AERIS Dashboard"
          title="Go to AERIS Dashboard"
          type="button"
        >
          <div className="brand-logo-icon">
            <Wind size={20} color="white" strokeWidth={2.4} />
          </div>
          {!isSidebarCollapsed && (
            <div className="brand-title-wrap">
              <div className="brand-title-line">
                <span className="brand-main-title">AERIS</span>
              </div>
              <span className="brand-sub-title">Environmental Risk AI</span>
            </div>
          )}
        </button>

        {!isSidebarCollapsed && (
          <button
            className="sidebar-collapse-toggle-icon"
            onClick={toggleSidebar}
            title="Collapse Sidebar (⌘B)"
            aria-label="Collapse Sidebar"
            type="button"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-nav-scrollable">
        {SECTIONS.map((section) => (
          <div key={section.section} className="sidebar-section-group">
            {!isSidebarCollapsed && (
              <div className="sidebar-section-title">{section.section}</div>
            )}

            <ul className="sidebar-section-list">
              {section.items.map((item) => {
                const isActive = activeTab === item.id
                const badge = getBadgeValue(item)

                return (
                  <li
                    key={item.id}
                    className="sidebar-item-wrapper"
                  >
                    <button
                      id={`nav-${item.id}`}
                      data-nav-id={item.id}
                      className={`sidebar-nav-item-btn ${isActive ? 'active' : ''}`}
                      onClick={() => { setActiveTab(item.id); if (window.innerWidth < 768) setSidebarCollapsed(true) }}
                      aria-label={item.label}
                      title={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      type="button"
                    >
                      <div className="btn-icon-wrapper">
                        <item.icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
                        {isSidebarCollapsed && badge && (
                          <span
                            className={`collapsed-alert-dot dot-${item.badgeType ?? 'neutral'}`}
                          />
                        )}
                      </div>

                      {!isSidebarCollapsed && (
                        <>
                          <span className="btn-label-text">{item.label}</span>
                          {badge && (
                            <span
                              className={`nav-badge-pill badge-${item.badgeType ?? 'neutral'}`}
                            >
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                    </button>

                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Footer & Expand Toggle */}
      <div className="sidebar-footer-container">
        {!isSidebarCollapsed ? (
          <div className="sidebar-expanded-footer">
            <div className="footer-status-row">
              <span className="footer-status-dot" />
              <span className="footer-status-label">Read-only data dashboard</span>
            </div>
            <button
              className="collapse-action-btn"
              onClick={toggleSidebar}
              title="Collapse Sidebar (⌘B)"
              type="button"
            >
              <PanelLeftClose size={16} />
              <span>Collapse Sidebar</span>
              <kbd className="sidebar-kbd">⌘B</kbd>
            </button>
          </div>
        ) : (
          <button
            className="sidebar-expand-action-btn"
            onClick={toggleSidebar}
            title="Expand Sidebar (⌘B)"
            aria-label="Expand Sidebar"
            type="button"
          >
            <PanelLeftOpen size={19} />
          </button>
        )}
      </div>
    </aside>
  )
}
