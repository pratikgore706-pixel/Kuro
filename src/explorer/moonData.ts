/**
 * Real NASA Moon data prepared by `npm run fetch:moon` (see scripts/fetch-moon-data.mjs).
 * Everything here is optional: when a file is missing the app says so and falls back, it never invents terrain.
 */
const R = 1737400
const DEG = Math.PI / 180

export interface GlobalDem { width: number; height: number; data: Uint16Array; minM: number; maxM: number; source: string; pixelDeg: number }
export interface PolarDem { width: number; height: number; data: Int16Array; x0: number; y0: number; pixelM: number; noData: number; source: string }
export interface MoonData {
  ok: boolean
  colorUrl: string | null
  colorSource: string | null
  global: GlobalDem | null
  pole: PolarDem | null
  poleHi: PolarDem | null
  /** What is missing, in words, for the UI. */
  missing: string[]
}

const EMPTY: MoonData = { ok: false, colorUrl: null, colorSource: null, global: null, pole: null, poleHi: null, missing: ['colour map', 'global elevation', 'South Pole elevation'] }

let pending: Promise<MoonData> | null = null
let loaded: MoonData | null = null
export const getMoonData = () => loaded
/** Hand already-loaded data to this context (the terrain workers get it from the page instead of downloading again). */
export function setMoonData(d: MoonData) { loaded = d; pending = Promise.resolve(d) }

async function bin(url: string): Promise<ArrayBuffer | null> {
  try { const r = await fetch(url); return r.ok ? await r.arrayBuffer() : null } catch { return null }
}

/**
 * Reverses scripts/pack-moon-data.mjs: gunzip, join the low and high byte planes, then add up each row's
 * differences. Lossless — every height is exactly the original value. Returns the raw little-endian grid bytes.
 */
export async function unpackGrid(packed: ArrayBuffer, width: number, height: number): Promise<ArrayBuffer | null> {
  try {
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))
    const planes = new Uint8Array(await new Response(stream).arrayBuffer())
    const n = width * height
    if (planes.length !== n * 2) return null
    const out = new Uint16Array(n)
    for (let y = 0; y < height; y++) {
      let acc = 0
      for (let i = y * width, end = i + width; i < end; i++) {
        acc = (acc + (planes[i] | (planes[n + i] << 8))) & 0xffff
        out[i] = acc
      }
    }
    return out.buffer
  } catch { return null }
}

/** One elevation grid: the packed file when the manifest lists one and the browser can unpack it, else the raw file. */
async function grid(base: string, d: { file: string; width: number; height: number; packed?: { file: string } } | undefined): Promise<ArrayBuffer | null> {
  if (!d) return null
  if (d.packed && typeof DecompressionStream !== 'undefined') {
    const p = await bin(`${base}moon/${d.packed.file}`)
    const raw = p ? await unpackGrid(p, d.width, d.height) : null
    if (raw) return raw
  }
  return bin(`${base}moon/${d.file}`)
}

export function loadMoonData(base = import.meta.env.BASE_URL): Promise<MoonData> {
  if (pending) return pending
  pending = (async () => {
    let m: any
    try {
      const r = await fetch(`${base}moon/manifest.json`)
      if (!r.ok) return (loaded = EMPTY)
      m = await r.json()
    } catch { return (loaded = EMPTY) }
    const out: MoonData = { ...EMPTY, missing: [] }
    if (m.color) { out.colorUrl = `${base}moon/${m.color.file}`; out.colorSource = m.color.source } else out.missing.push('colour map')
    // all elevation files download at the same time (they used to queue one after another)
    const [gb, pb, hb] = await Promise.all([grid(base, m.global), grid(base, m.pole), grid(base, m.poleHi)])
    if (m.global && gb && gb.byteLength === m.global.width * m.global.height * 2) out.global = { width: m.global.width, height: m.global.height, data: new Uint16Array(gb), minM: m.global.minM, maxM: m.global.maxM, source: m.global.source, pixelDeg: m.global.pixelDeg }
    if (!out.global) out.missing.push('global elevation')
    for (const [k, b] of [['pole', pb], ['poleHi', hb]] as const) {
      const d = m[k]
      if (d && b && b.byteLength === d.width * d.height * 2) out[k] = { width: d.width, height: d.height, data: new Int16Array(b), x0: d.x0, y0: d.y0, pixelM: d.pixelM, noData: d.noData, source: d.source }
    }
    if (!out.pole) out.missing.push('South Pole elevation')
    out.ok = !!out.global
    return (loaded = out)
  })()
  return pending
}

// ---------- projections ----------

