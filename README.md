# KURO — lunar landing site × date explorer

NASA Space Apps Challenge 2026. Explore the Moon in 3D, pick a landing site and a date, and see where the Sun
and Earth sit against the real terrain horizon: how long the light and the direct-to-Earth link last, and what
changes if the schedule slips.

## Run it

```
npm install
npm run fetch:moon      # once: downloads NASA LOLA elevation + LRO colour (~215 MB) and prepares public/moon/
npm run dev             # http://localhost:5173
```

`npm run fetch:moon -- --lite` skips the 181 MB South Pole model (globe and flat map only).
Without the data the app still runs: smooth-sphere horizons, plain globe, and the terrain views explain what is missing.

```
npm test                # engine and terrain maths (14 tests)
npm run build           # static site in dist/ — copy public/moon/ alongside when deploying
```

Needs Node 20+. No API keys.

## Pages

| Page | What it does |
|---|---|
| Explorer | Full-screen 3D Moon. Views: **Globe**, **South Pole** (600 km of LOLA terrain), **Drone** (low flight over the site), **Surface** (stand there and look around), **Flat map** (whole Moon or the pole from above). Layers: LRO colour, real light, elevation, slope, sunlit now, Earth in view now, sunlight over the stay, Earth over the stay. |
| Mission | Set power and radio requirements; checks a full stay on every landing date in the window at every chosen site. Pass/fail only, no scores. |
| Compare | Up to six site–date scenarios side by side, plus how each holds up as the landing date moves. |
| Reports | Printable summary with JSON and CSV export. |
| Data & methods | Sources, accuracy checks and limitations. |

## What is computed, from what

- **Sun and Earth:** JPL DE421 with lunar librations, MOON_ME frame, 1966–2049, pre-computed by
  `pipeline/ephemeris/build_ephemeris.py` into `public/data/ephemeris.bin`. Checked against direct DE421, the
  independent `astronomy-engine`, and the Apollo 11 landing Sun angle.
- **Terrain:** NASA LOLA (SVS CGI Moon Kit global grid; PGDA product 90 South Pole DEM, Barker et al. 2023).
- **Horizons:** traced per site from LOLA out to 300 km with curvature. In the terrain views the GPU ray-marches
  the elevation grid toward the Sun and Earth for every cell, so shadows come from the terrain itself.

## Backend

All data access goes through `src/services/api.ts`. Leave `VITE_API_BASE` unset to compute in the browser, or set
it to point the app at the KURO backend; the request and response shapes are documented there.

## Layout

```
src/explorer/        3D explorer: page, legend, Moon data loader, horizon tracing
src/explorer/engine/ Three.js engine: globe, terrain + GPU visibility, flat map, sky, worker
src/engine/          time scales, ephemeris interpolation, sky geometry, events, metrics
src/services/        API layer (local or backend)
src/pages/           Landing, Mission, Compare, Reports, Methods
scripts/             fetch-moon-data.mjs (NASA download + conversion)
pipeline/            offline Python for the ephemeris table
```

Not affiliated with or endorsed by NASA. Credit: NASA’s Scientific Visualization Studio, NASA GSFC PGDA, LROC/ASU, NASA/JPL.
