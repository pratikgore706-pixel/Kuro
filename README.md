# KURO · Lunar South Pole landing explorer

NASA Space Apps Challenge 2026, by team **The Selenites**. Choose a landing date, and KURO ranks 78 candidate landing sites near the Moon's
South Pole by sunlight, Earth contact and terrain. You can explore each site in 3D, drive a rover across real NASA
terrain, and compare sites side by side.

## Run it

```
npm install
npm run dev             # http://localhost:5173
```

The NASA Moon data the site needs (packed elevation grids, colour map, Sun and Earth table) is already in
`public/`. Needs Node 20.19 or newer. No API keys.

```
npm test                # maths, data and ranking checks
npm run build           # type-check, then the static site in dist/
npm run preview         # serve dist/ locally
```

## Deploy

The build is a static site with hash routes (`#/explorer`), so any static host works without rewrite rules.

- **Vercel:** import the repository. `vercel.json` sets the build (`npm run build`, output `dist/`) and long
  browser caching for the data files. Nothing else to configure.
- **Netlify, GitHub Pages, Cloudflare Pages:** build command `npm run build`, publish directory `dist`.

The base path is relative, so the site also works from a sub-folder.

## Pages

| Page | What it does |
|---|---|
| Home | The story of IM-2 Athena's landing, told by the KURO rover. |
| Explorer | 3D Moon. Pick a landing date and see the 78 sites ranked; open any site's details, or fly down and drive the rover there. Views: Globe, Pole, Drone, Rover. |
| Compare | The top sites side by side, each as a live rover view on one shared clock. |
| Data | Where every number comes from and how it was checked. |
| About us | The team and the project. |

## What is computed, from what

- **Sun and Earth:** JPL DE421 with lunar librations, MOON_ME frame, 1966–2049, pre-computed by
  `pipeline/ephemeris/build_ephemeris.py` into `public/data/ephemeris.bin`. Checked against direct DE421, the
  independent `astronomy-engine`, and the Apollo 11 landing Sun angle.
- **Terrain:** NASA LOLA (SVS CGI Moon Kit global grid; PGDA product 90 South Pole DEM, Barker et al. 2023).
- **Horizons:** traced per site from LOLA out to 300 km, with the Moon's curvature. The 78 candidate sites ship
  pre-traced (`src/data/site-horizons.json`, identical to a live trace); in the 3D views the GPU traces the
  elevation grid toward the Sun and Earth for every cell, so shadows come from the terrain itself.
- **Ranking:** the KURO backend's scoring formula, reproduced exactly in the browser (`src/services/backendScore.ts`).

## Updating the Moon data

```
npm run fetch:moon      # downloads NASA LOLA elevation + LRO colour, then packs it (npm run pack:moon)
npm run build:horizons  # re-trace the 78 site skylines for the new data
```

Packing is lossless: each grid is stored as row differences in two byte planes, gzip-compressed, and the
browser restores the exact original heights (about half the download).

## Backend

All data access goes through `src/services/api.ts`. Leave `VITE_API_BASE` unset to compute in the browser, or set
it to point the app at the KURO backend; the request and response shapes are documented there.

## Layout

```
src/explorer/        3D explorer page, Moon data loader, horizon tracing
src/explorer/engine/ Three.js engine: globe, terrain and visibility, sky, rover, terrain worker
src/engine/          time scales, ephemeris interpolation, sky geometry, events, explanations
src/services/        API layer and the ranking formula
src/pages/           Home, Compare, Data, About us (plus Mission, Reports, Methods)
src/components/      shared interface parts
scripts/             NASA data download and packing
pipeline/            offline Python for the ephemeris table
```

Not affiliated with or endorsed by NASA. Credit: NASA's Scientific Visualization Studio, NASA GSFC PGDA,
LROC/ASU, NASA/JPL.
