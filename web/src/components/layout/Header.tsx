import {
  BarChart2,
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Map,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Users,
  Wind,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import './Header.css'
import { useAeris } from '@/services/dataContext'

export default function Header() {
  const { loading, refreshData, setFlyToLocation, setActiveTab } = useAeris()
  const [searchInput, setSearchInput] = useState('')
  const [showNotifs, setShowNotifs] = useState(false)
  const [unreadCount, setUnreadCount] = useState(3)

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

  return (
    <header className="header">
      {/* Brand */}
      <div className="header-brand">
        <div className="brand-icon">
          <Wind size={22} color="white" strokeWidth={2.2} />
        </div>
        <div className="brand-text">
          <span className="brand-name">AERIS</span>
          <span className="brand-tagline">AI Environmental Risk &amp; Intervention System</span>
          <span className="brand-sub">From pollution source to protective action.</span>
        </div>
      </div>

      {/* Search */}
      <form className="header-search" onSubmit={handleSearch}>
        <Search size={15} className="search-icon" />
        <input
          className="search-input"
          placeholder="Search for a city, location or source (e.g. Delhi, Srinagar, Leh)..."
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button className="search-btn" type="submit" aria-label="Search">
          <Search size={14} />
        </button>
      </form>

      {/* Right Controls */}
      <div className="header-right">
        <button
          className="icon-btn refresh-btn"
          onClick={refreshData}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>

        <div className="notif-wrapper">
          <button
            className="icon-btn notif-btn"
            aria-label="Notifications"
            onClick={() => setShowNotifs(!showNotifs)}
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

        <div className="user-profile">
          <div className="user-avatar">
            <Users size={15} color="white" />
          </div>
          <div className="user-info">
            <span className="user-name">Saba Saeed</span>
            <span className="user-role">Environmental Officer</span>
          </div>
          <ChevronDown size={14} className="user-chevron" />
        </div>
      </div>
    </header>
  )
}

// ─── Quick nav icons for sidebar use ─────────────────────────────────────────
export const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'map',       icon: Map,             label: 'Map Explorer' },
  { id: 'analytics', icon: BarChart2,       label: 'Analytics' },
  { id: 'wind',      icon: Wind,            label: 'Wind & Weather' },
  { id: 'sources',   icon: Zap,             label: 'Fire Sources' },
  { id: 'population',icon: Users,           label: 'Population Risk' },
  { id: 'shield',    icon: Shield,          label: 'Protective Actions' },
  { id: 'settings',  icon: Settings,        label: 'Settings' },
  { id: 'logout',    icon: LogOut,          label: 'Logout' },
]
