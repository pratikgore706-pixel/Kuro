import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, GitCompareArrows, Play } from 'lucide-react'
import { GROUPS, SITES, fmtLat, fmtLon } from '../data/sites'
import { DAY, fmtDayShort, fmtHours } from '../engine/time'
import { dataSourceLabel, findWindows, type Check, type WindowResult } from '../services/api'
import { EARTH_MARGINS, findSite, useStore } from '../store'

const CHECK_LABEL: Record<Check, string> = { sun: 'too little sunlight', dark: 'darkness too long', earth: 'Earth in view too little', gap: 'radio gap too long' }
const CHECK_COLOR: Record<Check, string> = { sun: '#f4a259', dark: '#8b5cf6', earth: '#6fa8ff', gap: '#e8577a' }

function Calendar({ r, onPick }: { r: WindowResult; onPick: (date: string) => void }) {
  return (
    <div className="cal" role="list" aria-label="Landing dates">
      {r.days.map((d) => {
        const first = d.failed[0]
        const t = d.ok ? `${d.date}: meets every requirement` : `${d.date}: ${d.failed.map((f) => CHECK_LABEL[f]).join(', ')}`
        return <button key={d.date} role="listitem" className={d.ok ? 'ok' : 'no'} style={d.ok ? undefined : { background: CHECK_COLOR[first], opacity: 0.18 + 0.12 * d.failed.length }} title={t} aria-label={t} onClick={() => onPick(d.date)} />
      })}
    </div>
  )
}

