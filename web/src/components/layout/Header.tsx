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
import './Header.css'
import { useAeris } from '@/services/dataContext'

export default function Header() {
  const { loading, refreshData } = useAeris()

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
      <div className="header-search">
        <Search size={15} className="search-icon" />
        <input
          className="search-input"
          placeholder="Search for a city, location or source..."
          type="text"
        />
        <button className="search-btn" aria-label="Search">
          <Search size={14} />
        </button>
      </div>

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

        <button className="icon-btn notif-btn" aria-label="Notifications">
          <Bell size={17} />
          <span className="notif-badge">3</span>
        </button>

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
