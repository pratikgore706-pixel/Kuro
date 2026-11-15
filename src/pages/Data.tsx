import { useMemo, useRef } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Section } from '../components/site/Section'
import { SiteFooter } from '../components/site/SiteFooter'
import { useReveal } from '../components/site/useReveal'
import { getEphemeris } from '../engine/ephemeris'
import { checkAgainstHorizons } from '../engine/horizonsCheck'
import '../styles/site.css'

const STORY = `${import.meta.env.BASE_URL}hero/story/`

// Every source on this page is one the code actually uses (see scripts/fetch-moon-data.mjs, public/moon/manifest.json,
// public/data/ephemeris.json, src/engine/horizonsCheck.ts and the site links in src/data/sites.ts).

interface Tool { tag: string; by: string; name: string; what: string; uses: string[]; spec: string; href: string; cta: string }

/** The three NASA tools recommended with the challenge, and exactly how KURO uses each one. */
const TOOLS: Tool[] = [
  {
    tag: 'Sun & Earth positions', by: 'NASA Jet Propulsion Laboratory', name: 'JPL Horizons System',
    what: 'NASA’s reference for where the Sun, Earth and every other body appear from any point in the solar system, including a spot on the Moon.',
    uses: [
      'KURO’s Sun and Earth positions are checked against 1,440 Horizons directions for ten South Pole sites. The test suite fails if any differs by more than 0.02°.',
      'Every site in the Explorer opens a Horizons table of the Sun’s and Earth’s position from that exact spot, for your landing dates.',
    ],
    spec: 'Agreement ≤ 0.02°', href: 'https://ssd.jpl.nasa.gov/horizons/', cta: 'Open Horizons',
  },
  {
    tag: 'Surface imagery', by: 'NASA Solar System Treks', name: 'NASA Moon Trek',
    what: 'NASA’s interactive 3D Moon, built on Lunar Reconnaissance Orbiter imagery and terrain.',
    uses: [
      'The Moon you see in KURO is the LRO Wide Angle Camera global mosaic from Moon Trek, and sharper Moon Trek tiles stream in as you zoom (down to about 83 m per pixel).',
      'The “NASA shadowed regions” layer is the LOLA team’s map of permanently shadowed craters (240 m), loaded live from Moon Trek.',
      'Every site opens in Moon Trek, centred on it.',
    ],
    spec: 'LRO WAC · 240 m shadow map', href: 'https://trek.nasa.gov/moon/', cta: 'Open Moon Trek',
  },
  {
    tag: 'High-resolution view', by: 'LROC, Arizona State University', name: 'LROC QuickMap',
    what: 'The Lunar Reconnaissance Orbiter Camera team’s map of the Moon, with its sharpest imagery and terrain products.',
    uses: [
      'Every site in the Explorer opens QuickMap in its South Pole view, centred on the site and marked, so you can inspect the ground in LRO’s sharpest imagery.',
    ],
    spec: 'South Pole view per site', href: 'https://quickmap.lroc.asu.edu/', cta: 'Open QuickMap',
  },
]

interface Dataset { name: string; by: string; use: string; res: string; href: string }

