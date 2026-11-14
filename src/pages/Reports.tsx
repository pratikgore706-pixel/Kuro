import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { fmtLat, fmtLon } from '../data/sites'
import { computeSeries, makeFrame, summarize } from '../engine/sky'
import { DAY, fmtDate, fmtHours, fmtUtc } from '../engine/time'
import { getEphemeris } from '../engine/ephemeris'
import { horizonFor } from '../hooks'
import { dataSourceLabel } from '../services/api'
import { findSite, useStore } from '../store'

function save(name: string, type: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function Reports() {
  const { scenarios, custom, moon, mission, windows } = useStore()
  const [note, setNote] = useState('')
  const rows = useMemo(() => scenarios.map((sc, i) => {
    const site = findSite(sc.siteId, custom)
    const h = horizonFor(site, moon)
    const n = Math.min(960, Math.round(sc.days * 96))
    const m = summarize(computeSeries(makeFrame(site.lat, site.lon), h, sc.landingMs, (sc.days * DAY) / (n - 1), n))
    return { letter: 'ABCDEF'[i], sc, site, m, horizon: h }
  }), [scenarios, custom, moon])

  const json = () => JSON.stringify({
    generated: new Date().toISOString(), tool: 'KURO', dataSource: dataSourceLabel(),
    ephemeris: getEphemeris()?.meta.ephemeris, frame: getEphemeris()?.meta.frame,
    notes: note || undefined,
    mission, windows: windows ?? undefined,
    scenarios: rows.map((r) => ({ id: r.letter, site: r.site.name, lat: r.site.lat, lon: r.site.lon, coordinateSource: r.site.source, landingUtc: new Date(r.sc.landingMs).toISOString(), stayDays: r.sc.days, horizon: r.horizon.source, metrics: r.m })),
  }, null, 1)
  const csv = () => ['scenario,site,lat,lon,landing_utc,stay_days,sunlight_pct,longest_dark_h,peak_sun_el_deg,earth_in_view_pct,longest_gap_h,sun_and_earth_pct,horizon']
    .concat(rows.map((r) => [r.letter, `"${r.site.name}"`, r.site.lat, r.site.lon, new Date(r.sc.landingMs).toISOString(), r.sc.days, r.m.sunPct.toFixed(1), r.m.longestDarkH.toFixed(1), r.m.peakSunEl.toFixed(2), r.m.earthPct.toFixed(1), r.m.longestOutageH.toFixed(1), r.m.bothPct.toFixed(1), r.horizon.kind].join(','))).join('\n')

  return (
    <main className="prose report">
      <div className="no-print rp-actions">
        <button className="btn primary" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print or save as PDF</button>
        <button className="btn" onClick={() => save('kuro-report.json', 'application/json', json())}><Download size={15} aria-hidden="true" /> JSON</button>
        <button className="btn" onClick={() => save('kuro-scenarios.csv', 'text/csv', csv())}><Download size={15} aria-hidden="true" /> CSV</button>
      </div>
      <p className="eyebrow">Mission analysis report · {fmtUtc(Date.now())} UTC</p>
      <h1>{mission.name || 'Untitled mission'}</h1>
      <label className="no-print rp-note"><span className="eyebrow">Notes for this report</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Context, decisions, open questions…" /></label>
      {note && <p className="print-only">{note}</p>}

      <h2>Requirements</h2>
      <table className="plain"><tbody>
        <tr><th>Landing window</th><td>{mission.windowStart} to {mission.windowEnd} (UTC)</td></tr>
        <tr><th>Stay</th><td>{mission.stayDays} days</td></tr>
        <tr><th>Power</th><td>Sunlight ≥ {mission.minSunPct}% of the stay; darkness ≤ {fmtHours(mission.maxDarkHours)}</td></tr>
        <tr><th>Communications</th><td>Earth in view ≥ {mission.minEarthPct}% of the stay; radio gap ≤ {fmtHours(mission.maxGapHours)}</td></tr>
      </tbody></table>

      {windows && (
        <>
          <h2>Landing dates that meet every requirement</h2>
          <table className="plain"><thead><tr><th>Site</th><td><b>Dates passing</b></td><td><b>Longest run</b></td></tr></thead><tbody>
            {[...windows].sort((a, b) => b.passCount - a.passCount).map((w) => (
              <tr key={w.siteId}><th>{findSite(w.siteId, custom).name}</th><td>{w.passCount} of {w.days.length}</td><td>{w.bestRun ? `${w.bestRun.days} days from ${w.bestRun.start}` : 'none'}</td></tr>
            ))}
          </tbody></table>
        </>
      )}

      <h2>Compared scenarios</h2>
      {rows.length === 0 ? <p>No scenarios yet. Add some on the Compare page.</p> : (
        <table className="plain rp-table"><thead><tr><th>Scenario</th><td><b>Landing</b></td><td><b>Sunlight</b></td><td><b>Longest dark</b></td><td><b>Earth in view</b></td><td><b>Longest gap</b></td></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.sc.id}><th>{r.letter}. {r.site.name}<br /><small className="mono">{fmtLat(r.site.lat, 2)} {fmtLon(r.site.lon, 2)}</small></th><td>{fmtDate(r.sc.landingMs)}, {r.sc.days} d</td><td>{r.m.sunPct.toFixed(0)}%</td><td>{fmtHours(r.m.longestDarkH)}</td><td>{r.m.earthPct.toFixed(0)}%</td><td>{fmtHours(r.m.longestOutageH)}</td></tr>
          ))}
        </tbody></table>
      )}

      <h2>Data and limitations</h2>
      <ul>
        <li>Sun and Earth positions: JPL DE421 with lunar librations, MOON_ME frame. {dataSourceLabel()}.</li>
        <li>Horizons: {moon?.ok ? 'traced from NASA LOLA elevation out to 300 km, observer 2 m above ground.' : 'ideal smooth sphere — terrain not applied.'}</li>
        <li>“Earth in view” is geometric line of sight to Earth’s centre, not a link budget.</li>
        <li>Planning and teaching aid. Not for landing certification. Not affiliated with or endorsed by NASA.</li>
      </ul>
    </main>
  )
}