export function Mission() {
  const nav = useNavigate()
  const { mission, setMission, windows, setWindows, moon, earthMarginDeg } = useStore()
  const { selectSite, setLanding, setDays, addScenario, setEarthMargin } = useStore()
  // the margin the shown results were computed with, so changing it marks them out of date
  const [ranMargin, setRanMargin] = useState<number | null>(null)
  const [busy, setBusy] = useState<[number, number] | null>(null)
  const [err, setErr] = useState('')
  const all = SITES

  const run = async () => {
    setErr('')
    if (Date.parse(mission.windowEnd) < Date.parse(mission.windowStart)) { setErr('The last landing date is before the first one.'); return }
    if (!mission.siteIds.length) { setErr('Choose at least one site.'); return }
    setBusy([0, mission.siteIds.length])
    try { setWindows(await findWindows(mission, all, (d, t) => setBusy([d, t]), earthMarginDeg)); setRanMargin(earthMarginDeg) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(null) }
  }

  const open = (siteId: string, date: string) => {
    selectSite(siteId)
    setDays(mission.stayDays)
    setLanding(Date.parse(date + 'T00:00:00Z'))
    nav('/explorer')
  }
  const compare = (siteId: string, date: string) => {
    addScenario({ siteId, landingMs: Date.parse(date + 'T00:00:00Z'), days: mission.stayDays })
    nav('/compare')
  }
  const toggle = (id: string) => setMission({ siteIds: mission.siteIds.includes(id) ? mission.siteIds.filter((x) => x !== id) : [...mission.siteIds, id] })
  const nDays = Math.round((Date.parse(mission.windowEnd) - Date.parse(mission.windowStart)) / DAY) + 1
  const sorted = windows ? [...windows].sort((a, b) => b.passCount - a.passCount) : null

  return (
    <main className="mission">
      <header className="pagehead">
        <div>
          <p className="eyebrow">Mission planner</p>
          <h1>When can we land, and where?</h1>
          <p className="lede">Set what the lander needs to survive and to talk to Earth. KURO checks a full stay starting on every day in your launch window, at every site you pick, and shows which landing dates work. If the schedule slips, the alternatives are already on screen.</p>
        </div>
      </header>

      <section className="ms-form panel">
        <div className="ms-grid">
          <label className="field"><span className="eyebrow">Mission name</span><input value={mission.name} onChange={(e) => setMission({ name: e.target.value })} /></label>
          <label className="field"><span className="eyebrow">First landing date (UTC)</span><input type="date" value={mission.windowStart} onChange={(e) => setMission({ windowStart: e.target.value })} /></label>
          <label className="field"><span className="eyebrow">Last landing date (UTC)</span><input type="date" value={mission.windowEnd} onChange={(e) => setMission({ windowEnd: e.target.value })} /></label>
          <label className="field"><span className="eyebrow">Length of stay</span>
            <select value={mission.stayDays} onChange={(e) => setMission({ stayDays: Number(e.target.value) })}>{[3, 7, 10, 14, 21, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
          </label>
        </div>
        <div className="ms-reqs">
          <h2>Requirements for the whole stay</h2>
          <div className="ms-grid">
            <label className="req sun"><span>Sunlight at least <b className="mono">{mission.minSunPct}%</b></span><input type="range" min={0} max={100} step={5} value={mission.minSunPct} onChange={(e) => setMission({ minSunPct: Number(e.target.value) })} /><small>Average share of the Sun’s disc in view. Sets how much power the arrays can collect.</small></label>
            <label className="req dark"><span>Darkness no longer than <b className="mono">{fmtHours(mission.maxDarkHours)}</b></span><input type="range" min={6} max={360} step={6} value={mission.maxDarkHours} onChange={(e) => setMission({ maxDarkHours: Number(e.target.value) })} /><small>Longest stretch the batteries and heaters must carry the lander.</small></label>
            <label className="req earth"><span>Earth in view at least <b className="mono">{mission.minEarthPct}%</b></span><input type="range" min={0} max={100} step={5} value={mission.minEarthPct} onChange={(e) => setMission({ minEarthPct: Number(e.target.value) })} /><small>Share of the stay with a direct line of sight for radio.</small></label>
            <label className="req gap"><span>Radio gap no longer than <b className="mono">{fmtHours(mission.maxGapHours)}</b></span><input type="range" min={6} max={360} step={6} value={mission.maxGapHours} onChange={(e) => setMission({ maxGapHours: Number(e.target.value) })} /><small>Longest time without a direct link to Earth.</small></label>
            <label className="req earth"><span>Antenna margin <b className="mono">{earthMarginDeg}°</b></span>
              <select value={earthMarginDeg} onChange={(e) => setEarthMargin(Number(e.target.value))}>{EARTH_MARGINS.map((m) => <option key={m} value={m}>{m}° above the hills</option>)}</select>
              <small>Earth only counts as in view once it is this high above the terrain horizon. Same setting as the Explorer.</small></label>
          </div>
        </div>
        <div className="ms-sites">
          <h2>Sites to check</h2>
          {GROUPS.map((g) => {
            const items = all.filter((s) => s.group === g)
            if (!items.length) return null
            return (
              <div key={g} className="ms-group"><span className="eyebrow">{g}</span>
                <div>{items.map((s) => <button key={s.id} className={'pill' + (mission.siteIds.includes(s.id) ? ' on' : '')} aria-pressed={mission.siteIds.includes(s.id)} onClick={() => toggle(s.id)}>{s.name}</button>)}</div>
              </div>
            )
          })}
        </div>
        <div className="ms-run">
          <button className="btn primary lg" onClick={run} disabled={!!busy}><Play size={16} aria-hidden="true" /> {busy ? `Checking site ${busy[0] + 1} of ${busy[1]}…` : `Check ${nDays} landing dates at ${mission.siteIds.length} sites`}</button>
          <p className="dim small">{dataSourceLabel()}. {moon?.ok ? 'Horizons traced from LOLA terrain.' : 'Smooth-sphere horizons: install LOLA data with npm run fetch:moon for terrain.'}</p>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      </section>

      {sorted && (
        <section className="ms-results">
          <header>
            <h2>{sorted.reduce((a, r) => a + r.passCount, 0)} workable landings across {sorted.length} sites</h2>
            {ranMargin !== null && ranMargin !== earthMarginDeg && <p className="err small" role="status">The antenna margin changed to {earthMarginDeg}° — press the button above to check again.</p>}
            <ul className="ms-key" aria-label="Legend">
              <li><i style={{ background: '#5ec8b0' }} /> Meets every requirement</li>
              {(Object.keys(CHECK_LABEL) as Check[]).map((c) => <li key={c}><i style={{ background: CHECK_COLOR[c] }} /> Fails: {CHECK_LABEL[c]}</li>)}
            </ul>
          </header>
          <div className="ms-axis mono dim"><span>{fmtDayShort(Date.parse(mission.windowStart))}</span><span>{fmtDayShort(Date.parse(mission.windowEnd))}</span></div>
          {sorted.map((r) => {
            const site = findSite(r.siteId)
            return (
              <article key={r.siteId} className="ms-row">
                <div className="ms-name">
                  <h3>{site.name}</h3>
                  <p className="mono dim small">{fmtLat(site.lat, 2)} {fmtLon(site.lon, 2)} · {r.horizon === 'terrain' ? 'terrain horizon' : 'sphere horizon'}</p>
                </div>
                <Calendar r={r} onPick={(d) => open(r.siteId, d)} />
                <div className="ms-sum">
                  <b className="mono">{r.passCount}</b><span>of {r.days.length} dates</span>
                  {r.bestRun ? <p className="small">Longest run: {r.bestRun.days} day{r.bestRun.days === 1 ? '' : 's'} from {fmtDayShort(Date.parse(r.bestRun.start))}</p> : <p className="small dim">No date meets every requirement.</p>}
                  {r.bestRun && (
                    <div className="row">
                      <button className="btn" onClick={() => open(r.siteId, r.bestRun!.start)}><Compass size={14} aria-hidden="true" /> Explore</button>
                      <button className="btn" onClick={() => compare(r.siteId, r.bestRun!.start)}><GitCompareArrows size={14} aria-hidden="true" /> Compare</button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          <p className="dim small">Click any day to open that landing in the explorer. Sites are ordered by how many dates pass; this is a count against your own thresholds, not a ranking of sites.</p>
        </section>
      )}
    </main>
  )
}
