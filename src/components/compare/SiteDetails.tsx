import { useEffect, useRef, useState } from 'react'
import { Trophy, X } from 'lucide-react'
import { runs, sunState } from '../Timeline'
import { fmtLat, fmtLon } from '../../data/sites'
import type { Series } from '../../engine/sky'
import { fmtDayShort } from '../../engine/time'
import { RANKING_WEIGHTS, type RankedSite } from '../../services/api'
import { Compare as ScenarioLab } from '../../pages/Compare'
import { CATS, METRICS, catLabel, diffLine, placing, points, verdict } from './compareText'

function Stay({ s }: { s: Series }) {
  const W = 1000, x = (i: number) => (i / (s.n - 1)) * W
  return (
    <svg className="sd-stay" viewBox={`0 0 ${W} 22`} preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width={W} height="9" className="bg" /><rect x="0" y="13" width={W} height="9" className="bg" />
      {runs(s.n, sunState(s)).map(([a, b, st]) => st > 0 && <rect key={'s' + a} x={x(a)} y="0" width={Math.max(1, x(Math.min(b, s.n - 1)) - x(a))} height="9" className={st === 2 ? 'sun' : 'sun part'} />)}
      {runs(s.n, (i) => s.earthUp[i]).map(([a, b, st]) => st > 0 && <rect key={'e' + a} x={x(a)} y="13" width={Math.max(1, x(Math.min(b, s.n - 1)) - x(a))} height="9" className="earth" />)}
    </svg>
  )
}

