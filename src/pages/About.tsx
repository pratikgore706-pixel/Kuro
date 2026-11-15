import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Section } from '../components/site/Section'
import { SiteFooter } from '../components/site/SiteFooter'
import { TEAM, initials } from '../components/site/team'
import { useReveal } from '../components/site/useReveal'
import '../styles/site.css'

const HERO = `${import.meta.env.BASE_URL}hero/`

export function About() {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const total = String(TEAM.length).padStart(2, '0')

  return (
    <div className="kpage" ref={root}>
      <section className="kp-hero" aria-labelledby="about-title">
        <div className="kp-earth" aria-hidden="true"><img src={`${HERO}earth.png`} alt="" /></div>
        <div className="kp-hero-body">
          <p className="kp-label reveal"><span>About us</span>Team The Selenites</p>
          <h1 id="about-title" className="reveal d1">So the next landing lasts longer than <em>thirteen hours.</em></h1>
          <p className="kp-lede reveal d2">We are <b>The Selenites</b>, and KURO is our NASA Space Apps Challenge 2026 project. It turns NASA’s lunar data into something anyone can explore: where the light falls at the Moon’s South Pole, when Earth is in view, and how both change with the landing date.</p>
          <dl className="kp-stats reveal d3">
            <div><dt>Team</dt><dd>The Selenites</dd></div>
            <div><dt>Crew</dt><dd>{TEAM.length} people</dd></div>
            <div><dt>Challenge</dt><dd>NASA Space Apps 2026</dd></div>
            <div><dt>Focus</dt><dd>Lunar South Pole</dd></div>
          </dl>
        </div>
        <div className="kp-horizon" aria-hidden="true"><img src={`${HERO}story/mountains.webp`} alt="" /></div>
      </section>

      <Section n="01" label="Why we built it" title="A landing site is more than a coordinate.">
        <p className="kp-p">On <b>March 6, 2025</b>, Intuitive Machines’ Athena lander reached the Moon’s South Pole region. It came down roughly 250 metres from its target, inside a crater, and came to rest on its side. A mission planned for about ten days ended after approximately thirteen hours.</p>
        <p className="kp-p">At the South Pole the Sun skims the horizon, a ridge can block it for days, and Earth comes and goes from view. Slope, sunlight and the radio link all depend on the exact spot and the exact date — and they are hard to judge together. We wanted a tool that puts them side by side, on the real terrain, before anyone chooses where to land.</p>
      </Section>

      <Section n="02" label="What we built" title="One place to see the Moon’s South Pole clearly.">
        <div className="kp-grid">
          <article>
            <p className="kp-k">Story</p>
            <h3>Thirteen Hours</h3>
            <p>A scroll-driven story of the Athena landing, told with our KURO rover — why sunlight and terrain decide how long a mission lasts.</p>
            <Link to="/">Watch the story <ArrowRight size={13} aria-hidden="true" /></Link>
          </article>
          <article>
            <p className="kp-k">Explorer</p>
            <h3>The Moon in 3D</h3>
            <p>Pick a landing date and see all 78 candidate sites ranked, then fly down and drive the rover on NASA LOLA terrain, with real sunlight, shadows and Earth in view.</p>
            <Link to="/explorer">Open the Explorer <ArrowRight size={13} aria-hidden="true" /></Link>
          </article>
          <article>
            <p className="kp-k">Compare</p>
            <h3>The best sites, side by side</h3>
            <p>The top-ranked sites as live rover views on one shared clock, so you can watch the light and the Earth link at each one at the same moment.</p>
            <Link to="/compare">Compare sites <ArrowRight size={13} aria-hidden="true" /></Link>
          </article>
          <article>
            <p className="kp-k">Data</p>
            <h3>Numbers you can check</h3>
            <p>Every Sun and Earth direction comes from JPL’s DE421 ephemeris and is cross-checked against NASA/JPL Horizons, live, in your browser.</p>
            <Link to="/data">See the data <ArrowRight size={13} aria-hidden="true" /></Link>
          </article>
        </div>
      </Section>

      <Section n="03" label="The crew" title="The Selenites, the people behind KURO.">
        <ul className="kp-crew">
          {TEAM.map((m, i) => (
            <li key={m.name} className="kp-member">
              <span className="kp-badge" aria-hidden="true">{initials(m.name)}<i /></span>
              <p className="kp-member-k">Crew {String(i + 1).padStart(2, '0')} / {total}</p>
              <h3>{m.name}</h3>
              {m.role && <p>{m.role}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section n="04" label="How we work" title="Three rules we kept.">
        <div className="kp-principles">
          <div><h3>Real data first</h3><p>Positions from JPL, terrain from NASA’s laser altimeter, colour from LRO. Nothing is invented to look better.</p></div>
          <div><h3>Say what’s illustrative</h3><p>Figures, micro-relief and the KURO rover’s telemetry are labelled as illustrative wherever they appear.</p></div>
          <div><h3>Show the limits</h3><p>Every tool says what it does not model. KURO is a planning and teaching aid, not a landing certification.</p></div>
        </div>
      </Section>

      <Section n="05" label="Thanks" title="Standing on NASA’s shoulders.">
        <p className="kp-p">The Selenites built KURO on open data and tools from NASA/JPL (DE421 and Horizons), NASA Goddard’s Planetary Geodesy Data Archive, the NASA PDS Geosciences Node, the LRO LOLA and LROC teams, LROC QuickMap and NASA Moon Trek. Full sources are on the <Link to="/data" className="kp-inline">Data page</Link>.</p>
        <p className="kp-note">Not affiliated with or endorsed by NASA</p>
      </Section>

      <section className="kp-cta">
        <h2 className="reveal">Find a better place to land.</h2>
        <p className="reveal d1">Pick a site and a date, and see where the Sun and Earth sit against the real terrain horizon.</p>
        <div className="kp-cta-row reveal d2">
          <Link to="/explorer" className="kp-btn">Explore the lunar South Pole <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/" className="kp-link">Back to the story <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
