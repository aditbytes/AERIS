import {
  Bell,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeft,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  User,
  Wind,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './Header.css'
import { useAeris } from '@/services/dataContext'

const TAB_META: Record<string, { section: string; label: string }> = {
  dashboard:  { section: 'Overview',     label: 'Dashboard' },
  map:        { section: 'Overview',     label: 'Map Explorer' },
  analytics:  { section: 'Intelligence', label: 'Analytics & Trends' },
  wind:       { section: 'Intelligence', label: 'Wind & Meteorology' },
  sources:    { section: 'Intelligence', label: 'Fire Sources (VIIRS)' },
  population: { section: 'Operations',   label: 'Population Risk Registry' },
  shield:     { section: 'Operations',   label: 'Protective Actions' },
  settings:   { section: 'System',       label: 'System Settings' },
}

export default function Header() {
  const {
    loading,
    refreshData,
    setFlyToLocation,
    activeTab,
    setActiveTab,
    toggleSidebar,
    wind,
    avgAqi,
  } = useAeris()

  const [searchInput, setSearchInput] = useState('')
  const [showNotifs, setShowNotifs] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [unreadCount, setUnreadCount] = useState(3)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Listen for Cmd+K / Ctrl+K to auto-focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim().toLowerCase()
    if (!q) return

    const targets: Record<string, { lon: number; lat: number; zoom: number; name: string }> = {
      delhi:      { lon: 77.2090, lat: 28.6139, zoom: 10.0, name: 'Delhi NCR' },
      ncr:        { lon: 77.2090, lat: 28.6139, zoom: 10.0, name: 'Delhi NCR' },
      chandigarh: { lon: 76.7794, lat: 30.7333, zoom: 10.5, name: 'Chandigarh' },
      amritsar:   { lon: 74.8723, lat: 31.6340, zoom: 11.0, name: 'Amritsar' },
      ludhiana:   { lon: 75.8573, lat: 30.9010, zoom: 10.8, name: 'Ludhiana' },
      patiala:    { lon: 76.3869, lat: 30.3398, zoom: 11.0, name: 'Patiala' },
      karnal:     { lon: 76.9897, lat: 29.6857, zoom: 11.0, name: 'Karnal' },
      faridabad:  { lon: 77.3178, lat: 28.4089, zoom: 11.2, name: 'Faridabad' },
      srinagar:   { lon: 74.7973, lat: 34.0837, zoom: 10.5, name: 'Srinagar (J&K)' },
      jammu:      { lon: 74.8570, lat: 32.7266, zoom: 10.5, name: 'Jammu (J&K)' },
      ladakh:     { lon: 77.5771, lat: 34.1526, zoom: 10.5, name: 'Leh (Ladakh)' },
      leh:        { lon: 77.5771, lat: 34.1526, zoom: 10.5, name: 'Leh (Ladakh)' },
      pok:        { lon: 74.3036, lat: 35.9221, zoom: 9.5,  name: 'Gilgit (PoK)' },
      kashmir:    { lon: 75.3000, lat: 33.7000, zoom: 8.5,  name: 'Jammu & Kashmir' },
      punjab:     { lon: 75.4000, lat: 31.0000, zoom: 8.5,  name: 'Punjab' },
      haryana:    { lon: 76.5000, lat: 29.5000, zoom: 8.5,  name: 'Haryana' },
      india:      { lon: 78.9000, lat: 23.5000, zoom: 4.2,  name: 'India' },
    }

    const matchedKey = Object.keys(targets).find(k => q.includes(k) || k.includes(q))
    if (matchedKey) {
      const target = targets[matchedKey]
      setFlyToLocation(target)
      setActiveTab('map')
      setSearchInput('')
    }
  }

  const currentMeta = TAB_META[activeTab] ?? { section: 'Overview', label: 'Dashboard' }
  const firstSpeedMs = wind?.points?.[0]?.hours?.[0]?.speed_ms
  const windText = firstSpeedMs != null ? `${Math.round(firstSpeedMs * 3.6)} km/h` : '18 km/h'
  const aqiVal = avgAqi ?? 382

  return (
    <header className="header">
      {/* Left: Sidebar Toggle + Breadcrumb */}
      <div className="header-left">
        <button
          className="header-sidebar-toggle-btn"
          onClick={toggleSidebar}
          title="Toggle Sidebar (⌘B)"
          aria-label="Toggle Navigation Sidebar"
          type="button"
        >
          <PanelLeft size={18} />
        </button>

        <div className="header-breadcrumbs">
          <button
            className="breadcrumb-root-btn"
            onClick={() => setActiveTab('dashboard')}
            title="AERIS Main"
            type="button"
          >
            AERIS
          </button>
          <ChevronRight size={13} className="breadcrumb-separator" />
          <span className="breadcrumb-section">{currentMeta.section}</span>
          <ChevronRight size={13} className="breadcrumb-separator" />
          <span className="breadcrumb-active">{currentMeta.label}</span>
        </div>
      </div>

      {/* Center: Live Environmental Status Ticker */}
      <div className="header-center-ticker">
        <div className="live-status-pill" title="Live meteorological and CAQM statutory alert status">
          <span className="status-live-dot" />
          <span className="ticker-item">
            <strong>GFS Wind:</strong> {windText} NW → SE
          </span>
          <span className="ticker-divider">•</span>
          <span className="ticker-item">
            <strong>CAQM:</strong> GRAP IV Active
          </span>
          <span className="ticker-divider">•</span>
          <span className="ticker-item aqi-highlight">
            <strong>Avg AQI:</strong> {aqiVal}
          </span>
        </div>
      </div>

      {/* Right Controls: Search + Refresh + Alerts + Profile */}
      <div className="header-right">
        {/* Search */}
        <form className="header-search" onSubmit={handleSearch}>
          <Search size={14} className="search-icon" />
          <input
            ref={searchInputRef}
            className="search-input"
            placeholder="Search location (e.g. Delhi, Leh)..."
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <kbd className="search-kbd" title="Press ⌘K to search">⌘K</kbd>
        </form>

        <button
          className="icon-btn refresh-btn"
          onClick={refreshData}
          title="Refresh live environmental data"
          aria-label="Refresh data"
          type="button"
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>

        {/* Notifications Hub */}
        <div className="notif-wrapper">
          <button
            className="icon-btn notif-btn"
            aria-label="Notifications"
            onClick={() => {
              setShowNotifs(!showNotifs)
              setShowProfileMenu(false)
            }}
            type="button"
          >
            <Bell size={17} />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>

          {showNotifs && (
            <div className="notif-dropdown">
              <div className="notif-dropdown-header">
                <span className="notif-title">Active Environmental Alerts</span>
                <button
                  className="notif-mark-read"
                  onClick={() => setUnreadCount(0)}
                  type="button"
                >
                  Mark all as read
                </button>
              </div>
              <div className="notif-list">
                <div
                  className="notif-item alert"
                  onClick={() => {
                    setActiveTab('sources')
                    setShowNotifs(false)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="notif-dot alert" />
                  <div className="notif-content">
                    <span className="notif-headline">🚨 High Stubble Cluster Detected</span>
                    <p className="notif-desc">VIIRS detected 676 MW cluster in Sangrur, Punjab with 36 active fire pixels.</p>
                    <span className="notif-time">15 mins ago • NASA FIRMS</span>
                  </div>
                </div>

                <div
                  className="notif-item warning"
                  onClick={() => {
                    setActiveTab('wind')
                    setShowNotifs(false)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="notif-dot warning" />
                  <div className="notif-content">
                    <span className="notif-headline">⚠️ Nocturnal Inversion Warning</span>
                    <p className="notif-desc">Boundary layer height (PBLH) dropping below 150m tonight; extreme pollutant trapping expected.</p>
                    <span className="notif-time">32 mins ago • Open-Meteo GFS</span>
                  </div>
                </div>

                <div
                  className="notif-item notice"
                  onClick={() => {
                    setActiveTab('shield')
                    setShowNotifs(false)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="notif-dot notice" />
                  <div className="notif-content">
                    <span className="notif-headline">📋 CAQM GRAP Stage IV Active</span>
                    <p className="notif-desc">Mandatory heavy truck diversions and indoor school protocols enforced across NCR.</p>
                    <span className="notif-time">1 hour ago • Statutory Order</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="user-profile-wrapper">
          <div
            className="user-profile"
            onClick={() => {
              setShowProfileMenu(!showProfileMenu)
              setShowNotifs(false)
            }}
            role="button"
            tabIndex={0}
          >
            <div className="user-avatar">
              <User size={15} color="white" />
            </div>
            <div className="user-info">
              <span className="user-name">Saba Saeed</span>
              <span className="user-role">Environmental Officer</span>
            </div>
            <ChevronDown size={14} className="user-chevron" />
          </div>

          {showProfileMenu && (
            <div className="profile-dropdown-menu">
              <div className="profile-menu-header">
                <span className="menu-name">Saba Saeed</span>
                <span className="menu-email">sabasaid826@gmail.com</span>
                <span className="menu-badge">
                  <ShieldCheck size={12} /> Officer Clearance
                </span>
              </div>
              <div className="profile-menu-items">
                <button
                  className="profile-menu-item"
                  onClick={() => {
                    setActiveTab('settings')
                    setShowProfileMenu(false)
                  }}
                  type="button"
                >
                  <Settings size={15} />
                  <span>System Settings</span>
                </button>
                <button
                  className="profile-menu-item danger"
                  onClick={() => setShowProfileMenu(false)}
                  type="button"
                >
                  <LogOut size={15} />
                  <span>End Session</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

