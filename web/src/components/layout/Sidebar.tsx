import { useAeris } from '@/services/dataContext'
import { NAV_ITEMS } from './Header'
import './Sidebar.css'

export default function Sidebar() {
  const { activeTab, setActiveTab } = useAeris()

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <ul className="sidebar-nav">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id
          return (
            <li key={id}>
              <button
                id={`nav-${id}`}
                data-nav-id={id}
                className={`sidebar-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (id !== 'logout') {
                    setActiveTab(id)
                  }
                }}
                title={label}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
