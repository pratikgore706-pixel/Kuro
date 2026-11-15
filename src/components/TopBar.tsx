import { BookOpen, Clock, FileText, GitCompareArrows, Orbit, Rocket, type LucideIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { fmtDayShort, fmtUtc } from '../engine/time'
import { useStore } from '../store'

const PAGES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/explorer', label: 'Explorer', icon: Orbit },
  { to: '/mission', label: 'Mission', icon: Rocket },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/methods', label: 'Data & methods', icon: BookOpen },
]

/**
 * The workspace's main navigation: a slim vertical rail of icons on the left (a bar along the bottom on phones).
 * Each icon shows its page name in a floating tag on hover or keyboard focus, and carries it as its accessible name.
 */
export function TopBar() {
  const cursor = useStore((s) => s.cursorMs)
  const when = `${fmtDayShort(cursor)} ${new Date(cursor).getUTCFullYear()}, ${fmtUtc(cursor).slice(11, 16)} UTC`
  return (
    <nav className="rail" aria-label="Primary">
      <Link to="/" className="rail-item rail-home" aria-label="KURO home">
        <svg width={24} height={24} viewBox="0 0 32 32" aria-hidden="true"><path d="M21.5 4.2A13 13 0 1 0 27.8 21 10.5 10.5 0 1 1 21.5 4.2Z" fill="var(--sun)" /></svg>
        <span className="rail-tip" aria-hidden="true">KURO home</span>
      </Link>
      <div className="rail-pages">
        {PAGES.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="rail-item" aria-label={label}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="rail-tip" aria-hidden="true">{label}</span>
          </NavLink>
        ))}
      </div>
      <div className="rail-item rail-clock" tabIndex={0} role="img" aria-label={`Showing ${when}`}>
        <Clock size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="rail-tip" aria-hidden="true">Showing {when}</span>
      </div>
    </nav>
  )
}
