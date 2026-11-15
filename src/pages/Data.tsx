import { useMemo, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Section } from '../components/site/Section'
import { SiteFooter } from '../components/site/SiteFooter'
import { SiteNav } from '../components/site/SiteNav'
import { useReveal } from '../components/site/useReveal'
import { getEphemeris } from '../engine/ephemeris'
import { checkAgainstHorizons } from '../engine/horizonsCheck'
import '../styles/site.css'

const STORY = `${import.meta.env.BASE_URL}hero/story/`

// Facts on this page follow the project's own Data & methods notes (src/pages/Methods.tsx)
// and README. The full technical version stays at /methods.

export function Data() {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const eph = getEphemeris()
  // the same check the test suite runs, recomputed live in the visitor's browser
  const hz = useMemo(() => { try { return eph ? checkAgainstHorizons() : null } catch { return null } }, [eph])

  return (
    <div className="kpage" ref={root}>
      <section className="kp-hero" aria-labelledby="data-title">
        <SiteNav />
        <div className="kp-hero-body">
          <p className="kp-label reveal"><span>Data</span>Sources &amp; accuracy</p>
          <h1 id="data-title" className="reveal d1">Every number<br />has a <em>source.</em></h1>
          <p className="kp-lede reveal d2">KURO works out sunlight, shadows and Earth visibility from published NASA data, right in your browser. Here is what it uses, how closely it has been checked, and where its limits are.</p>
          <dl className="kp-stats reveal d3">
            <div><dt>Sun &amp; Earth</dt><dd>JPL DE421</dd></div>
            <div><dt>Terrain</dt><dd>NASA LOLA</dd></div>
            <div><dt>Finest pole grid</dt><dd>80 m</dd></div>
            <div><dt>Checked vs Horizons</dt><dd>≤ 0.02°</dd></div>
          </dl>
        </div>
        <div className="kp-horizon" aria-hidden="true"><img src={`${STORY}mountains.webp`} alt="" /></div>
      </section>

      <Section n="01" label="The sky" title="Where the Sun and Earth really are.">
        <p className="kp-p">Positions come from <b>JPL DE421</b>, NASA’s planetary and lunar ephemeris, including the Moon’s own libration. They are rotated into the Moon’s mean-Earth / polar-axis frame (MOON_ME) — the frame NASA’s LOLA polar elevation data is delivered in — so the sky and the ground share one coordinate system.</p>
        <p className="kp-p">A table of Sun and Earth directions is pre-computed every 12 hours from 1966 to 2049 and interpolated in the browser. Nothing is fetched from a server, and nothing is extrapolated beyond the table.</p>
        <dl className="kp-facts">
          <div><dt>Interpolation error</dt><dd>≤ 0.0012° Sun<small>≤ 0.0004° Earth, vs direct DE421</small></dd></div>
          <div><dt>Apollo 11 check</dt><dd>10.7°<small>Sun elevation; record ≈ 10.8°</small></dd></div>
          <div><dt>Coverage</dt><dd>1966 – 2049<small>every 12 hours</small></dd></div>
        </dl>
      </Section>

      <Section n="02" label="Verification" title="Checked against NASA/JPL Horizons.">
        <p className="kp-p">Horizons is NASA’s reference for where solar-system bodies appear from any point — including a spot on the Moon. We stored its Sun and Earth directions for ten sites, every 61 hours from November 2026 to May 2027. KURO’s test suite fails if any of its own answers differs by more than <b>0.02°</b>.</p>
        <div className="kp-live" aria-live="polite">
          <p className="kp-live-k"><i aria-hidden="true" />Recomputed in your browser</p>
          {hz ? (
            <>
              <p>{hz.total.toLocaleString()} directions checked just now. Largest difference: {hz.worstSep.toFixed(4)}° — about {(hz.worstSep * 3600).toFixed(0)} arcseconds.</p>
              <small>About 0.006° of that is stellar aberration, which Horizons includes and KURO does not. For scale, the Sun’s own radius in the sky is 0.27°.</small>
            </>
          ) : (
            <p>The live check runs once the ephemeris has loaded.</p>
          )}
        </div>
      </Section>

      <Section n="03" label="The ground" title="Terrain from NASA’s laser altimeter.">
        <p className="kp-p">Elevation comes from the <b>Lunar Orbiter Laser Altimeter (LOLA)</b> on NASA’s Lunar Reconnaissance Orbiter. Three products are downloaded once and converted for the browser by averaging only — no terrain detail is invented.</p>
        <dl className="kp-rows">
          <div><dt>Whole Moon</dt><dd>NASA SVS CGI Moon Kit elevation, from LOLA gridded data</dd><span className="kp-res">≈ 3.8 km</span></div>
          <div><dt>South Pole, 80–90°S</dt><dd>NASA GSFC PGDA product 90, LDEM_80S_80MPP (Barker et al. 2023), resampled</dd><span className="kp-res">320 m</span></div>
          <div><dt>Pole core</dt><dd>The same product at native resolution, a 164 km square around the pole</dd><span className="kp-res">80 m</span></div>
          <div><dt>Colour</dt><dd>LROC Wide Angle Camera mosaic; NASA Moon Trek tiles online when the local copy is missing</dd><span className="kp-res">WAC</span></div>
        </dl>
      </Section>

      <Section n="04" label="Light & shadow" title="Horizons traced from real terrain.">
        <p className="kp-p">For every site, the skyline is traced along <b>360 bearings out to 300 km</b>, from an observer 2 m above the ground, with the Moon’s curvature. Sunlight, Earth visibility and every countdown use that horizon. In the 3D views, the graphics card marches the elevation grid towards the Sun and Earth for every cell, so shadows come from the terrain itself.</p>
        <p className="kp-p"><b>Libration matters at the pole.</b> Earth wobbles in the lunar sky by up to about 7.9° east–west and 6.7° north–south. From the South Pole it climbs to about 6.5° above a level horizon and is in view 40–53% of each month (2026–2027) — which is why contact there comes and goes in two-week cycles.</p>
        <dl className="kp-facts">
          <div><dt>Horizon bearings</dt><dd>360</dd></div>
          <div><dt>Horizon reach</dt><dd>300 km</dd></div>
          <div><dt>Earth at the pole</dt><dd>up to ~6.5°<small>above a level horizon</small></dd></div>
        </dl>
      </Section>

      <Section n="05" label="Honest limits" title="What we don’t model — and what is illustrative.">
        <div className="kp-cols">
          <div>
            <h3>Not modelled</h3>
            <ul className="kp-list">
              <li>Light scattered between crater walls.</li>
              <li>A full thermal model — KURO gives a radiative-balance estimate, good to a few tens of degrees.</li>
              <li>Terrain beyond the loaded square for the shadow layers (300 km at the pole).</li>
              <li>Stellar aberration, about 0.006°.</li>
            </ul>
          </div>
          <div>
            <h3>Illustrative only</h3>
            <ul className="kp-list">
              <li>Micro-relief closer than LOLA’s 80 m in the Drone and Rover views.</li>
              <li>The astronaut, rover and orbiter figures, drawn for scale.</li>
              <li>The Explorer rover’s battery readout.</li>
              <li>The KURO rover in the landing story — a fictional character whose telemetry is simulated, not Athena data.</li>
            </ul>
          </div>
        </div>
        <p className="kp-note">A planning and teaching aid — not a tool for landing certification</p>
      </Section>

      <Section n="06" label="Sources" title="Built on open NASA science.">
        <ul className="kp-refs">
          <li><b>JPL DE421</b> — Folkner, Williams &amp; Boggs (2009); DE421 lunar frames memo, NASA/JPL.</li>
          <li><b>LOLA south-pole elevation</b> — Barker et al. (2023), Planetary Science Journal 4, 183; NASA GSFC PGDA.</li>
          <li><b>CGI Moon Kit</b> — NASA Scientific Visualization Studio: LROC colour and LOLA elevation maps.</li>
          <li><b>LRO Wide Angle Camera mosaic</b> — via NASA Moon Trek (NASA/GSFC/Arizona State University).</li>
          <li><b>JPL Horizons</b> — Giorgini et al., NASA/JPL Solar System Dynamics Group.</li>
          <li><b>Permanently shadowed regions</b> — LOLA team, South Pole at 240 m, via NASA Moon Trek.</li>
          <li><b>Stars</b> — Hipparcos and Yale Bright Star catalogues, via d3-celestial (Olaf Frohn).</li>
          <li><b>Lunar rotation</b> — Archinal et al. (2018), IAU WGCCRE report.</li>
          <li><b>Surface temperature</b> — Vasavada et al. (2012) and Paige et al. (2010), LRO Diviner.</li>
          <li><b>Slope</b> — Horn (1981); solar irradiance — Kopp &amp; Lean (2011).</li>
        </ul>
      </Section>

      <section className="kp-cta">
        <h2 className="reveal">Check any number yourself.</h2>
        <p className="reveal d1">The full technical notes list every product, test and formula. Or open the Explorer and see the data at work on the real terrain.</p>
        <div className="kp-cta-row reveal d2">
          <Link to="/explorer" className="kp-btn">Open the Explorer <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/methods" className="kp-link">Full technical notes <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