export function SiteDetails({ r, rank, shown, series, landingMs, days, onClose }: {
  r: RankedSite; rank: number; shown: RankedSite[]; series: Record<string, Series | null>; landingMs: number; days: number; onClose: () => void
}) {
  const [tab, setTab] = useState<'why' | 'lab'>('why')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [r.siteId])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const v = verdict(r, shown)
  const ordered = [...shown].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const total = (Object.values(RANKING_WEIGHTS) as number[]).reduce((a, b) => a + b, 0)

  return (
    <div className="cmpx-modal sd" role="dialog" aria-modal="true" aria-labelledby="sd-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sd-box">
        <header className="sd-head">
          <span className="sd-rank mono">{String(rank).padStart(2, '0')}</span>
          <div className="sd-name">
            <p className="cmpx-kicker">Site details · landing {fmtDayShort(landingMs)} · {days}-day stay</p>
            <h2 id="sd-title">{r.site.name}</h2>
            <p className="sd-meta"><span className="mono">{fmtLat(r.site.lat, 2)} · {fmtLon(r.site.lon, 2)}</span> {r.site.note}</p>
          </div>
          <div className="sd-score"><b>{r.score === null ? '—' : Math.round(r.score)}</b><small className="mono">out of 100</small></div>
          <button ref={closeRef} className="cmpx-x" onClick={onClose} aria-label="Close details"><X size={16} /></button>
        </header>
        <nav className="sd-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'why'} className={tab === 'why' ? 'on' : ''} onClick={() => setTab('why')}>Why this site</button>
          <button role="tab" aria-selected={tab === 'lab'} className={tab === 'lab' ? 'on' : ''} onClick={() => setTab('lab')}>Every number · scenario lab</button>
        </nav>

        {tab === 'why' ? (
          <div className="sd-body">
            <section className="sd-verdict">
              <img src={`${import.meta.env.BASE_URL}compare/rover-side.webp`} alt="" className="sd-avatar" />
              <div>
                <h3>{ordered[0]?.siteId === r.siteId && <Trophy size={16} aria-hidden="true" />}{v.title}</h3>
                <p className="sd-lead">{v.lead}</p>
                {v.reasons.length > 0 && <ul>{v.reasons.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                {v.weak && <p className="sd-weak">{v.weak}</p>}
              </div>
            </section>

            <section className="sd-sec">
              <h4>How the score is made</h4>
              <p className="sd-cap">Five things are scored from 0 to 100, then mixed with fixed weights: {CATS.map((k) => `${catLabel(k).toLowerCase()} ${Math.round((RANKING_WEIGHTS[k] / total) * 100)}%`).join(', ')}. Each bar shows how many of a site’s points came from each part.</p>
              <div className="sd-stack">
                {ordered.map((o) => {
                  const p = points(o)
                  return (
                    <div key={o.siteId} className={'sd-srow' + (o.siteId === r.siteId ? ' me' : '')}>
                      <span className="nm">{o.site.name}</span>
                      <span className="bar">{CATS.map((k) => p[k] !== null && <i key={k} className={'c-' + k} style={{ width: `${p[k]}%` }} title={`${catLabel(k)}: ${p[k]!.toFixed(1)} points`} />)}</span>
                      <span className="tot mono">{o.score === null ? '—' : Math.round(o.score)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="sd-legend">{CATS.map((k) => <span key={k}><i className={'c-' + k} />{catLabel(k)}</span>)}</div>
              {r.componentScores.terrain === null && <p className="sd-cap">No slope data at this site, so its score is built from the parts that are available.</p>}
            </section>

            <section className="sd-sec">
              <h4>The six questions that decide it</h4>
              <div className="sd-qs">
                {METRICS.map((m) => {
                  const val = m.get(r), pl = placing(m, r, shown), d = diffLine(m, r, shown)
                  const vals = shown.map((o) => m.get(o)).filter((x): x is number => x !== null && isFinite(x))
                  const max = m.max(vals) || 1
                  return (
                    <article key={m.key} className={'sd-q' + (pl?.best ? ' best' : '')}>
                      <header>
                        <h5>{m.q}</h5>
                        {pl && <span className={'sd-place mono' + (pl.best ? ' best' : '')}>{pl.words}</span>}
                      </header>
                      <p className="sd-val">{val === null || !isFinite(val) ? 'no data' : m.fmt(val)}</p>
                      {d && <p className="sd-diff">{d.charAt(0).toUpperCase() + d.slice(1)}.</p>}
                      <ul className="sd-bars" aria-label={`${m.short} for each site`}>
                        {shown.map((o) => {
                          const x = m.get(o)
                          return (
                            <li key={o.siteId} className={o.siteId === r.siteId ? 'me' : ''}>
                              <span className="nm">{o.site.name}</span>
                              <span className="track"><i style={{ width: `${x === null || !isFinite(x) ? 0 : Math.max(1.5, Math.min(100, (x / max) * 100))}%` }} /></span>
                              <span className="v mono">{x === null || !isFinite(x) ? '—' : m.fmt(x)}</span>
                            </li>
                          )
                        })}
                      </ul>
                      <p className="sd-why">{m.why}{m.better === 'low' ? ' Shorter bar is better.' : ' Longer bar is better.'}</p>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="sd-sec">
              <h4>Sun and Earth, hour by hour</h4>
              <p className="sd-cap">Each row is the whole {days}-day stay from landing (left) to the end (right). Gold: the Sun is up (faded: partly hidden by hills). Blue: Earth is in view. Gaps are darkness or radio silence.</p>
              <div className="sd-stays">
                {ordered.map((o) => series[o.siteId] && (
                  <div key={o.siteId} className={'sd-strow' + (o.siteId === r.siteId ? ' me' : '')}>
                    <span className="nm">{o.site.name}</span>
                    <Stay s={series[o.siteId]!} />
                  </div>
                ))}
                <div className="sd-strow ax mono"><span /><span className="ends"><span>{fmtDayShort(landingMs)}</span><span>+{days} days</span></span></div>
              </div>
            </section>

            <section className="sd-honest">
              <h4>What these numbers cannot see</h4>
              <p>Slope comes from NASA LOLA elevation on an 80 m grid, so single boulders, small craters and the exact touchdown spot are invisible to it. Sun and Earth positions come from JPL’s DE421 tables and the skyline from LOLA terrain. Athena’s own site scores well here, and it still landed on its side — a good score narrows the search, it does not promise a safe landing.</p>
            </section>
          </div>
        ) : (
          <div className="sd-body sd-lab">
            <p className="sd-cap">The full numbers table and the “what if the launch slips” charts. Build your own site-and-date scenarios here; they are saved in this browser.</p>
            <ScenarioLab />
          </div>
        )}
      </div>
    </div>
  )
}
