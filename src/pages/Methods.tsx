import { useMemo } from 'react'
import { GROUPS, REFERENCE_SITES, SITES } from '../data/sites'
import { getEphemeris } from '../engine/ephemeris'
import { checkAgainstHorizons } from '../engine/horizonsCheck'
import { BOND_ALBEDO, EMISSIVITY, SOLAR_CONSTANT } from '../engine/thermal'
import { RANKING_WEIGHTS } from '../services/api'
import { PARITY_CASES, SAFETY_WEIGHTS, scoreBackend, TERRAIN_WEIGHTS, THRESHOLDS } from '../services/backendScore'

/** Share of the backend's inputs a South Pole site has in KURO: slope yes, roughness and hazard map no. */
const COVERAGE = Math.round(scoreBackend({ slopeDeg: 1, roughnessM: null, summary: { sampleCount: 1, sunVisiblePct: 50, earthVisiblePct: 50, jointPct: 50, longestDarkS: 0, longestOutageS: 0 } }).dataCoverage)

export function Methods() {
  const e = getEphemeris()
  const hz = useMemo(() => { try { return e ? checkAgainstHorizons() : null } catch { return null } }, [e])
  const name = (id: string) => REFERENCE_SITES.find((s) => s.id === id)?.name ?? id
  const pct = (w: number) => `${Math.round(w * 100)}%`
  return (
    <main className="prose">
      <p className="eyebrow">Data &amp; methods</p>
      <h1>What is computed, from what, and how far to trust it.</h1>

      <h2>Sun and Earth positions</h2>
      <p>Positions come from the <b>JPL DE421</b> planetary and lunar ephemeris, including DE421’s own lunar libration angles. They are rotated into the Moon’s <b>mean-Earth / polar-axis frame (MOON_ME)</b> — the frame NASA’s LOLA polar elevation products are delivered in — so that terrain and sky share one coordinate system.</p>
      <p>A table of Sun and Earth vectors is pre-computed every 12 hours{e ? ` (${e.meta.count.toLocaleString()} samples, 1966–2049)` : ''} and interpolated with a cubic spline in the browser. For any latitude, longitude and instant the app derives local azimuth and elevation, including the parallax that shifts Earth by up to 0.26° depending on where you stand. Nothing is fetched from a server and nothing is extrapolated beyond the table.</p>
      <table className="plain">
        <tbody>
          <tr><th>Interpolation error</th><td>≤ 0.0012° (Sun), ≤ 0.0004° (Earth) against direct DE421 evaluation at 20,000 random instants</td></tr>
          <tr><th>Independent check</th><td>Sub-Earth point agrees with the analytic theory in <i>astronomy-engine</i> to ≤ 0.03° over 55 dates</td></tr>
          <tr><th>Historical check</th><td>Apollo 11 touchdown: Sun computed at 10.7° elevation, azimuth 89° (due east) — the mission record gives ≈ 10.8°</td></tr>
          <tr><th>Libration</th><td>Included in every direction: DE421’s numerically integrated lunar orientation (optical and physical libration). Wobble agrees with <i>astronomy-engine</i> to ≤ 0.1°</td></tr>
          <tr><th>Corrections</th><td>Solar light-time applied. Stellar aberration (≈ 0.006°) not applied.</td></tr>
          <tr><th>Time</th><td>UTC in the interface; converted to TT with the IERS leap-second table (approximate before 1972)</td></tr>
        </tbody>
      </table>

      <h2 id="libration">Libration: Earth’s wobble in the lunar sky</h2>
      <p>The Moon keeps one face towards Earth, but not perfectly. Because its orbit is an ellipse, its spin runs slightly ahead of and behind its orbital motion, which rocks it east and west by up to about 7.9°. Because its axis is tilted about 6.7° to its orbit, it also nods north and south. Seen from the surface, Earth does not hang still: it wanders around its average place in a loop once a month. This is <b>libration</b>. A smaller real wobble of the Moon’s rotation (physical libration, a few hundredths of a degree) comes on top.</p>
      <p><b>KURO includes both, everywhere.</b> It does not add libration as a correction afterwards: every Sun and Earth direction is computed in the Moon’s own body-fixed frame from JPL DE421, whose lunar orientation is integrated numerically together with the orbit. So the Earth countdowns, “Earth in view”, the comparison, the planner, the ranking and the reports all move with the real wobble. The automated tests check the wobble’s size (±7.5–8.3° east–west, ±6.4–7.0° north–south over 2025–2030) and compare it with the independent libration theory in <i>astronomy-engine</i>, which agrees to better than 0.1°.</p>
      <p><b>Why it matters at the South Pole.</b> From the pole, Earth sits right on the horizon on average, and parallax pushes an Earth held still about 0.26° below it. Without libration a lander at the pole would never see Earth. With it, Earth climbs up to about 6.5° above a level horizon and is in view 40–53% of each month (2026–2027), then sinks below it. That is why contact near the pole comes and goes in two-week cycles. The site panel’s <b>Earth’s wobble</b> card draws the loop for your stay and shows what “Earth in view” would be if Earth sat still.</p>

      <h2 id="horizons">Checked against NASA/JPL Horizons</h2>
      <p>JPL’s <b>Horizons</b> system is NASA’s reference for where solar-system bodies appear from any place, including a point on the Moon. We asked the Horizons API (ephemeris DE441, Moon frame MEAN_ME, airless) for the Sun’s and Earth’s azimuth and elevation at ten sites every 61 hours from 14 November 2026 to 13 May 2027, and stored its answers with KURO. This page recomputes every one of those {hz ? hz.total.toLocaleString() : '1,440'} directions with KURO’s own engine, now, in your browser, and compares; the automated test suite fails if any differs by more than 0.02°.</p>
      {hz && (
        <>
          <table className="hz-table">
            <thead><tr><th>Site</th><th>Sun Δ elevation</th><th>Earth Δ elevation</th><th>Largest Δ direction</th><th>RMS Δ direction</th></tr></thead>
            <tbody>
              {hz.rows.map((r) => (
                <tr key={r.id}><td>{name(r.id)}</td><td>{r.sunMaxEl.toFixed(4)}°</td><td>{r.earthMaxEl.toFixed(4)}°</td><td>{r.maxSep.toFixed(4)}°</td><td>{r.rmsSep.toFixed(4)}°</td></tr>
              ))}
            </tbody>
          </table>
          <p className="dim small">Largest difference anywhere: {hz.worstSep.toFixed(4)}° (about {(hz.worstSep * 3600).toFixed(0)} arcseconds), of which about 0.006° is stellar aberration, which Horizons includes in “apparent” positions and KURO does not. At the polar sites, elevations agree to better than 0.001°, far smaller than the Sun’s own 0.27° radius. Source: {hz.source}; fetched {hz.fetched.slice(0, 10)}.</p>
        </>
      )}
      <p>Every site panel also links straight to Horizons’ own tables of the Sun and Earth for that site and stay, so any number in KURO can be checked against JPL in one click.</p>

      <h2>NASA’s permanently shadowed regions</h2>
      <p>The “NASA shadowed regions” layer shows the LOLA team’s map of permanently shadowed regions at the South Pole (240 m per pixel, computed from the LDEM_75S_240M elevation model), loaded live from NASA Moon Trek. It is an independent product: KURO does not use it in any calculation. In the terrain views its outlines are also drawn over KURO’s own “Sun over stay” layer, so you can see that the sunlight KURO traces from LOLA terrain stays out of the places NASA has mapped as never lit.</p>

      <h2>Terrain and horizons</h2>
      <p>Elevation comes from NASA’s Lunar Orbiter Laser Altimeter (LOLA). <code>npm run fetch:moon</code> downloads three products once and converts them for the browser by averaging only:</p>
      <table className="plain">
        <tbody>
          <tr><th>Whole Moon</th><td>NASA SVS CGI Moon Kit elevation (from LOLA gridded data), 2880 × 1440, about 3.8 km per pixel at the equator</td></tr>
          <tr><th>South Pole, 80–90°S</th><td>NASA GSFC PGDA product 90, LDEM_80S_80MPP (Barker et al. 2023), resampled to 320 m</td></tr>
          <tr><th>South Pole core</th><td>The same product at its native 80 m, 164 km square around the pole</td></tr>
          <tr><th>Colour</th><td>LROC Wide Angle Camera colour mosaic (NASA SVS CGI Moon Kit, 2025). NASA Moon Trek tiles are used online when the local copy is missing</td></tr>
        </tbody>
      </table>
      <p><b>Site horizons.</b> For each site the skyline is traced along 360 bearings out to 300 km from an observer 2 m above the ground, using the finest elevation available at each point, with lunar curvature. Sun and Earth visibility, the countdowns, the comparison table and the mission planner all use this horizon. Without elevation data the app falls back to an ideal smooth sphere and says so wherever it matters.</p>
      <p><b>Terrain views.</b> The South Pole, Drone and Surface views build a terrain mesh from the same data in the local frame of its centre. For every cell, the graphics card marches the elevation grid towards the Sun and towards Earth, so shadows and “Earth in view” come from the terrain itself at the chosen instant. The over-the-stay layers repeat this for up to 240 instants and average them. Light is computed at true scale; vertical exaggeration changes only what you see.</p>
      <p><b>Not modelled.</b> Light scattered between crater walls, a full thermal model (see “Heat and light” below for the estimate KURO does make), and terrain beyond the edge of the loaded square (300 km at the pole, 80 km in drone view) for the shadow layers. Earth’s surface pattern is stylised, but its direction, size and phase are true.</p>
      <p><b>Detail as you zoom.</b> The terrain views load a large square of LOLA terrain and, where you look closely, a finer square on top of it, with shadows still traced across both. Around the square the rest of the Moon is drawn from the global LOLA grid (about 3.8 km per cell), with the Sun’s light but without cast shadows. On the globe and the whole-Moon map, NASA Moon Trek tiles of the LRO Wide Angle Camera mosaic (to about 165 m per pixel) load around the view as you zoom in — three zoom levels at once, down to about 80 m per pixel — when the network allows. While that sharp photo is showing, the Real Moon layer takes its shading from the photo rather than from the coarser global height grid.</p>
      <p><b>Micro-relief (decorative).</b> LOLA measures the polar terrain at 80 m per pixel. Closer than that, the Drone and Rover views add procedurally generated small craters and regolith texture so the ground stays readable. These are not real features and do not affect any number; switch them off with “Micro-relief”.</p>
      <p><b>Figures (illustrative).</b> The astronaut (1.8 m) and rover are drawn to scale to give the terrain a human size. The orbiter on the globe is about ten thousand times its real size, on an idealised 100 km polar orbit, sped up; it is not a tracked spacecraft.</p>
      <p><b>Measure.</b> Distances follow the great circle on the 1737.4 km reference sphere; the elevation profile samples the finest LOLA grid available along the path. Slopes are between profile samples, so they underestimate slopes shorter than the sample spacing.</p>
      <p><b>The sky.</b> The 41 411 stars brighter than magnitude 8 are drawn at their catalogue positions with their measured colours, with the Milky Way from its mapped outline. The sky is turned into the Moon’s frame with the IAU rotation model (Archinal et al. 2018), checked against DE421 to within 0.05°, so it wheels overhead as it does from the Moon. Star brightness is scaled for the screen, not photometric.</p>
      <p><b>Lighting.</b> “Real Sun” lights the surface from the true Sun at the chosen time, with the night side and terrain shadows. “Full Moon” lights everything evenly so the whole surface can be seen at once; it is a viewing aid, and the Sun and Earth layers, the sky and every number keep using the real geometry.</p>
      <p><b>Rover.</b> The rover drives on the LOLA surface at true scale. It tilts to the local slope and refuses climbs steeper than 25°. Its sunlight and Earth-link readouts are traced along the full LOLA data out to 300 km. The battery is illustrative only. Speeds are VIPER-like 0.2 m/s, optionally time-lapsed.</p>

      <h2>Heat and light</h2>
      <p>Sunlight arriving at the Moon is the solar constant ({SOLAR_CONSTANT.toLocaleString()} W/m² at 1 AU) corrected for the Sun’s true distance, which KURO reads from the Sun’s apparent size. A panel kept facing the Sun receives that times the fraction of the solar disc above the local horizon; level ground receives it times the sine of the Sun’s elevation as well — which is why, at the pole, level ground gets only a few per cent of what a vertical panel gets.</p>
      <p>Ground temperature is a <b>radiative-balance estimate</b>: absorbed sunlight equals heat radiated away, (1 − A)·q = ε·σ·T⁴, with the lunar surface’s Bond albedo A = {BOND_ALBEDO} and infrared emissivity ε = {EMISSIVITY} (Vasavada et al. 2012, LRO Diviner). It ignores heat stored in the regolith (which makes the ground cool over hours after sunset rather than at once), the albedo rising at grazing light, and sunlight and infrared reflected from nearby slopes, so treat it as a first estimate within a few tens of degrees. In shadow the balance has nothing to work with, so KURO quotes what Diviner measures there instead: polar ground in shadow below about −170 °C, permanently shadowed crater floors −230 °C or colder (Paige et al. 2010).</p>

      <h2>Antenna margin</h2>
      <p>By default “Earth in view” is pure geometry: Earth’s centre above the terrain horizon. A real antenna usually wants Earth a few degrees higher, clear of the ground and of multipath. The antenna margin (set in the Explorer site panel, the Compare page or the Mission planner — it is one setting) raises that threshold, and every Earth number, countdown, comparison, mission check, ranking and report uses it. The terrain shading layers in the 3D views still show plain line of sight.</p>

      <h2 id="ranking">Ranking and scores</h2>
      <p>The Explorer ranks all {SITES.length} candidate sites for the exact landing date, time and stay chosen. The score out of 100 is the <b>KURO backend’s own recommendation engine</b> (<code>kuro_backend_fast</code>, version 1.0.0), ported to the browser line by line: the same thresholds, weights, rounding and order of arithmetic. The test suite runs it on {PARITY_CASES} stays that were scored by the real Python backend, including the backend’s own test cases, and fails if a single number differs, even by 0.01.</p>
      <table className="plain">
        <tbody>
          <tr><th>Flat ground · {pct(RANKING_WEIGHTS.terrain)}</th><td>Slope {pct(TERRAIN_WEIGHTS.slope)} (0° scores 100, {THRESHOLDS.terrainSlope[1]}° or more 0) and roughness {pct(TERRAIN_WEIGHTS.roughness)} (0 m RMS → 100, {THRESHOLDS.terrainRoughness[1]} m → 0). Slope is from LOLA by Horn’s method at the DEM’s own spacing (80 m in the pole core, 320 m out to 80°S).</td></tr>
          <tr><th>Safety · {pct(RANKING_WEIGHTS.safety)}</th><td>Slope safety {pct(SAFETY_WEIGHTS.slope)} (fully safe up to {THRESHOLDS.safetySlope[0]}°, 0 at {THRESHOLDS.safetySlope[1]}°), roughness {pct(SAFETY_WEIGHTS.roughness)}, hazard map {pct(SAFETY_WEIGHTS.hazard)}, longest darkness {pct(SAFETY_WEIGHTS.darkness)} (safe up to {THRESHOLDS.darknessS[0] / 86400} days, 0 at {THRESHOLDS.darknessS[1] / 86400} days) and longest radio gap {pct(SAFETY_WEIGHTS.outage)} (safe up to {THRESHOLDS.outageS[0] / 3600} h, 0 at {THRESHOLDS.outageS[1] / 3600} h).</td></tr>
          <tr><th>Sunlight · {pct(RANKING_WEIGHTS.illumination)}</th><td>Share of the stay with the centre of the Sun above the hills.</td></tr>
          <tr><th>Earth link · {pct(RANKING_WEIGHTS.communication)}</th><td>Share of the stay with the centre of Earth above the hills (plus the antenna margin).</td></tr>
          <tr><th>Sun + Earth · {pct(RANKING_WEIGHTS.mission)}</th><td>Share of the stay with both at once — when a lander has power and a direct link together.</td></tr>
        </tbody>
      </table>
      <p><b>Missing inputs are left out, never guessed.</b> Roughness needs terrain at 20–40 m per pixel and KURO’s finest is 80 m, and no structured hazard map exists yet, so — exactly like the backend — those inputs are dropped and each category is down-weighted by how much of it had data. A typical South Pole site therefore uses about {COVERAGE}% of the backend’s full input set; the site’s score breakdown says so.</p>
      <p><b>KURO’s one extra rule.</b> The backend alone still gives a site with no sunlight at all a middling score (flat, safe ground counts). KURO sets the score to 0 when there is no sunlight at all or Earth is never in view during the stay — a solar-powered lander that talks directly to Earth could neither charge nor call home — shows the reason, and still shows the backend’s own number beside it.</p>
      <p>The same score appears in the Compare table and in reports. It sorts options quickly; it is not a landing-site certification: the slope is one value at the site’s reference point, not a survey of the landing ellipse.</p>
      <p><b>“If you land a little to the side.”</b> The site panel can recompute the same stay on a 9 × 9 grid around the site (250 m, 500 m or 1 km squares), each point with its own 300 km terrain horizon. Near the pole a few hundred metres can change sunlight by tens of per cent; the map shows it, while the ranking itself stays on the 78 candidate sites.</p>

      <h2>Definitions</h2>
      <ul>
        <li><b>Sunlight available</b> — the fraction of the solar disc above the horizon, averaged over the stay. The Sun is treated as a 0.53° disc, so sunrise and sunset are gradual; at the poles they can take a day or more.</li>
        <li><b>Sets in / rises in</b> — for the Sun, the moment the last sliver disappears or the first appears. For Earth, the moment its centre crosses the horizon.</li>
        <li><b>Lunar shading</b> — a blend of Lambert and Lommel–Seeliger photometry, which keeps the Moon’s limb bright as it really is. On the night side a faint earthshine term (sunlight reflected from Earth) is shown, brightened for visibility.</li>
        <li><b>Earth in view</b> — Earth’s centre at least the antenna margin above the terrain horizon (0° by default: pure line of sight). A working radio link also needs antenna pointing, link margin and a ground station on the facing side of Earth.</li>
        <li><b>Landing time</b> — the stay starts at the landing date and time chosen in the time bar (UTC, to the minute).</li>
      </ul>

      <h2>Sites</h2>
      <p>The landing choices are the problem statement’s <b>{SITES.length} candidate sites in {GROUPS.length} South Pole regions</b> ({GROUPS.join(', ')}), with the exact ids and coordinates the KURO backend’s terrain pipeline extracted them at, so every result can be matched with the backend one to one. Custom coordinates are not offered; double-clicking the Moon selects the nearest candidate. Past landers (Apollo, IM-2 Athena and others) are kept only as reference points for the accuracy checks on this page.</p>

      <h2>Sources and credit</h2>
      <ul>
        <li>Folkner, Williams &amp; Boggs (2009), <i>The Planetary and Lunar Ephemeris DE421</i>; Williams, Boggs &amp; Folkner (2008), DE421 lunar frames memo — NASA/JPL.</li>
        <li>Barker et al. (2023), <i>Planetary Science Journal</i> 4, 183 — LOLA south-pole elevation products, NASA GSFC PGDA.</li>
        <li>NASA’s Scientific Visualization Studio, CGI Moon Kit (Ernie Wright, Noah Petro): LROC colour and LOLA elevation maps.</li>
        <li>Global imagery: LRO Wide Angle Camera mosaic served by NASA Moon Trek (NASA/GSFC/Arizona State University).</li>
        <li>Star positions, magnitudes and colours: Hipparcos and Yale Bright Star catalogues, via d3-celestial (Olaf Frohn, BSD licence), which also supplies the Milky Way outline.</li>
        <li>Archinal et al. (2018), <i>Celestial Mechanics and Dynamical Astronomy</i> 130, 22 — IAU WGCCRE report on cartographic coordinates and rotational elements.</li>
        <li>Giorgini et al., JPL Horizons On-Line Ephemeris System (NASA/JPL Solar System Dynamics Group) — reference positions used to check KURO, and linked from every site.</li>
        <li>LOLA permanently shadowed regions, South Pole, 240 m (NASA LRO LOLA team), via NASA Moon Trek.</li>
        <li>Vasavada et al. (2012), <i>Journal of Geophysical Research</i> 117, E00H18 — lunar surface albedo and emissivity from LRO Diviner. Paige et al. (2010), <i>Science</i> 330, 479 — Diviner temperatures of the lunar south polar region.</li>
        <li>Kopp &amp; Lean (2011), <i>Geophysical Research Letters</i> 38, L01706 — total solar irradiance. Horn (1981), <i>Proceedings of the IEEE</i> 69, 14 — slope from a gridded elevation model.</li>
        <li>Site links open LROC QuickMap (Arizona State University; now hosted by Intuitive Machines) and NASA Moon Trek (JPL), centred on the site.</li>
        <li>Canadian Space Agency, Moon Exploration — Canada’s Artemis contributions. The rover in KURO is drawn after NASA’s VIPER; Canada is developing a lunar utility rover for astronaut support under its Lunar Exploration Accelerator Program (study contracts awarded July 2025).</li>
      </ul>
      <p className="dim small">KURO is a NASA Space Apps Challenge 2026 project. It is not affiliated with or endorsed by NASA, and is a planning aid for exploration and teaching — not a tool for landing certification.</p>
    </main>
  )
}
