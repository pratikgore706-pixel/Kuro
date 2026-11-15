import { useMemo, useState } from 'react'
import { Plus, RadioTower, Star, X } from 'lucide-react'
import { SideBySide, type SideRow } from '../components/SideBySide'
import { DURATIONS } from '../components/TimeBar'
import { runs, sunState } from '../components/Timeline'
import { GROUPS, SITES, fmtLat, fmtLon, type Site } from '../data/sites'
import { computeSeries, makeFrame, summarize, type Horizon, type Series, type Summary } from '../engine/sky'
import { fmtC } from '../engine/thermal'
import { DAY, HOUR, fmtDate, fmtDayShort, fmtHours, fmtTimeOfDay, parseTimeOfDay, startOfUtcDay } from '../engine/time'
import { horizonFor, useEarthMargin, useSize } from '../hooks'
import { scoreStay, slopeAt, type SiteScore } from '../services/api'
import { EARTH_MARGINS, findSite, useStore, type Scenario } from '../store'

interface Row { sc: Scenario; site: Site; series: Series; m: Summary; letter: string; score: SiteScore; horizon: Horizon }
const LETTERS = 'ABCDEF'
const LINE = ['#e9e7f5', '#9b9dff', '#5ec8b0', '#f08ba0', '#d6c35c', '#7fb2ff']
const DASH = ['', '6 3', '2 3', '8 3 2 3', '1 4', '10 4']

const METRICS: { key: Exclude<keyof Summary, 'backend'>; label: string; hint: string; better: 'high' | 'low' | 'none'; fmt: (v: number) => string }[] = [
  { key: 'sunPct', label: 'Sunlight available', hint: 'Mean share of the solar disc above the horizon — a proxy for power from a Sun-tracking array.', better: 'high', fmt: (v) => v.toFixed(0) + '%' },
  { key: 'longestDarkH', label: 'Longest darkness', hint: 'Longest continuous stretch with no part of the Sun visible. Sets battery and survival-heater sizing.', better: 'low', fmt: fmtHours },
  { key: 'peakSunEl', label: 'Peak Sun elevation', hint: 'Highest the Sun gets. Low values mean long shadows and vertical arrays.', better: 'high', fmt: (v) => v.toFixed(1) + '°' },
  { key: 'earthPct', label: 'Earth in view', hint: 'Share of the stay with geometric line of sight to Earth’s centre (direct-to-Earth link possible).', better: 'high', fmt: (v) => v.toFixed(0) + '%' },
  { key: 'longestOutageH', label: 'Longest comm gap', hint: 'Longest continuous stretch with Earth below the horizon.', better: 'low', fmt: fmtHours },
  { key: 'bothPct', label: 'Sun + Earth together', hint: 'Share of the stay with both power and a direct link — the easiest hours to operate in.', better: 'high', fmt: (v) => v.toFixed(0) + '%' },
  { key: 'peakGroundK', label: 'Warmest ground (est.)', hint: 'Level ground at the moment of most sunlight, from a sunlight-in = heat-out balance. In shadow it falls below −170 °C.', better: 'none', fmt: (v) => (v > 0 ? fmtC(v) : 'never lit') },
]

function Strip({ s }: { s: Series }) {
  const W = 1000, x = (i: number) => (i / (s.n - 1)) * W
  return (
    <svg className="strip" viewBox={`0 0 ${W} 26`} preserveAspectRatio="none" role="img" aria-label="Sunlight (top) and Earth visibility (bottom) across the stay">
      <rect x="0" y="0" width={W} height="11" className="bandbg" /><rect x="0" y="15" width={W} height="11" className="bandbg" />
      {runs(s.n, sunState(s)).map(([a, b, st]) => st > 0 && <rect key={a} x={x(a)} y="0" width={x(Math.min(b, s.n - 1)) - x(a)} height="11" className={st === 2 ? 'band sun' : 'band sun part'} />)}
      {runs(s.n, (i) => s.earthUp[i]).map(([a, b, st]) => st > 0 && <rect key={a} x={x(a)} y="15" width={x(Math.min(b, s.n - 1)) - x(a)} height="11" className="band earth" />)}
    </svg>
  )
}

