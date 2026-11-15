import { ArrowUpRight, BadgeCheck, Earth, GitCompareArrows, History, RadioTower, Sun, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { fmtLat, fmtLon, horizonsUrl, moonTrekUrl, quickMapUrl, type Site } from '../data/sites'
import { checkAgainstHorizons } from '../engine/horizonsCheck'
import { horizonAt, type Horizon, type Series, type Sky, type SkyEvent, type Summary } from '../engine/sky'
import { equilibriumK, fmtC, SHADOW_NOTE, sunOnGround, sunOnPanel } from '../engine/thermal'
import { fmtDuration, fmtHours, fmtUtc } from '../engine/time'
import { useFrame } from '../hooks'
import { EARTH_MARGINS, useStore } from '../store'
import { DateMatters } from './DateMatters'
import { HorizonStrip } from './HorizonStrip'
import { LibrationCard } from './LibrationCard'
import { NearbyMap } from './NearbyMap'

/** Next rise or set as a label, a big value and the exact instant. */
function countdown(ev: SkyEvent | null, now: number, up: boolean) {
  if (!ev) return { label: up ? 'Stays up for' : 'Stays down for', value: '60+ days', sub: up ? 'No setting in the next 60 days' : 'No rising in the next 60 days' }
  return { label: ev.type === 'set' ? 'Sets in' : 'Rises in', value: fmtDuration(ev.ms - now), sub: `${fmtUtc(ev.ms)} UTC` }
}

/** One or two sentences a non-specialist can act on, generated from the computed window metrics. */
export function plainWords(m: Summary, days: number): string[] {
  const out: string[] = []
  if (m.sunAnyPct === 0) out.push(`No direct sunlight at any point in these ${days} days.`)
  else if (m.sunPct > 99.5) out.push(`The Sun stays in view for the whole ${days}-day stay.`)
  else out.push(`Sunlight is available ${m.sunAnyPct.toFixed(0)}% of the stay; the longest dark stretch lasts ${fmtHours(m.longestDarkH)}.`)
  if (m.sunAnyPct > 0) out.push(m.peakSunEl < 10 ? `The Sun never climbs above ${m.peakSunEl.toFixed(1)}° — it skims the horizon, so solar arrays must stand vertically and nearby hills decide everything.` : `The Sun peaks ${m.peakSunEl.toFixed(0)}° above the horizon.`)
  if (m.peakGroundK > 0) out.push(`Level ground warms to about ${fmtC(m.peakGroundK)} at best; in shadow it drops below −170 °C, so equipment needs heaters to survive the dark.`)
  else out.push('The ground here stays in shadow and below −170 °C for the whole stay.')
  if (m.earthPct === 0) out.push('Earth never rises here: a relay satellite is the only way to talk to the lander.')
  else if (m.earthPct > 99.9) out.push('Earth never sets, so a direct radio link is geometrically possible throughout.')
  else out.push(`Earth is in view ${m.earthPct.toFixed(0)}% of the stay over ${m.commWindows} pass${m.commWindows === 1 ? '' : 'es'}; the longest gap is ${fmtHours(m.longestOutageH)}.`)
  return out
}

export function SitePanel({ site, sky, events, summary, series, horizon }: { site: Site; sky: Sky; events: { sun: SkyEvent | null; earth: SkyEvent | null }; summary: Summary; series: Series; horizon: Horizon }) {
  const frame = useFrame(site)
  const { cursorMs, days, range, landingMs, earthMarginDeg } = useStore()
  const { setLanding, setCursor, addScenario, setEarthMargin } = useStore()
  const nav = useNavigate()
  const sunUp = sky.sunFrac > 0
  const sc = countdown(events.sun, cursorMs, sunUp), ec = countdown(events.earth, cursorMs, sky.earthUp)
  const canJump = site.eventMs !== undefined && site.eventMs > range[0] && site.eventMs < range[1]
  // re-checked against stored NASA/JPL Horizons values every time the panel mounts (1,440 directions, a few ms)
  const hz = useMemo(() => { try { return checkAgainstHorizons() } catch { return null } }, [])
  const panelW = sunOnPanel(sky.sunFrac, sky.sunR), groundW = sunOnGround(sky.sunFrac, sky.sunEl, sky.sunR)
  const sunState = sky.sunFrac >= 0.999 ? 'In full view' : sunUp ? `${(sky.sunFrac * 100).toFixed(0)}% of the disc in view` : 'Below the horizon'
  const earthState = sky.earthUp ? 'In view' : 'Not in view'
  const hills = (az: number) => (horizon.kind === 'terrain' ? <span title="Height of the terrain horizon in that direction">hills {horizonAt(horizon, az).toFixed(2)}°</span> : null)

  return (
    <aside className="panel sitepanel sp" aria-label="Site conditions">
      <div className="scroll">
        <header className="sp-head">
          <p className="sp-group">{site.group}</p>
          <h2>{site.name}</h2>
          <p className="sp-coords">{fmtLat(site.lat)} &nbsp;{fmtLon(site.lon)}</p>
          <p className="sp-note">{site.note}</p>
        </header>

        {!sky.ok ? <p className="err pad" role="alert">This date is outside the ephemeris table (1966–2049). Nothing is extrapolated.</p> : (
          <>
            <HorizonStrip horizon={horizon} sky={sky} />
            <section className="sp-now" aria-label="Sun and Earth at the chosen time">
              <div className={'sp-body sun' + (sunUp ? ' up' : '')}>
                <span className="sp-ico" aria-hidden="true"><Sun size={16} /></span>
                <div className="sp-what">
                  <b>Sun <span className="sp-role">power</span></b>
                  <span className="sp-state">{sunState}</span>
                  <small>elevation {sky.sunEl.toFixed(2)}°, azimuth {sky.sunAz.toFixed(1)}°{horizon.kind === 'terrain' ? ', ' : ''}{hills(sky.sunAz)}</small>
                </div>
                <div className="sp-when"><small>{sc.label}</small><b>{sc.value}</b><small>{sc.sub}</small></div>
              </div>
              <div className={'sp-body earth' + (sky.earthUp ? ' up' : '')}>
                <span className="sp-ico" aria-hidden="true"><Earth size={16} /></span>
                <div className="sp-what">
                  <b>Earth <span className="sp-role">radio</span></b>
                  <span className="sp-state">{earthState}</span>
                  <small>elevation {sky.earthEl.toFixed(2)}°, azimuth {sky.earthAz.toFixed(1)}°{horizon.kind === 'terrain' ? ', ' : ''}{hills(sky.earthAz)}</small>
                </div>
                <div className="sp-when"><small>{ec.label}</small><b>{ec.value}</b><small>{ec.sub}</small></div>
              </div>
              <label className="sp-margin">
                <RadioTower size={14} aria-hidden="true" />
                <span>Antenna needs Earth at least</span>
                <select value={earthMarginDeg} onChange={(e) => setEarthMargin(Number(e.target.value))} aria-label="Antenna margin: how far Earth must be above the horizon">
                  {EARTH_MARGINS.map((m) => <option key={m} value={m}>{m}°</option>)}
                </select>
                <span>above the hills</span>
              </label>
            </section>
          </>
        )}

        <section className="sp-sec">
          <h3>This {days}-day stay</h3>
          <p className="sp-sub">From {fmtUtc(landingMs)} UTC</p>
          {!series.complete ? <p className="err pad" role="alert">Part of this stay is past the end of the Sun and Earth table (2049). Choose an earlier landing or a shorter stay; nothing is extrapolated.</p> : (
          <dl className="sp-grid">
            <div><dt>Sunlight available</dt><dd>{summary.sunPct.toFixed(0)}<small>%</small></dd></div>
            <div><dt>Earth in view</dt><dd>{summary.earthPct.toFixed(0)}<small>%</small></dd></div>
            <div><dt>Longest darkness</dt><dd>{fmtHours(summary.longestDarkH)}</dd></div>
            <div><dt>Longest radio gap</dt><dd>{fmtHours(summary.longestOutageH)}</dd></div>
            <div><dt>Highest Sun</dt><dd>{summary.peakSunEl.toFixed(1)}<small>°</small></dd></div>
            <div><dt>Sun and Earth together</dt><dd>{summary.bothPct.toFixed(0)}<small>%</small></dd></div>
          </dl>)}
        </section>

        <section className="sp-sec words">
          <h3>In plain words</h3>
          {plainWords(summary, days).map((t, i) => <p key={i}>{t}</p>)}
        </section>

        {series.complete && <DateMatters frame={frame} horizon={horizon} landingMs={landingMs} days={days} margin={earthMarginDeg} summary={summary} />}

        {sky.ok && (
          <section className="sp-sec heat" aria-label="Heat and light">
            <h3>Heat and light <span>at the chosen time</span></h3>
            <dl className="sp-grid">
              <div><dt>On a Sun-facing panel</dt><dd>{panelW.toFixed(0)}<small> W/m²</small></dd></div>
              <div><dt>On level ground</dt><dd>{groundW.toFixed(0)}<small> W/m²</small></dd></div>
              <div><dt>Ground now (estimate)</dt><dd>{groundW > 0 ? fmtC(equilibriumK(groundW)) : <span className="cold">below −170 °C</span>}</dd></div>
              <div><dt>Warmest this stay</dt><dd>{summary.peakGroundK > 0 ? fmtC(summary.peakGroundK) : <span className="cold">never lit</span>}</dd></div>
            </dl>
            <p className="sp-fine">{groundW > 0 ? `Estimate from sunlight in = heat radiated out, for bare regolith.${sky.sunEl < 10 ? ' The Sun is so low here that level ground gets only a sliver of the light a Sun-facing panel does.' : ''}` : SHADOW_NOTE}</p>
          </section>
        )}


        <LibrationCard frame={frame} horizon={horizon} series={series} margin={earthMarginDeg} days={days} cursorMs={cursorMs} />

        <NearbyMap site={site} />

        <section className="sp-sec sp-check" aria-label="Check these numbers">
          <h3>Check it yourself</h3>
          {hz && hz.total > 0 && (
            <Link className="hz-badge" to="/methods#horizons" title="How KURO is checked against NASA/JPL Horizons">
              <BadgeCheck size={15} aria-hidden="true" />
              <span>Sun and Earth positions agree with <b>NASA/JPL Horizons</b> to within {hz.worstSep < 0.01 ? '0.01' : hz.worstSep.toFixed(2)}°</span>
            </Link>
          )}
          <div className="nl-row" aria-label="Open this site in NASA tools">
            <a href={quickMapUrl(site)} target="_blank" rel="noopener noreferrer" title="LROC QuickMap, centred on this site">QuickMap <ArrowUpRight size={13} aria-hidden="true" /></a>
            <a href={moonTrekUrl(site)} target="_blank" rel="noopener noreferrer" title="NASA Moon Trek, centred on this site">Moon Trek <ArrowUpRight size={13} aria-hidden="true" /></a>
            <a href={horizonsUrl(site, 'sun', landingMs, days)} target="_blank" rel="noopener noreferrer" title="JPL Horizons table of the Sun’s azimuth and elevation from this site across the stay">Horizons: Sun <ArrowUpRight size={13} aria-hidden="true" /></a>
            <a href={horizonsUrl(site, 'earth', landingMs, days)} target="_blank" rel="noopener noreferrer" title="JPL Horizons table of Earth’s azimuth and elevation from this site across the stay">Horizons: Earth <ArrowUpRight size={13} aria-hidden="true" /></a>
          </div>
          {horizon.kind === 'terrain' && <p className="sp-fine">{horizon.source}</p>}
          {horizon.kind === 'sphere' && (
            <p className="notice"><TriangleAlert size={14} aria-hidden="true" />
              <span><b>Smooth-sphere horizon.</b> Sun and Earth angles are exact (JPL DE421), but hills and crater rims are not yet applied. Near the poles, terrain can add or remove days of light — treat rise and set times as a first cut.</span>
            </p>
          )}
          <p className="sp-fine">Coordinates: {site.source}{site.precision === 'feature' ? ' — a reference point for the region, not a chosen landing spot.' : '.'}</p>
        </section>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => { addScenario(); nav('/compare') }}><GitCompareArrows size={15} aria-hidden="true" /> Add to comparison</button>
        {canJump && <button className="btn" onClick={() => { setLanding(site.eventMs!); setCursor(site.eventMs!) }}><History size={15} aria-hidden="true" /> Go to the actual landing</button>}
      </div>
    </aside>
  )
}