/** South polar stereographic (true scale at the pole, lon0 = 0): x = ρ sin λ, y = ρ cos λ. */
export function toStereo(lat: number, lon: number): [number, number] {
  const rho = 2 * R * Math.tan(Math.PI / 4 + (lat * DEG) / 2)
  return [rho * Math.sin(lon * DEG), rho * Math.cos(lon * DEG)]
}
export function fromStereo(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y)
  return [(2 * Math.atan(rho / (2 * R)) - Math.PI / 2) / DEG, Math.atan2(x, y) / DEG]
}

// ---------- sampling ----------

function sampleGlobal(g: GlobalDem, lat: number, lon: number): number {
  const fx = ((((lon + 180) % 360) + 360) % 360) / 360 * g.width - 0.5
  const fy = Math.min(g.height - 1.001, Math.max(0, ((90 - lat) / 180) * g.height - 0.5))
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const xa = (x0 + g.width) % g.width, xb = (x0 + 1) % g.width, w = g.width, d = g.data
  const v = (d[y0 * w + xa] * (1 - tx) + d[y0 * w + xb] * tx) * (1 - ty) + (d[(y0 + 1) * w + xa] * (1 - tx) + d[(y0 + 1) * w + xb] * tx) * ty
  return v / 2 - 10000
}

function samplePolar(p: PolarDem, x: number, y: number): number {
  const fx = (x - p.x0) / p.pixelM - 0.5, fy = (p.y0 - y) / p.pixelM - 0.5
  if (fx < 0 || fy < 0 || fx >= p.width - 1 || fy >= p.height - 1) return NaN
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, w = p.width, d = p.data
  const a = d[y0 * w + x0], b = d[y0 * w + x0 + 1], c = d[(y0 + 1) * w + x0], e = d[(y0 + 1) * w + x0 + 1]
  if (a === p.noData || b === p.noData || c === p.noData || e === p.noData) return NaN
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty
}

export interface Sampler {
  /** Height above the 1737.4 km sphere, metres; NaN where no data. */
  height: (lat: number, lon: number) => number
  /** Same, for a unit vector in Moon body-fixed axes — no trigonometry near the pole, used to build terrain fast. */
  heightVec: (dx: number, dy: number, dz: number) => number
  /** Best native grid spacing available at this latitude, metres. */
  resolution: (lat: number) => number
  describe: (lat: number) => string
}

export function makeSampler(d: MoonData): Sampler | null {
  if (!d.global && !d.pole) return null
  const height = (lat: number, lon: number) => {
    if (lat < -79.9) {
      const [x, y] = toStereo(lat, lon)
      if (d.poleHi) { const h = samplePolar(d.poleHi, x, y); if (!isNaN(h)) return h }
      if (d.pole) { const h = samplePolar(d.pole, x, y); if (!isNaN(h)) return h }
    }
    return d.global ? sampleGlobal(d.global, lat, lon) : NaN
  }
  // south polar stereographic straight from the vector: tan(π/4 + φ/2) = (1 + sin φ) / cos φ, sin λ = y/c, cos λ = x/c
  const Z_POLE = Math.sin(-79.9 * DEG)
  const heightVec = (dx: number, dy: number, dz: number) => {
    if (dz < Z_POLE) {
      const c = Math.sqrt(dx * dx + dy * dy) || 1e-12, rho = (2 * R * (1 + dz)) / c
      const x = (rho * dy) / c, y = (rho * dx) / c
      if (d.poleHi) { const h = samplePolar(d.poleHi, x, y); if (!isNaN(h)) return h }
      if (d.pole) { const h = samplePolar(d.pole, x, y); if (!isNaN(h)) return h }
    }
    return d.global ? sampleGlobal(d.global, Math.asin(Math.max(-1, Math.min(1, dz))) / DEG, Math.atan2(dy, dx) / DEG) : NaN
  }
  const inHi = (lat: number) => !!d.poleHi && lat < -90 + (d.poleHi.width * d.poleHi.pixelM) / 2 / (R * DEG)
  const resolution = (lat: number) => inHi(lat) ? d.poleHi!.pixelM : lat < -80 && d.pole ? d.pole.pixelM : d.global ? (d.global.pixelDeg * DEG * R) : 1e4
  const describe = (lat: number) => inHi(lat) ? `LOLA South Pole DEM, ${d.poleHi!.pixelM} m` : lat < -80 && d.pole ? `LOLA South Pole DEM, ${d.pole.pixelM} m` : `LOLA global, ~${(resolution(lat) / 1000).toFixed(1)} km`
  return { height, heightVec, resolution, describe }
}

