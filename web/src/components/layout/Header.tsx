import { Bell, PanelLeft, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './Header.css'
import { useAeris } from '@/services/dataContext'
import { DATA_MODE, getFeedFreshness } from '@/services/api'

const TAB_META: Record<string, { label: string; subtitle: string }> = {
  dashboard: { label: 'Dashboard', subtitle: 'Observed & modelled data' },
  map: { label: 'Map Explorer', subtitle: 'GIS spatial analysis' },
  analytics: { label: 'Analytics & Trends', subtitle: 'Uncalibrated model outputs' },
  wind: { label: 'Wind & Meteorology', subtitle: 'Forecast grid' },
  sources: { label: 'Source Candidates', subtitle: 'Satellite thermal detections' },
  population: { label: 'Population Risk Registry', subtitle: 'Heuristic facility ranking' },
  shield: { label: 'Protective Actions', subtitle: 'Advisory checklist' },
  settings: { label: 'System Settings', subtitle: 'Configuration & data state' },
}

const PLACES: Record<string, { lon: number; lat: number; zoom: number; name: string }> = {
  delhi: { lon: 77.2090, lat: 28.6139, zoom: 10, name: 'Delhi NCR' },
  ncr: { lon: 77.2090, lat: 28.6139, zoom: 10, name: 'Delhi NCR' },
  chandigarh: { lon: 76.7794, lat: 30.7333, zoom: 10.5, name: 'Chandigarh' },
  amritsar: { lon: 74.8723, lat: 31.6340, zoom: 11, name: 'Amritsar' },
  ludhiana: { lon: 75.8573, lat: 30.9010, zoom: 10.8, name: 'Ludhiana' },
  patiala: { lon: 76.3869, lat: 30.3398, zoom: 11, name: 'Patiala' },
  karnal: { lon: 76.9897, lat: 29.6857, zoom: 11, name: 'Karnal' },
  faridabad: { lon: 77.3178, lat: 28.4089, zoom: 11, name: 'Faridabad' },
  srinagar: { lon: 74.7973, lat: 34.0837, zoom: 10.5, name: 'Srinagar' },
  jammu: { lon: 74.8570, lat: 32.7266, zoom: 10.5, name: 'Jammu' },
  ladakh: { lon: 77.5771, lat: 34.1526, zoom: 10.5, name: 'Leh' },
  leh: { lon: 77.5771, lat: 34.1526, zoom: 10.5, name: 'Leh' },
  kashmir: { lon: 75.3, lat: 33.7, zoom: 8.5, name: 'Jammu & Kashmir' },
  punjab: { lon: 75.4, lat: 31, zoom: 8.5, name: 'Punjab' },
  haryana: { lon: 76.5, lat: 29.5, zoom: 8.5, name: 'Haryana' },
  india: { lon: 78.9, lat: 23.5, zoom: 4.2, name: 'India' },
}

export default function Header() {
  const { loading, refreshing, refreshData, setFlyToLocation, activeTab, setActiveTab, isSidebarCollapsed,
    toggleSidebar, sources, corridor, actions, rankedSites, aqi, wind, staleFeeds } = useAeris()
  const [searchInput, setSearchInput] = useState('')
  const [searchFeedback, setSearchFeedback] = useState('')
  const [showNotifs, setShowNotifs] = useState(false)
  const [now, setNow] = useState(Date.now)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const notifButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape' && showNotifs) {
        setShowNotifs(false)
        notifButtonRef.current?.focus()
      }
    }
    const handlePointer = (event: PointerEvent) => {
      if (!notifRef.current?.contains(event.target as Node)) setShowNotifs(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointer)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointer)
    }
  }, [showNotifs])

  const feeds = [
    ['sources', sources?.generated_at], ['corridor', corridor?.generated_at], ['actions', actions?.generated_at],
    ['ranked_sites', rankedSites?.generated_at], ['aqi', aqi?.generated_at], ['wind', wind?.generated_at],
  ].map(([label, timestamp]) => getFeedFreshness(label!, timestamp, now, staleFeeds.some(feed => feed.label === label)))
  const problems = feeds.filter(feed => feed.status !== 'current')
  const statusText = loading ? 'Loading data' : problems.length > 0 ? `${problems.length} feeds stale / unavailable` : 'Recent data'
  const modeLabel = DATA_MODE === 'snapshot' ? 'Snapshot' : 'API'
  const currentMeta = TAB_META[activeTab] ?? TAB_META.dashboard

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const query = searchInput.trim().toLowerCase()
    if (!query) { setSearchFeedback('Enter a place, facility name, or source ID.'); return }
    const site = rankedSites?.sites.find(item => item.name.toLowerCase().includes(query) || item.site_id.toLowerCase() === query)
    const source = sources?.sources.find(item => item.id.toLowerCase() === query || item.district?.toLowerCase().includes(query) || item.location_name?.toLowerCase().includes(query))
    const place = PLACES[query] ?? Object.entries(PLACES).find(([key]) => query.split(/\s+/).includes(key))?.[1]
    const target = site ? { lon: site.lon, lat: site.lat, zoom: 12, name: site.name }
      : source ? { lon: source.lon, lat: source.lat, zoom: 11, name: source.id } : place
    if (!target) { setSearchFeedback(`No matching place, facility, or source for “${searchInput.trim()}”.`); return }
    setFlyToLocation(target)
    setActiveTab('map')
    setSearchFeedback(`Showing ${target.name}.`)
    setSearchInput('')
  }

  return (
    <header className="header">
      <div className="header-left">
        {isSidebarCollapsed && <button className="header-sidebar-toggle-btn" onClick={toggleSidebar} aria-label="Expand Sidebar" type="button"><PanelLeft size={18} /></button>}
        <div className="header-title-wrap">
          <h1 className="header-view-title">{currentMeta.label}</h1>
          <span className="header-view-subtitle-pill">{currentMeta.subtitle}</span>
        </div>
      </div>
      <div className="header-center">
        <form className="header-search" onSubmit={handleSearch}>
          <Search size={15} className="search-icon" aria-hidden="true" />
          <input ref={searchInputRef} className="search-input" placeholder="Place, facility, or source ID" aria-label="Search place, facility, or source ID" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          <button type="submit" className="header-search-submit" aria-label="Search map">Search</button>
        </form>
        {searchFeedback && <p className="header-search-feedback" role="status">{searchFeedback}</p>}
      </div>
      <div className="header-right">
        <div className={`live-status-chip ${problems.length ? 'stale' : 'live'}`} title={`${modeLabel}: ${statusText}`}>
          <span className="live-status-text">{modeLabel} · {statusText}</span>
        </div>
        <button className="icon-btn refresh-btn" onClick={refreshData} disabled={loading || refreshing} title="Refresh environmental data" aria-label="Refresh data" type="button"><RefreshCw size={16} className={loading || refreshing ? 'spinning' : ''} /></button>
        <div className="notif-wrapper" ref={notifRef}>
          <button ref={notifButtonRef} className="icon-btn notif-btn" aria-label="Data feed status" aria-expanded={showNotifs} aria-controls="feed-status-panel" onClick={() => setShowNotifs(value => !value)} type="button"><Bell size={17} /></button>
          {showNotifs && <section id="feed-status-panel" className="notif-dropdown" aria-label="Data feed status">
            <div className="notif-dropdown-header"><span className="notif-title">Data feed status · {modeLabel}</span></div>
            <ul className="notif-list">
              {feeds.map(feed => <li className="notif-item" key={feed.label}><div className="notif-content"><strong className="notif-headline">{feed.label.replace('_', ' ')}: {feed.status}</strong><span className="notif-desc">{feed.generatedAt ?? 'Timestamp unavailable'}{feed.reason ? ` · ${feed.reason}` : ''}</span></div></li>)}
            </ul>
          </section>}
        </div>
        <div className="officer-session-chip" title="Local dashboard; no authenticated officer or dispatch service">
          <div className="officer-avatar-badge"><ShieldCheck size={14} color="#059669" /></div>
          <div className="officer-meta"><span className="officer-desk-title">AERIS Dashboard</span><span className="officer-session-tag">Local read-only session</span></div>
        </div>
      </div>
    </header>
  )
}
