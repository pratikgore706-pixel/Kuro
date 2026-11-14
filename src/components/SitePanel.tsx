import { ArrowUpRight, Earth, GitCompareArrows, History, Sun, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fmtLat, fmtLon, quickMapUrl, type Site } from '../data/sites'
import { horizonAt, type Horizon, type Sky, type SkyEvent, type Summary } from '../engine/sky'
import { fmtDuration, fmtHours, fmtUtc } from '../engine/time'
import { useStore } from '../store'

function countdown(ev: SkyEvent | null, now: number, up: boolean, noun: string) {
  if (!ev) return { head: up ? `No ${noun}set within 60 days` : `No ${noun}rise within 60 days`, sub: up ? 'Stays above the horizon' : 'Stays below the horizon' }
  return { head: `${ev.type === 'set' ? 'Sets' : 'Rises'} in ${fmtDuration(ev.ms - now)}`, sub: `${fmtUtc(ev.ms)} UTC` }
}

/** One or two sentences a non-specialist can act on, generated from the computed window metrics. */
export function plainWords(m: Summary, days: number): string[] {
  const out: string[] = []
  if (m.sunAnyPct === 0) out.push(`No direct sunlight at any point in these ${days} days.`)
  else if (m.sunPct > 99.5) out.push(`The Sun stays in view for the whole ${days}-day stay.`)
  else out.push(`Sunlight is available ${m.sunAnyPct.toFixed(0)}% of the stay; the longest dark stretch lasts ${fmtHours(m.longestDarkH)}.`)
  if (m.sunAnyPct > 0) out.push(m.peakSunEl < 10 ? `The Sun never climbs above ${m.peakSunEl.toFixed(1)}° — it skims the horizon, so solar arrays must stand vertically and nearby hills decide everything.` : `The Sun peaks ${m.peakSunEl.toFixed(0)}° above the horizon.`)
  if (m.earthPct === 0) out.push('Earth never rises here: a relay satellite is the only way to talk to the lander.')
  else if (m.earthPct > 99.9) out.push('Earth never sets, so a direct radio link is geometrically possible throughout.')
  else out.push(`Earth is in view ${m.earthPct.toFixed(0)}% of the stay over ${m.commWindows} pass${m.commWindows === 1 ? '' : 'es'}; the longest gap is ${fmtHours(m.longestOutageH)}.`)
  return out
}

export function SitePanel({ site, sky, events, summary, horizon }: { site: Site; sky: Sky; events: { sun: SkyEvent | null; earth: SkyEvent | null }; summary: Summary; horizon: Horizon }) {
  const { cursorMs, days, range, landingMs } = useStore()
  const { setLanding, setCursor, addScenario } = useStore()
  const nav = useNavigate()
  const sunUp = sky.sunFrac > 0
  const sc = countdown(events.sun, cursorMs, sunUp, 'sun'), ec = countdown(events.earth, cursorMs, sky.earthUp, 'Earth')
  const canJump = site.eventMs !== undefined && site.eventMs > range[0] && site.eventMs < range[1]

  return (
    <aside className="panel sitepanel" aria-label="Site conditions">
      <div className="scroll">
        <div className="head">
          <p className="eyebrow">{site.group}</p>
          <h2>{site.name}</h2>
          <p className="mono coords">{fmtLat(site.lat)} · {fmtLon(site.lon)}</p>
          <p className="dim small">{site.note}</p>
        </div>

        {!sky.ok ? <p className="err pad" role="alert">This date is outside the ephemeris table (1966–2049). Nothing is extrapolated.</p> : (
          <div className="status">
            <section className={'card sun' + (sunUp ? '' : ' off')}>
              <header><Sun size={15} aria-hidden="true" /> Sun · power</header>
              <p className="state">{sky.sunFrac >= 0.999 ? 'In full view' : sunUp ? `${(sky.sunFrac * 100).toFixed(0)}% of disc visible` : 'Below horizon'}</p>
              <p className="mono nums"><span>elev <b>{sky.sunEl.toFixed(2)}°</b></span><span>az <b>{sky.sunAz.toFixed(1)}°</b></span>{horizon.kind === 'terrain' && <span title="Height of the terrain horizon in the Sun’s direction">hills <b>{horizonAt(horizon, sky.sunAz).toFixed(2)}°</b></span>}</p>
              <p className="count">{sc.head}</p>
              <p className="dim small mono">{sc.sub}</p>
            </section>
            <section className={'card earth' + (sky.earthUp ? '' : ' off')}>
              <header><Earth size={15} aria-hidden="true" /> Earth · comms</header>
              <p className="state">{sky.earthUp ? 'Line of sight' : 'No line of sight'}</p>
              <p className="mono nums"><span>elev <b>{sky.earthEl.toFixed(2)}°</b></span><span>az <b>{sky.earthAz.toFixed(1)}°</b></span>{horizon.kind === 'terrain' && <span title="Height of the terrain horizon in Earth’s direction">hills <b>{horizonAt(horizon, sky.earthAz).toFixed(2)}°</b></span>}</p>
              <p className="count">{ec.head}</p>
              <p className="dim small mono">{ec.sub}</p>
            </section>
          </div>
        )}

        <section className="block">
          <h3 className="eyebrow">This {days}-day stay · from {fmtUtc(landingMs).slice(0, 10)}</h3>
          <dl className="metrics">
            <div><dt>Sunlight available</dt><dd>{summary.sunPct.toFixed(0)}<small>%</small></dd></div>
            <div><dt>Earth in view</dt><dd>{summary.earthPct.toFixed(0)}<small>%</small></dd></div>
            <div><dt>Longest darkness</dt><dd>{fmtHours(summary.longestDarkH)}</dd></div>
            <div><dt>Longest comm gap</dt><dd>{fmtHours(summary.longestOutageH)}</dd></div>
            <div><dt>Peak Sun elevation</dt><dd>{summary.peakSunEl.toFixed(1)}<small>°</small></dd></div>
            <div><dt>Sun + Earth together</dt><dd>{summary.bothPct.toFixed(0)}<small>%</small></dd></div>
          </dl>
        </section>

        <section className="block words">
          <h3 className="eyebrow">In plain words</h3>
          {plainWords(summary, days).map((t, i) => <p key={i}>{t}</p>)}
        </section>

        {horizon.kind === 'terrain' && <p className="dim small src">{horizon.source}</p>}
        {horizon.kind === 'sphere' && (
          <p className="notice"><TriangleAlert size={14} aria-hidden="true" />
            <span><b>Smooth-sphere horizon.</b> Sun and Earth angles are exact (JPL DE421), but hills and crater rims are not yet applied. Near the poles, terrain can add or remove days of light — treat rise and set times as a first cut.</span>
          </p>
        )}
        <p className="dim small src">Coordinates: {site.source}{site.precision === 'feature' ? ' — a reference point for the region, not a chosen landing spot.' : '.'}</p>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => { addScenario(); nav('/compare') }}><GitCompareArrows size={15} aria-hidden="true" /> Add to comparison</button>
        {canJump && <button className="btn" onClick={() => { setLanding(site.eventMs!); setCursor(site.eventMs!) }}><History size={15} aria-hidden="true" /> Actual landing</button>}
        <a className="btn" href={quickMapUrl(site)} target="_blank" rel="noopener noreferrer">QuickMap <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
    </aside>
  )
}
