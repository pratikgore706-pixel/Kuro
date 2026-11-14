import { getEphemeris } from '../engine/ephemeris'

export function Methods() {
  const e = getEphemeris()
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
          <tr><th>Corrections</th><td>Solar light-time applied. Stellar aberration (≈ 0.006°) not applied.</td></tr>
          <tr><th>Time</th><td>UTC in the interface; converted to TT with the IERS leap-second table (approximate before 1972)</td></tr>
        </tbody>
      </table>

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
      <p><b>Not modelled.</b> Light scattered between crater walls, the Moon’s thermal environment, and terrain beyond the edge of the loaded square (300 km at the pole, 80 km in drone view) for the shadow layers. Earth’s surface pattern is stylised, but its direction, size and phase are true.</p>
      <p><b>Detail as you zoom.</b> The terrain views load a large square of LOLA terrain and, where you look closely, a finer square on top of it, with shadows still traced across both. Around the square the rest of the Moon is drawn from the global LOLA grid (about 3.8 km per cell), with the Sun’s light but without cast shadows. On the globe and the whole-Moon map, NASA Moon Trek tiles of the LRO Wide Angle Camera mosaic (to about 165 m per pixel) load around the view as you zoom in — three zoom levels at once, down to about 80 m per pixel — when the network allows. While that sharp photo is showing, the Real Moon layer takes its shading from the photo rather than from the coarser global height grid.</p>
      <p><b>Micro-relief (decorative).</b> LOLA measures the polar terrain at 80 m per pixel. Closer than that, the Drone and Rover views add procedurally generated small craters and regolith texture so the ground stays readable. These are not real features and do not affect any number; switch them off with “Micro-relief”.</p>
      <p><b>Figures (illustrative).</b> The astronaut (1.8 m) and rover are drawn to scale to give the terrain a human size. The orbiter on the globe is about ten thousand times its real size, on an idealised 100 km polar orbit, sped up; it is not a tracked spacecraft.</p>
      <p><b>Measure.</b> Distances follow the great circle on the 1737.4 km reference sphere; the elevation profile samples the finest LOLA grid available along the path. Slopes are between profile samples, so they underestimate slopes shorter than the sample spacing.</p>
      <p><b>The sky.</b> The 41 411 stars brighter than magnitude 8 are drawn at their catalogue positions with their measured colours, with the Milky Way from its mapped outline. The sky is turned into the Moon’s frame with the IAU rotation model (Archinal et al. 2018), checked against DE421 to within 0.05°, so it wheels overhead as it does from the Moon. Star brightness is scaled for the screen, not photometric.</p>
      <p><b>Lighting.</b> “Real Sun” lights the surface from the true Sun at the chosen time, with the night side and terrain shadows. “Full Moon” lights everything evenly so the whole surface can be seen at once; it is a viewing aid, and the Sun and Earth layers, the sky and every number keep using the real geometry.</p>
      <p><b>Rover.</b> The rover drives on the LOLA surface at true scale. It tilts to the local slope and refuses climbs steeper than 25°. Its sunlight and Earth-link readouts are traced along the full LOLA data out to 300 km. The battery is illustrative only. Speeds are VIPER-like 0.2 m/s, optionally time-lapsed.</p>

      <h2>Definitions</h2>
      <ul>
        <li><b>Sunlight available</b> — the fraction of the solar disc above the horizon, averaged over the stay. The Sun is treated as a 0.53° disc, so sunrise and sunset are gradual; at the poles they can take a day or more.</li>
        <li><b>Sets in / rises in</b> — for the Sun, the moment the last sliver disappears or the first appears. For Earth, the moment its centre crosses the horizon.</li>
        <li><b>Lunar shading</b> — a blend of Lambert and Lommel–Seeliger photometry, which keeps the Moon’s limb bright as it really is. On the night side a faint earthshine term (sunlight reflected from Earth) is shown, brightened for visibility.</li>
        <li><b>Earth in view</b> — geometric line of sight only. A working radio link also needs antenna pointing, link margin and a ground station on the facing side of Earth.</li>
      </ul>

      <h2>Sites</h2>
      <p>Lander coordinates are from NASA’s NSSDCA landing-site table and LROC. South-polar entries marked as features use rounded IAU feature centres as reference points for the Artemis III candidate regions NASA named in October 2024; they are not selected landing sites. KURO does not rank or score sites.</p>

      <h2>Sources and credit</h2>
      <ul>
        <li>Folkner, Williams &amp; Boggs (2009), <i>The Planetary and Lunar Ephemeris DE421</i>; Williams, Boggs &amp; Folkner (2008), DE421 lunar frames memo — NASA/JPL.</li>
        <li>Barker et al. (2023), <i>Planetary Science Journal</i> 4, 183 — LOLA south-pole elevation products, NASA GSFC PGDA.</li>
        <li>NASA’s Scientific Visualization Studio, CGI Moon Kit (Ernie Wright, Noah Petro): LROC colour and LOLA elevation maps.</li>
        <li>Global imagery: LRO Wide Angle Camera mosaic served by NASA Moon Trek (NASA/GSFC/Arizona State University).</li>
        <li>Star positions, magnitudes and colours: Hipparcos and Yale Bright Star catalogues, via d3-celestial (Olaf Frohn, BSD licence), which also supplies the Milky Way outline.</li>
        <li>Archinal et al. (2018), <i>Celestial Mechanics and Dynamical Astronomy</i> 130, 22 — IAU WGCCRE report on cartographic coordinates and rotational elements.</li>
        <li>Site links open LROC QuickMap (Arizona State University).</li>
      </ul>
      <p className="dim small">KURO is a NASA Space Apps Challenge 2026 project. It is not affiliated with or endorsed by NASA, and is a planning aid for exploration and teaching — not a tool for landing certification.</p>
    </main>
  )
}