/** What happens to each site if the landing date moves: window metrics as a function of landing date. */
function SlipChart({ rows, stay, metric }: { rows: Row[]; stay: number; metric: 'sun' | 'earth' }) {
  const moon = useStore((s) => s.moon)
  const margin = useEarthMargin()
  const [ref, { w }] = useSize<HTMLDivElement>()
  const h = 190, L = 40, R = 118, T = 10, B = 24, SPAN = 180
  const t0 = Math.min(...rows.map((r) => r.sc.landingMs))
  const sites = useMemo(() => [...new Map(rows.map((r) => [r.site.id, r.site])).values()], [rows])
  const curves = useMemo(() => sites.map((site) => {
    const per = 12, n = (SPAN + stay) * per + 1
    const s = computeSeries(makeFrame(site.lat, site.lon), horizonFor(site, moon), t0, 2 * HOUR, n, margin)
    const acc = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) acc[i + 1] = acc[i] + (metric === 'sun' ? s.sunFrac[i] : s.earthUp[i])
    const v = new Float32Array(SPAN + 1)
    for (let d = 0; d <= SPAN; d++) v[d] = (100 * (acc[d * per + stay * per] - acc[d * per])) / (stay * per)
    return { site, v }
  }), [sites, stay, metric, t0, moon, margin])
  const X = (d: number) => L + (d / SPAN) * (w - L - R), Y = (p: number) => T + (1 - p / 100) * (h - T - B)
  // end-of-line labels, pushed apart so they never overlap
  const labelY = useMemo(() => {
    const order = curves.map((c, i) => ({ i, y: T + 8 + (1 - c.v[SPAN] / 100) * (h - T - B - 8) })).sort((a, b) => a.y - b.y)
    for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + 13)
    const out: number[] = []
    for (const o of order) out[o.i] = o.y
    return out
  }, [curves])
  return (
    <div ref={ref} className="slip">
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`${metric === 'sun' ? 'Sunlight available' : 'Earth in view'} for a ${stay}-day stay, by landing date, for each compared site`}>
          {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={L} x2={w - R} y1={Y(p)} y2={Y(p)} className="grid" /><text x={L - 6} y={Y(p) + 3.5} className="axis" textAnchor="end">{p}%</text></g>)}
          {[0, 30, 60, 90, 120, 150, 180].map((d) => <text key={d} x={X(d)} y={h - 6} className="axis" textAnchor={d === 0 ? 'start' : 'middle'}>{fmtDayShort(t0 + d * DAY)}</text>)}
          {curves.map(({ site, v }, i) => {
            let d = ''
            for (let k = 0; k <= SPAN; k++) d += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v[k]).toFixed(1)
            return (
              <g key={site.id}>
                <path d={d} fill="none" stroke={LINE[i % 6]} strokeWidth="1.6" strokeDasharray={DASH[i % 6]} />
                <text x={w - R + 6} y={labelY[i]} className="axis" style={{ fill: LINE[i % 6] }}>{site.name}</text>
              </g>
            )
          })}
          {rows.map((r) => {
            const d = (r.sc.landingMs - t0) / DAY
            if (d > SPAN) return null
            const c = curves.find((c) => c.site.id === r.site.id)!
            const y = Y(c.v[Math.round(d)])
            // pins that land on the same day sit side by side instead of hiding each other
            const x = X(d) + 17 * rows.filter((o, j) => j < rows.indexOf(r) && Math.round((o.sc.landingMs - t0) / DAY) === Math.round(d)).length
            return <g key={r.sc.id}><circle cx={x} cy={y} r="8" className="pin" /><text x={x} y={y + 3.5} className="pinlbl" textAnchor="middle">{r.letter}</text></g>
          })}
        </svg>
      )}
    </div>
  )
}

