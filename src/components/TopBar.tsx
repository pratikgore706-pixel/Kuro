import { NavLink, Link } from 'react-router-dom'
import { Brand } from './Brand'
import { useStore } from '../store'
import { fmtUtc } from '../engine/time'

export function TopBar() {
  const cursor = useStore((s) => s.cursorMs)
  return (
    <header className="topbar">
      <Link to="/" aria-label="KURO home"><Brand /></Link>
      <nav aria-label="Primary">
        <NavLink to="/explorer">Explorer</NavLink>
        <NavLink to="/mission">Mission</NavLink>
        <NavLink to="/compare">Compare</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/methods">Data &amp; methods</NavLink>
      </nav>
      <div className="clock mono" title="Time being inspected (UTC)">
        <span className="dim">UTC</span> {fmtUtc(cursor)}
      </div>
    </header>
  )
}
