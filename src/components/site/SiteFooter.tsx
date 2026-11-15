import { Link } from 'react-router-dom'
import { Brand } from '../Brand'
import { SITE_NAV } from './nav'

/** Shared footer for the landing and site pages. */
export function SiteFooter() {
  return (
    <footer className="sfoot">
      <div className="sfoot-row">
        <Brand size={18} />
        <nav aria-label="Footer">{SITE_NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}</nav>
      </div>
      <p>Built by The Selenites for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA. Ephemeris: JPL DE421. Terrain: NASA LOLA. Imagery: LROC / NASA Moon Trek.</p>
    </footer>
  )
}
