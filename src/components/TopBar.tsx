import { Columns2, Database, Globe2, Users, type LucideIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

// the site's pages, the same set as the landing page's menu (the KURO moon at the top is Home)
const PAGES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/explorer', label: 'Explorer', icon: Globe2 },
  { to: '/compare', label: 'Compare', icon: Columns2 },
  { to: '/data', label: 'Data', icon: Database },
  { to: '/about', label: 'About us', icon: Users },
]

/**
 * The workspace's main navigation: a slim vertical rail of icons on the left (a bar along the bottom on phones).
 * Each icon shows its page name in a floating tag on hover or keyboard focus, and carries it as its accessible name.
 */
export function TopBar() {
  return (
    <nav className="rail" aria-label="Primary">
      <Link to="/" className="rail-item rail-home" aria-label="Home">
        <svg width={24} height={24} viewBox="0 0 32 32" aria-hidden="true"><path d="M21.5 4.2A13 13 0 1 0 27.8 21 10.5 10.5 0 1 1 21.5 4.2Z" fill="var(--sun)" /></svg>
        <span className="rail-tip" aria-hidden="true">Home</span>
      </Link>
      <div className="rail-pages">
        {PAGES.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="rail-item" aria-label={label}>
            <Icon size={19} strokeWidth={1.5} aria-hidden="true" />
            <span className="rail-tip" aria-hidden="true">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
