import { Astronaut } from '../components/Art'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { SkyChart } from '../components/SkyChart'
import { SITES } from '../data/sites'
import { SPHERE_HORIZON } from '../engine/sky'
import { fmtDuration, startOfUtcDay } from '../engine/time'
import { useEvents, useSeries, useSkyAt } from '../hooks'

const SITE = SITES[0] // IM-2 Athena, Mons Mouton

function LiveSky() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  const { series } = useSeries(SITE, startOfUtcDay(now), 30, 600)
  const sky = useSkyAt(SITE, now)
  const ev = useEvents(SITE, now)
  return (
    <figure className="livesky">
      <figcaption>
        <span className="live"><i /> Live</span>
        <span>The sky over Mons Mouton right now, and for the next 30 days</span>
      </figcaption>
      <SkyChart series={series} horizon={SPHERE_HORIZON} sky={sky} />
      <dl>
        <div><dt>Sun</dt><dd className="mono">{sky.sunEl.toFixed(2)}°</dd><dd className="dim">{ev.sun ? `${ev.sun.type === 'set' ? 'sets' : 'rises'} in ${fmtDuration(ev.sun.ms - now)}` : 'no change in 60 d'}</dd></div>
        <div><dt>Earth</dt><dd className="mono">{sky.earthEl.toFixed(2)}°</dd><dd className="dim">{ev.earth ? `${ev.earth.type === 'set' ? 'sets' : 'rises'} in ${fmtDuration(ev.earth.ms - now)}` : 'no change in 60 d'}</dd></div>
      </dl>
    </figure>
  )
}

export function Landing() {
  return (
    <div className="landing">
      <header className="lnav">
        <Brand size={24} />
        <nav aria-label="Primary">
          <Link to="/explorer">Explorer</Link>
          <Link to="/compare">Compare</Link>
          <Link to="/methods">Data &amp; methods</Link>
        </nav>
        <Link className="btn" to="/explorer">Launch explorer <ArrowRight size={14} aria-hidden="true" /></Link>
      </header>

      <section className="hero">
        <div className="copy">
          <p className="eyebrow">Lunar landing site × date explorer</p>
          <h1>Explore the Moon.<br />Understand every landing.</h1>
          <p className="lede">Pick a site and a date. KURO shows where the Sun and Earth sit against the horizon, how long the light and the radio link last, and what changes if the schedule slips.</p>
          <div className="cta">
            <Link className="btn primary lg" to="/explorer">Start exploring <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link className="btn lg" to="/explorer?tour">Take the 2-minute tour</Link>
          </div>
        </div>
        <LiveSky />
        <div className="limb" aria-hidden="true" />
        <Astronaut size={150} className="hero-astro" />
      </section>

      <section className="facts" aria-label="Why the south pole is hard">
        <p className="eyebrow">Why the south pole is different</p>
        <div className="grid3">
          <article><h3>1.5°</h3><p>The highest the Sun ever climbs at the lunar pole. It circles the horizon instead of crossing the sky, so a single ridge can mean a month of shadow.</p></article>
          <article><h3>±6.7°</h3><p>How far Earth bobs above and below the polar horizon each month. A direct radio link there comes and goes on a two-week rhythm.</p></article>
          <article><h3>250 m</h3><p>How far IM-2 Athena came down from its target on Mons Mouton in March 2025 — into a small crater, on its side, arrays out of the Sun. Metres and days both matter.</p></article>
        </div>
      </section>

      <section className="what">
        <div>
          <p className="eyebrow">What KURO does</p>
          <h2>The numbers mission planners ask for first, without the specialist tools.</h2>
        </div>
        <ol>
          <li><h3>See the sky from the surface</h3><p>A panorama of the local horizon with the Sun and Earth tracked across the whole stay, and a countdown to the next sunset and Earthset.</p></li>
          <li><h3>Compare scenarios side by side</h3><p>Up to six site–date combinations in one table: sunlight, longest darkness, Earth visibility, longest comm gap.</p></li>
          <li><h3>Test a schedule slip</h3><p>One chart shows how every site performs for each landing date across the next six months.</p></li>
        </ol>
      </section>

      <footer className="lfoot">
        <Brand size={18} />
        <p>Built for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA. Ephemeris: JPL DE421. Imagery: NASA Moon Trek / LROC.</p>
      </footer>
    </div>
  )
}
