import { useState } from 'react'
import { NAV_ITEMS } from './Header'
import './Sidebar.css'

export default function Sidebar() {
  const [active, setActive] = useState('dashboard')

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <ul className="sidebar-nav">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <li key={id}>
            <button
              className={`sidebar-btn ${active === id ? 'active' : ''}`}
              onClick={() => setActive(id)}
              title={label}
              aria-label={label}
              aria-current={active === id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={active === id ? 2.4 : 1.8} />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
