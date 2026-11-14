import { useMemo, useState } from 'react'
import { MapPin, Plus, Search } from 'lucide-react'
import { GROUPS, SITES, fmtLat, fmtLon } from '../data/sites'
import { useStore } from '../store'

export function SiteList() {
  const siteId = useStore((s) => s.siteId)
  const custom = useStore((s) => s.custom)
  const select = useStore((s) => s.selectSite)
  const addCustom = useStore((s) => s.addCustom)
  const [q, setQ] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [err, setErr] = useState('')

  const all = useMemo(() => [...SITES, ...custom], [custom])
  const shown = all.filter((s) => (s.name + ' ' + s.note).toLowerCase().includes(q.trim().toLowerCase()))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const la = Number(lat), lo = Number(lon)
    if (lat.trim() === '' || lon.trim() === '' || !isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 360) {
      setErr('Latitude −90…90, longitude −180…180 (east positive).'); return
    }
    addCustom(la, ((lo + 540) % 360) - 180)
    setLat(''); setLon(''); setErr('')
  }

  return (
    <aside className="panel sitelist" aria-label="Landing sites">
      <label className="search">
        <Search size={14} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites" aria-label="Search sites" />
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
      <form className="custom" onSubmit={submit} aria-label="Add custom coordinates">
        <h3 className="eyebrow">Custom coordinates</h3>
        <div className="row">
          <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat °N" aria-label="Latitude, degrees north" />
          <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Lon °E" aria-label="Longitude, degrees east" />
          <button className="btn icon" type="submit" aria-label="Add site"><Plus size={15} /></button>
        </div>
        {err ? <p className="err" role="alert">{err}</p> : <p className="hint">Or double-click the globe to drop a site.</p>}
      </form>
    </aside>
  )
}