/** Point reached by travelling `dist` metres from (lat, lon) along initial bearing `az` (deg, clockwise from north). */
export function destination(lat: number, lon: number, az: number, dist: number): [number, number] {
  const p1 = lat * DEG, l1 = lon * DEG, b = az * DEG, d = dist / R
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b))
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [p2 / DEG, ((l2 / DEG + 540) % 360) - 180]
}

/**
 * Terrain horizon: for each azimuth bin, the highest elevation angle (deg) of the terrain as seen from an
 * observer `eyeM` above the surface, marching out to `maxKm` along great circles, curvature included.
 */
export function computeHorizon(s: Sampler, lat: number, lon: number, eyeM = 2, bins = 360, maxKm = 300): Float32Array {
  const res = Math.max(20, s.resolution(lat))
  const h0 = s.height(lat, lon)
  const mask = new Float32Array(bins)
  if (isNaN(h0)) return mask
  const z0 = h0 + eyeM
  for (let i = 0; i < bins; i++) {
    const az = (i * 360) / bins
    let best = -90
    for (let dist = res; dist < maxKm * 1000; dist = Math.max(dist + res, dist * 1.015)) {
      const [la, lo] = destination(lat, lon, az, dist)
      const h = s.height(la, lo)
      if (isNaN(h)) continue
      const ang = Math.atan((h - z0) / dist - dist / (2 * R)) / DEG
      if (ang > best) best = ang
    }
    mask[i] = best
  }
  return mask
}

/**
 * The point `eastM` metres east and `northM` metres north of (lat, lon), measured in the site's own tangent plane
 * and projected back onto the sphere. Works everywhere, including exactly at a pole, where "east" and "north"
 * follow the site's longitude (the same convention as the site frame used for the sky).
 */
export function offsetLatLon(lat: number, lon: number, eastM: number, northM: number): [number, number] {
  const la = lat * DEG, lo = lon * DEG
  const cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo)
  const x = eastM / R, y = northM / R
  // up + x·east + y·north, with up = (cl·co, cl·so, sl), east = (−so, co, 0), north = (−sl·co, −sl·so, cl)
  const vx = cl * co - x * so - y * sl * co, vy = cl * so + x * co - y * sl * so, vz = sl + y * cl
  const n = Math.hypot(vx, vy, vz)
  return [Math.asin(Math.max(-1, Math.min(1, vz / n))) / DEG, Math.atan2(vy, vx) / DEG]
}

/**
 * Local ground slope, degrees, by Horn's (1981) method — the standard GIS slope: a 3×3 neighbourhood at the
 * DEM's own grid spacing (80 m in the South Pole core, 320 m out to 80°S), so it measures real LOLA posts rather
 * than interpolating between them. NaN where the DEM has no data. Slopes shorter than the grid are smoothed out.
 */
export function estimateSlopeDeg(s: Sampler, lat: number, lon: number): number {
  const d = Math.max(20, s.resolution(lat))
  const z: number[] = []
  for (const dn of [1, 0, -1]) for (const de of [-1, 0, 1]) {
    const [la, lo] = offsetLatLon(lat, lon, de * d, dn * d)
    const h = s.height(la, lo)
    if (isNaN(h)) return NaN
    z.push(h)
  }
  // z: [NW, N, NE, W, C, E, SW, S, SE]
  const dzdx = ((z[2] + 2 * z[5] + z[8]) - (z[0] + 2 * z[3] + z[6])) / (8 * d)
  const dzdy = ((z[0] + 2 * z[1] + z[2]) - (z[6] + 2 * z[7] + z[8])) / (8 * d)
  return Math.atan(Math.hypot(dzdx, dzdy)) / DEG
}

/**
 * Elevation angle (deg) of the terrain horizon along one bearing, seen from `eyeM` above the ground.
 * Same method as computeHorizon, for a single direction — cheap enough to run while a rover drives.
 */
export function horizonAngle(s: Sampler, lat: number, lon: number, az: number, eyeM = 2, maxKm = 300): number {
  const res = Math.max(20, s.resolution(lat))
  const h0 = s.height(lat, lon)
  if (isNaN(h0)) return 0
  let best = -90
  for (let dist = res; dist < maxKm * 1000; dist = Math.max(dist + res, dist * 1.015)) {
    const [la, lo] = destination(lat, lon, az, dist)
    const h = s.height(la, lo)
    if (isNaN(h)) continue
    const ang = Math.atan((h - h0 - eyeM) / dist - dist / (2 * R)) / DEG
    if (ang > best) best = ang
  }
  return best
}