/** The measurements KURO computes from, as recorded in the data files it ships. */
const DATASETS: Dataset[] = [
  { name: 'DE421 planetary and lunar ephemeris', by: 'NASA JPL', use: 'Where the Sun and Earth are, 1966–2049, including the Moon’s wobble (libration). Pre-computed every 12 hours and interpolated in the browser.', res: '12 h table', href: 'https://ssd.jpl.nasa.gov/planets/eph_export.html' },
  { name: 'LOLA South Pole elevation (PGDA product 90)', by: 'NASA Goddard, PGDA', use: 'The terrain, slopes and skylines of all 78 sites, and the 3D Pole, Drone and Rover views. Barker et al. (2023).', res: '80 m core · 320 m to 80°S', href: 'https://pgda.gsfc.nasa.gov/products/90' },
  { name: 'LOLA global elevation (LDEM_16)', by: 'NASA PDS Geosciences Node', use: 'The heights of the whole-Moon globe, and distant hills on each site’s horizon beyond the polar grid.', res: '≈ 3.8 km', href: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm' },
  { name: 'LRO Wide Angle Camera global mosaic', by: 'NASA Moon Trek · LROC', use: 'The Moon’s surface colour in every 3D view.', res: '4096 × 2048, live to 83 m', href: 'https://trek.nasa.gov/moon/' },
  { name: 'LOLA permanently shadowed regions', by: 'NASA Moon Trek · LOLA team', use: 'The shadowed-craters layer, and an independent check on KURO’s own shadow tracing.', res: '240 m', href: 'https://trek.nasa.gov/moon/' },
  { name: 'Artemis candidate landing regions', by: 'NASA', use: 'The nine South Pole regions that group the 78 candidate sites: Haworth, Malapert Massif, Mons Mouton, Mons Mouton Plateau, Nobile Rim 1 and 2, Peak near Cabeus B, de Gerlache Rim 2, Slater Plain.', res: '9 regions · 78 sites', href: 'https://ntrs.nasa.gov/citations/20250011660' },
]

export function Data() {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const eph = getEphemeris()
  // the same check the test suite runs, recomputed live in the visitor's browser
  const hz = useMemo(() => { try { return eph ? checkAgainstHorizons() : null } catch { return null } }, [eph])

  return (
    <div className="kpage" ref={root}>
      <section className="kp-hero" aria-labelledby="data-title">
        <div className="kp-hero-body">
          <p className="kp-label reveal"><span>Data</span>NASA sources &amp; accuracy</p>
          <h1 id="data-title" className="reveal d1">Built on <em>NASA data.</em></h1>
          <p className="kp-lede reveal d2">Every sunrise, shadow and Earth sighting in KURO is computed from published NASA measurements and checked against NASA/JPL’s own reference system. These are the datasets and tools KURO actually uses, and exactly what each one does.</p>
          <dl className="kp-stats reveal d3">
            <div><dt>NASA datasets &amp; tools</dt><dd>7</dd></div>
            <div><dt>Checked vs JPL Horizons</dt><dd>1,440 directions</dd></div>
            <div><dt>South Pole terrain</dt><dd>80 m</dd></div>
            <div><dt>Sun &amp; Earth</dt><dd>1966 – 2049</dd></div>
          </dl>
        </div>
        <div className="kp-horizon" aria-hidden="true"><img src={`${STORY}mountains.webp`} alt="" /></div>
      </section>

      <Section n="01" label="NASA resources" title="Three NASA tools behind every site.">
        <p className="kp-p">The challenge points to three NASA tools for understanding the lunar South Pole. KURO uses all three, and links every one of its 78 sites straight into them.</p>
        <div className="kp-tools">
          {TOOLS.map((t, i) => (
            <article key={t.name} className={`kp-tool reveal d${i + 1}`}>
              <p className="kp-tool-tag">{t.tag}</p>
              <h3>{t.name}</h3>
              <p className="kp-tool-by">{t.by}</p>
              <p className="kp-tool-what">{t.what}</p>
              <p className="kp-tool-k">In KURO</p>
              <ul className="kp-tool-uses">{t.uses.map((u) => <li key={u}>{u}</li>)}</ul>
              <div className="kp-tool-foot">
                <span className="kp-tool-spec">{t.spec}</span>
                <a href={t.href} target="_blank" rel="noopener noreferrer">{t.cta} <ArrowUpRight size={13} aria-hidden="true" /></a>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section n="02" label="Datasets" title="The measurements underneath.">
        <p className="kp-p">KURO downloads these NASA products once, converts them for the browser by averaging only, and ships them with the site. No terrain is invented, and nothing is fetched from a server to compute a result.</p>
        <div className="kp-ds" role="table" aria-label="NASA datasets used by KURO">
          <div className="kp-ds-head" role="row">
            <span role="columnheader">Dataset</span><span role="columnheader">What KURO uses it for</span><span role="columnheader">Detail</span>
          </div>
          {DATASETS.map((d) => (
            <div key={d.name} className="kp-ds-row reveal" role="row">
              <div role="cell" className="kp-ds-name">
                <a href={d.href} target="_blank" rel="noopener noreferrer">{d.name} <ArrowUpRight size={12} aria-hidden="true" /></a>
                <span>{d.by}</span>
              </div>
              <p role="cell">{d.use}</p>
              <span role="cell" className="kp-ds-res">{d.res}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="03" label="Verification" title="Checked against NASA/JPL Horizons.">
        <p className="kp-p">We stored Horizons’ Sun and Earth directions for ten South Pole sites, every 61 hours from November 2026 to May 2027. KURO recomputes all of them with its own engine; its test suite fails if any answer differs by more than <b>0.02°</b>.</p>
        <div className="kp-live" aria-live="polite">
          <p className="kp-live-k"><i aria-hidden="true" />Recomputed in your browser</p>
          {hz ? (
            <>
              <p>{hz.total.toLocaleString()} directions checked just now. Largest difference: {hz.worstSep.toFixed(4)}°, about {(hz.worstSep * 3600).toFixed(0)} arcseconds.</p>
              <small>About 0.006° of that is stellar aberration, which Horizons includes and KURO does not. For scale, the Sun’s own radius in the sky is 0.27°.</small>
            </>
          ) : (
            <p>The live check runs once the ephemeris has loaded.</p>
          )}
        </div>
        <dl className="kp-facts">
          <div><dt>Interpolation error</dt><dd>≤ 0.0012° Sun<small>≤ 0.0004° Earth, vs direct DE421</small></dd></div>
          <div><dt>Apollo 11 check</dt><dd>10.7°<small>Sun elevation; record ≈ 10.8°</small></dd></div>
          <div><dt>Frame</dt><dd>MOON_ME<small>the frame LOLA polar data uses</small></dd></div>
        </dl>
      </Section>

      <Section n="04" label="Light & shadow" title="Skylines traced from real terrain.">
        <p className="kp-p">For every site, the skyline is traced along <b>360 bearings out to 300 km</b> across the LOLA terrain, from 2 m above the ground, with the Moon’s curvature. Sunlight, Earth visibility, every countdown and the ranking use that skyline. In the 3D views, the graphics card traces the elevation grid towards the Sun and Earth for every point, so shadows come from the terrain itself.</p>
        <p className="kp-p"><b>Libration matters at the pole.</b> Earth wobbles in the lunar sky by up to about 7.9° east–west and 6.7° north–south. From the South Pole it climbs to about 6.5° above a level horizon and is in view 40–53% of each month (2026–2027), which is why contact there comes and goes in two-week cycles.</p>
        <dl className="kp-facts">
          <div><dt>Bearings per site</dt><dd>360</dd></div>
          <div><dt>Horizon reach</dt><dd>300 km</dd></div>
          <div><dt>Earth at the pole</dt><dd>up to ~6.5°<small>above a level horizon</small></dd></div>
        </dl>
      </Section>

      <Section n="05" label="Honest limits" title="What we don’t model, and what is illustrative.">
        <div className="kp-cols">
          <div>
            <h3>Not modelled</h3>
            <ul className="kp-list">
              <li>Light scattered between crater walls.</li>
              <li>A full thermal model; KURO gives a radiative-balance estimate, good to a few tens of degrees.</li>
              <li>Terrain beyond the loaded square for the shadow layers (300 km at the pole).</li>
              <li>Surface roughness and hazard maps finer than LOLA’s 80 m, so the score uses about 80% of the backend’s inputs.</li>
            </ul>
          </div>
          <div>
            <h3>Illustrative only</h3>
            <ul className="kp-list">
              <li>Micro-relief closer than LOLA’s 80 m in the Drone and Rover views.</li>
              <li>The astronaut, rover and orbiter figures, drawn for scale.</li>
              <li>The KURO rover in the landing story, a character whose telemetry is simulated, not Athena data.</li>
            </ul>
          </div>
        </div>
        <p className="kp-note">A planning and teaching aid, not a tool for landing certification</p>
      </Section>

      <Section n="06" label="References" title="Publications behind the data.">
        <ul className="kp-refs">
          <li><b>JPL DE421</b> · Folkner, Williams &amp; Boggs (2009), JPL IPN Progress Report 42-178; DE421 lunar orbit and librations memo, NASA/JPL.</li>
          <li><b>JPL Horizons</b> · Giorgini et al., NASA/JPL Solar System Dynamics Group.</li>
          <li><b>LOLA South Pole elevation</b> · Barker et al. (2023), Planetary Science Journal 4, 183; NASA GSFC PGDA.</li>
          <li><b>LOLA global elevation</b> · Smith et al. (2010), LRO Lunar Orbiter Laser Altimeter; NASA PDS Geosciences Node.</li>
          <li><b>LRO Wide Angle Camera</b> · Robinson et al. (2010), LROC; mosaic via NASA Moon Trek and LROC QuickMap (ASU).</li>
          <li><b>Artemis candidate regions</b> · George et al., NASA, update from thirteen to nine candidate regions (NTRS 20250011660).</li>
          <li><b>IM-2 Athena landing site</b> · NASA NSSDCA lunar landing site records.</li>
          <li><b>Lunar rotation</b> · Archinal et al. (2018), IAU WGCCRE report.</li>
          <li><b>Surface temperature</b> · Vasavada et al. (2012) and Paige et al. (2010), LRO Diviner.</li>
          <li><b>Stars</b> · Hipparcos and Yale Bright Star catalogues, via d3-celestial (Olaf Frohn).</li>
        </ul>
      </Section>

      <section className="kp-cta">
        <h2 className="reveal">See the data at work.</h2>
        <p className="reveal d1">Open the Explorer, pick a landing date, and follow any site straight into Horizons, Moon Trek and QuickMap.</p>
        <div className="kp-cta-row reveal d2">
          <Link to="/explorer" className="kp-btn">Open the Explorer <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/methods" className="kp-link">Full technical notes <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
