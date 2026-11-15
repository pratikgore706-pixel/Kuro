import { useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { GROUPS, SITES, fmtLat, fmtLon } from '../data/sites'
import { useStore } from '../store'

export function SiteList() {
  const siteId = useStore((s) => s.siteId)
  const select = useStore((s) => s.selectSite)
  const [q, setQ] = useState('')

  const shown = SITES.filter((s) => (s.name + ' ' + s.id + ' ' + s.group).toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <aside className="panel sitelist" aria-label="Landing sites">
      <label className="search">
        <Search size={14} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the 78 sites" aria-label="Search the 78 candidate sites" />
      </label>
      <div className="scroll">
        {GROUPS.map((g) => {
          const items = shown.filter((s) => s.group === g)
          if (!items.length) return null
          return (
            <section key={g}>
              <h3 className="eyebrow">{g}</h3>
              <ul>
                {items.map((s) => (
                  <li key={s.id}>
                    <button className={'site' + (s.id === siteId ? ' on' : '')} onClick={() => select(s.id)} aria-pressed={s.id === siteId}>
                      <MapPin size={13} aria-hidden="true" />
                      <span className="nm">{s.name}</span>
                      <span className="co mono">{fmtLat(s.lat, 2)} {fmtLon(s.lon, 2)}</span>
                      <span className="nt">{s.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {!shown.length && <p className="dim pad">No site matches “{q}”.</p>}
      </div>
    </aside>
  )
}
