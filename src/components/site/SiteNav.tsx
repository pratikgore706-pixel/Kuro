import { Link, NavLink } from 'react-router-dom'
import { Brand } from '../Brand'
import { SITE_NAV } from './nav'

/** Top navigation for the site pages — same look as the landing hero's nav. */
export function SiteNav() {
  return (
    <header className="snav">
      <Link to="/" className="snav-brand" aria-label="KURO home"><Brand size={20} /></Link>
      <nav aria-label="Primary">
        {SITE_NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>)}
      </nav>
    </header>
  )
}
