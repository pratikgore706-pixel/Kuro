import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { SITES, fmtLat, fmtLon } from '../data/sites'
import { computeSeries, makeFrame, summarize } from '../engine/sky'
import { fmtC, kToC } from '../engine/thermal'
import { DAY, fmtHours, fmtUtc } from '../engine/time'
import { getEphemeris } from '../engine/ephemeris'
import { horizonFor } from '../hooks'
import { dataSourceLabel, rankSites, scoreStay, slopeAt } from '../services/api'
import { findSite, useStore } from '../store'

function save(name: string, type: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function Reports() {
  const { scenarios, moon, mission, windows, earthMarginDeg, landingMs, days } = useStore()
  const [note, setNote] = useState('')
  const rows = useMemo(() => scenarios.map((sc, i) => {
    const site = findSite(sc.siteId)
    const h = horizonFor(site, moon)
    const n = Math.min(960, Math.round(sc.days * 96))
    const m = summarize(computeSeries(makeFrame(site.lat, site.lon), h, sc.landingMs, (sc.days * DAY) / (n - 1), n, earthMarginDeg))
    const st = scoreStay(m, slopeAt(site))
    return { letter: 'ABCDEF'[i], sc, site, m, horizon: h, score: st.score, backendScore: st.backendScore, blockers: st.blockers }
  }), [scenarios, moon, earthMarginDeg])
  // the same ranking the Explorer shows, for the landing date and stay chosen there
  const ranking = useMemo(() => rankSites(SITES, landingMs, days, earthMarginDeg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [landingMs, days, earthMarginDeg, moon])

  const json = () => JSON.stringify({
    generated: new Date().toISOString(), tool: 'KURO', dataSource: dataSourceLabel(),
    ephemeris: getEphemeris()?.meta.ephemeris, frame: getEphemeris()?.meta.frame,
    notes: note || undefined,
    antennaMarginDeg: earthMarginDeg,
    mission, windows: windows ?? undefined,
    scenarios: rows.map((r) => ({ id: r.letter, site: r.site.name, lat: r.site.lat, lon: r.site.lon, coordinateSource: r.site.source, landingUtc: new Date(r.sc.landingMs).toISOString(), stayDays: r.sc.days, horizon: r.horizon.source, metrics: r.m, score: r.score, backendScore: r.backendScore, blockers: r.blockers })),
    ranking: { landingUtc: new Date(landingMs).toISOString(), stayDays: days, formula: 'kuro_backend_fast RecommendationEngine 1.0.0, ported exactly; plus KURO rule: no sunlight or no Earth in view at all → 0', sites: ranking.map((r, i) => ({ rank: i + 1, site: r.site.name, lat: r.site.lat, lon: r.site.lon, score: r.score, backendScore: r.backendScore, blockers: r.blockers, backendInputCoveragePct: r.completenessPct, components: r.componentScores, componentCompletenessPct: r.componentCompleteness, slopeDeg: r.slopeDeg, metrics: r.summary })) },
  }, null, 1)
  const csv = () => ['scenario,site,lat,lon,landing_utc,stay_days,score,sunlight_pct,longest_dark_h,peak_sun_el_deg,earth_in_view_pct,longest_gap_h,sun_and_earth_pct,warmest_ground_c,antenna_margin_deg,horizon']
    .concat(rows.map((r) => [r.letter, `"${r.site.name.replace(/"/g, '""')}"`, r.site.lat, r.site.lon, new Date(r.sc.landingMs).toISOString(), r.sc.days, r.score === null ? '' : r.score.toFixed(1), r.m.sunPct.toFixed(1), r.m.longestDarkH.toFixed(1), r.m.peakSunEl.toFixed(2), r.m.earthPct.toFixed(1), r.m.longestOutageH.toFixed(1), r.m.bothPct.toFixed(1), r.m.peakGroundK > 0 ? kToC(r.m.peakGroundK).toFixed(0) : '', earthMarginDeg, r.horizon.kind].join(','))).join('\n')

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
        <tr><th>Communications</th><td>Earth in view ≥ {mission.minEarthPct}% of the stay; radio gap ≤ {fmtHours(mission.maxGapHours)}; antenna margin {earthMarginDeg}° above the terrain horizon</td></tr>
      </tbody></table>

      {windows && (
        <>
          <h2>Landing dates that meet every requirement</h2>
          <table className="plain"><thead><tr><th>Site</th><td><b>Dates passing</b></td><td><b>Longest run</b></td></tr></thead><tbody>
            {[...windows].sort((a, b) => b.passCount - a.passCount).map((w) => (
              <tr key={w.siteId}><th>{findSite(w.siteId).name}</th><td>{w.passCount} of {w.days.length}</td><td>{w.bestRun ? `${w.bestRun.days} days from ${w.bestRun.start}` : 'none'}</td></tr>
            ))}
          </tbody></table>
        </>
      )}

      <h2>Compared scenarios</h2>
      {rows.length === 0 ? <p>No scenarios yet. Add some on the Compare page.</p> : (
        <table className="plain rp-table"><thead><tr><th>Scenario</th><td><b>Landing (UTC)</b></td><td><b>Score</b></td><td><b>Sunlight</b></td><td><b>Longest dark</b></td><td><b>Earth in view</b></td><td><b>Longest gap</b></td><td><b>Warmest ground</b></td></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.sc.id}><th>{r.letter}. {r.site.name}<br /><small className="mono">{fmtLat(r.site.lat, 2)} {fmtLon(r.site.lon, 2)}</small></th><td>{fmtUtc(r.sc.landingMs)}, {r.sc.days} d</td><td>{r.score === null ? '—' : Math.round(r.score)}{r.blockers.length ? ` (${r.blockers.join(', ')})` : ''}</td><td>{r.m.sunPct.toFixed(0)}%</td><td>{fmtHours(r.m.longestDarkH)}</td><td>{r.m.earthPct.toFixed(0)}%</td><td>{fmtHours(r.m.longestOutageH)}</td><td>{r.m.peakGroundK > 0 ? fmtC(r.m.peakGroundK) : 'never lit'}</td></tr>
          ))}
        </tbody></table>
      )}

      <h2>South Pole site ranking</h2>
      <p>For a {days}-day stay landing {fmtUtc(landingMs)} UTC (the date chosen in the Explorer). Score out of 100 from the KURO backend’s recommendation engine: flat ground 25%, safety 25%, sunlight 20%, Earth link 15%, Sun and Earth together 15%. Roughness and a hazard map are not available at 80 m, so each site uses about {ranking.find((r) => r.score !== null)?.completenessPct.toFixed(0) ?? '80'}% of the backend’s inputs. KURO adds one rule: a stay with no sunlight or no Earth in view at all scores 0.</p>
      <table className="plain rp-table"><thead><tr><th>Rank</th><td><b>Site</b></td><td><b>Score</b></td><td><b>Slope</b></td><td><b>Sunlight</b></td><td><b>Earth in view</b></td><td><b>Longest dark</b></td><td><b>Longest gap</b></td></tr></thead><tbody>
        {ranking.map((r, i) => (
          <tr key={r.siteId}><th>{i + 1}</th><td>{r.site.name}<br /><small className="mono">{fmtLat(r.site.lat, 2)} {fmtLon(r.site.lon, 2)}</small></td><td>{r.score === null ? '—' : Math.round(r.score)}{r.componentScores.terrain === null && r.score !== null ? '*' : ''}{r.blockers.length ? ` (${r.blockers.join(', ')}; backend formula ${r.backendScore === null ? '—' : Math.round(r.backendScore)})` : ''}</td><td>{r.slopeDeg === null ? '—' : `${r.slopeDeg.toFixed(1)}°`}</td><td>{r.summary.sunPct.toFixed(0)}%</td><td>{r.summary.earthPct.toFixed(0)}%</td><td>{fmtHours(r.summary.longestDarkH)}</td><td>{fmtHours(r.summary.longestOutageH)}</td></tr>
        ))}
      </tbody></table>
      {ranking.some((r) => r.componentScores.terrain === null && r.score !== null) && <p className="dim small">* Scored without slope: LOLA elevation was not available for that site.</p>}

      <h2>Data and limitations</h2>
      <ul>
        <li>Sun and Earth positions: JPL DE421 with lunar librations, MOON_ME frame. {dataSourceLabel()}.</li>
        <li>Horizons: {moon?.ok ? 'traced from NASA LOLA elevation out to 300 km, observer 2 m above ground.' : 'ideal smooth sphere — terrain not applied.'}</li>
        <li>“Earth in view” is line of sight to Earth’s centre at least {earthMarginDeg}° above the terrain horizon (antenna margin), not a link budget.</li>
        <li>Temperatures are first estimates from a sunlight-in = heat-out balance for bare regolith; heat stored in the ground and light reflected by nearby slopes are not modelled.</li>
        <li>Planning and teaching aid. Not for landing certification. Not affiliated with or endorsed by NASA.</li>
      </ul>
    </main>
  )
}