export function Compare() {
  const { scenarios, range, moon, earthMarginDeg } = useStore()
  const { addScenario, updateScenario, removeScenario, setEarthMargin } = useStore()
  const [stay, setStay] = useState(14)
  const all = SITES

  const rows: Row[] = useMemo(() => scenarios.map((sc, i) => {
    const site = findSite(sc.siteId)
    const n = Math.min(960, Math.round(sc.days * 96))
    const horizon = horizonFor(site, moon)
    const series = computeSeries(makeFrame(site.lat, site.lon), horizon, sc.landingMs, (sc.days * DAY) / (n - 1), n, earthMarginDeg)
    const m = summarize(series)
    return { sc, site, series, m, letter: LETTERS[i], score: scoreStay(m, slopeAt(site)), horizon }
  }), [scenarios, moon, earthMarginDeg])
  const side: SideRow[] = useMemo(() => rows.map((r) => ({ key: r.sc.id, letter: r.letter, site: r.site, landingMs: r.sc.landingMs, days: r.sc.days, series: r.series, horizon: r.horizon })), [rows])

  const best = (k: (typeof METRICS)[number]) => {
    if (rows.length < 2 || k.better === 'none') return -1
    const vals = rows.map((r) => r.m[k.key])
    const b = k.better === 'high' ? Math.max(...vals) : Math.min(...vals)
    return vals.filter((v) => Math.abs(v - b) < 1e-6).length === 1 ? vals.indexOf(b) : -1
  }

  return (
    <main className="compare">
      <header className="pagehead">
        <div>
          <p className="eyebrow">Scenario comparison</p>
          <h1>Same mission, different site or date.</h1>
          <p className="lede">Each column is one site–date scenario. Change any of them and every number updates at once. A star marks the single best value in a row — it is a comparison aid, not a recommendation.</p>
        </div>
        <button className="btn primary" onClick={() => addScenario()} disabled={scenarios.length >= 6}><Plus size={15} aria-hidden="true" /> Add scenario</button>
      </header>

      {rows.length > 0 && <SideBySide rows={side} />}

      {rows.length === 0 ? <p className="empty">No scenarios yet. Add one to start comparing.</p> : (
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr>
                <th scope="col" className="corner">Scenario</th>
                {rows.map((r) => (
                  <th key={r.sc.id} scope="col">
                    <div className="schead">
                      <span className="letter">{r.letter}</span>
                      <button className="btn icon ghost" onClick={() => removeScenario(r.sc.id)} aria-label={`Remove scenario ${r.letter}`}><X size={14} /></button>
                    </div>
                    <select value={r.sc.siteId} onChange={(e) => updateScenario(r.sc.id, { siteId: e.target.value })} aria-label={`Site for scenario ${r.letter}`}>
                      {GROUPS.map((g) => { const it = all.filter((s) => s.group === g); return it.length ? <optgroup key={g} label={g}>{it.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup> : null })}
                    </select>
                    <p className="mono dim small">{fmtLat(r.site.lat, 2)} · {fmtLon(r.site.lon, 2)}</p>
                    <div className="row">
                      <input type="date" value={fmtDate(r.sc.landingMs)} min={fmtDate(range[0] + DAY)} max={fmtDate(range[1] - 121 * DAY)} aria-label={`Landing date for scenario ${r.letter}`}
                        onChange={(e) => { const t = Date.parse(e.target.value + 'T00:00:00Z'); if (isFinite(t)) updateScenario(r.sc.id, { landingMs: t + (r.sc.landingMs - startOfUtcDay(r.sc.landingMs)) }) }} />
                      <select value={r.sc.days} onChange={(e) => updateScenario(r.sc.id, { days: Number(e.target.value) })} aria-label={`Stay length for scenario ${r.letter}`}>
                        {DURATIONS.map(([d]) => <option key={d} value={d}>{d} d</option>)}
                      </select>
                    </div>
                    <label className="row cmp-time"><span className="dim small">Time (UTC)</span>
                      <input type="time" step={60} value={fmtTimeOfDay(r.sc.landingMs)} aria-label={`Landing time for scenario ${r.letter}, UTC`}
                        onChange={(e) => { const t = parseTimeOfDay(e.target.value); if (t !== null) updateScenario(r.sc.id, { landingMs: startOfUtcDay(r.sc.landingMs) + t }) }} />
                    </label>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="score-row">
                <th scope="row"><span>Overall score</span><small>The KURO backend’s 0–100 recommendation score for this stay (flat ground 25%, safety 25%, sunlight 20%, Earth link 15%, Sun + Earth together 15%) — the same score as the Explorer ranking. KURO adds one rule: no sunlight or no Earth at all scores 0.</small></th>
                {rows.map((r) => {
                  const vals = rows.map((x) => x.score.score ?? -1), b = Math.max(...vals)
                  const isBest = rows.length > 1 && r.score.score !== null && vals.filter((v) => Math.abs(v - b) < 1e-6).length === 1 && Math.abs((r.score.score ?? -1) - b) < 1e-6
                  return (
                    <td key={r.sc.id} className={isBest ? 'best' : ''}>
                      <span className="val mono">{r.series.complete && r.score.score !== null ? Math.round(r.score.score) : '—'}</span>
                      {isBest && <span className="star"><Star size={12} aria-hidden="true" /> best</span>}
                      {r.score.blockers.length > 0 && <small className="block-note blocker">{r.score.blockers.join(', ')}; the backend formula alone gives {r.score.backendScore === null ? '—' : Math.round(r.score.backendScore)}</small>}
                      {r.score.componentScores.terrain === null && r.score.score !== null && <small className="dim block-note">No slope here{r.site.lat > -80 ? ' (slope only for sites south of 80°S)' : ''}, so the score uses {Math.round(r.score.completenessPct)}% of the backend’s inputs</small>}
                    </td>
                  )
                })}
              </tr>
              {METRICS.map((k) => {
                const b = best(k)
                return (
                  <tr key={k.key}>
                    <th scope="row"><span>{k.label}</span><small>{k.hint}</small></th>
                    {rows.map((r, i) => (
                      <td key={r.sc.id} className={i === b ? 'best' : ''}>
                        <span className="val mono">{r.series.complete ? k.fmt(r.m[k.key]) : '—'}</span>
                        {i === b && <span className="star"><Star size={12} aria-hidden="true" /> best</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr>
                <th scope="row"><span>Across the stay</span><small>Top: sunlight (striped = partly hidden). Bottom: Earth in view. Left edge is landing.</small></th>
                {rows.map((r) => <td key={r.sc.id}><Strip s={r.series} /><div className="stripax mono dim"><span>{fmtDayShort(r.sc.landingMs)}</span><span>+{r.sc.days} d</span></div></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <section className="slipwrap">
          <header>
            <div>
              <p className="eyebrow">If the schedule slips</p>
              <h2>How each site holds up as the landing date moves</h2>
              <p className="lede">Every point is a full stay starting on that date. Lettered pins are your scenarios. Flat lines are forgiving sites; deep swings mean the launch date matters.</p>
            </div>
            <label className="field"><span className="eyebrow">Stay length</span>
              <select value={stay} onChange={(e) => setStay(Number(e.target.value))}>{DURATIONS.slice(0, 4).map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
            </label>
          </header>
          <div className="slipgrid">
            <figure><figcaption>Sunlight available</figcaption><SlipChart rows={rows} stay={stay} metric="sun" /></figure>
            <figure><figcaption>Earth in view</figcaption><SlipChart rows={rows} stay={stay} metric="earth" /></figure>
          </div>
        </section>
      )}
      <label className="margin-row wide">
        <RadioTower size={14} aria-hidden="true" />
        <span>“Earth in view” counts only when Earth is at least</span>
        <select value={earthMarginDeg} onChange={(e) => setEarthMargin(Number(e.target.value))} aria-label="Antenna margin: how far Earth must be above the horizon">
          {EARTH_MARGINS.map((m) => <option key={m} value={m}>{m}°</option>)}
        </select>
        <span>above the hills (antenna margin). The same setting is used everywhere in KURO.</span>
      </label>
      <p className="notice wide"><span>{moon?.ok ? <><b>Terrain horizon.</b> Each site’s skyline is traced from NASA LOLA elevation out to 300 km, and Sun and Earth positions come from JPL DE421.</> : <><b>Smooth-sphere horizon.</b> Exact Sun and Earth geometry (JPL DE421) against an ideal horizon. Install LOLA elevation with <code>npm run fetch:moon</code> to add terrain.</>}</span></p>
    </main>
  )
}
