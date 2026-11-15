/// <reference lib="webworker" />
/**
 * Map rasters for the Moon map, built off the main thread from NASA data already in the app:
 *   global   LOLA LDEM_16 (2880 × 1440, equirectangular, ~1.9 km)
 *   poleWide south polar stereographic ±608 km (to ~70°S): LOLA 80S product where it exists, LDEM_16 beyond
 *   poleMid  LOLA south polar DEM at its own 320 m grid (±304 km, to ~80°S)
 *   poleHi   LOLA south polar DEM at its own 80 m grid (±82 km, to ~87.3°S)
 * Layers: shaded relief (sun from the north-west, 45° up — a cartographic convention, not the real Sun),
 * elevation colour, slope, and (pole only) the LRO WAC photo mosaic reprojected from equirectangular.
 */

import { POLE_EXTENT, type RasterKind, type RasterRequest, type RasterResult } from './mapShared'

interface Global { width: number; height: number; data: Uint16Array }
interface Polar { width: number; height: number; data: Int16Array; x0: number; y0: number; pixelM: number; noData: number }

const R = 1737400, DEG = Math.PI / 180
let G: Global | null = null, P: Polar | null = null, PH: Polar | null = null, colorUrl: string | null = null
let photo: { w: number; h: number; px: Uint8ClampedArray } | null = null

const ctx = self as unknown as DedicatedWorkerGlobalScope
ctx.onmessage = async (ev: MessageEvent) => {
  const m = ev.data
  if (m.init) { G = m.init.global; P = m.init.pole; PH = m.init.poleHi; colorUrl = m.init.colorUrl; return }
  const q = m as RasterRequest
  try { const r = await build(q); ctx.postMessage(r, r.bitmap ? [r.bitmap] : []) } catch (e) { ctx.postMessage({ id: q.id, kind: q.kind, layer: q.layer, bitmap: null, min: 0, max: 0, error: String(e) } as RasterResult) }
}

function globalH(lat: number, lon: number): number {
  if (!G) return NaN
  const fx = ((((lon + 180) % 360) + 360) % 360) / 360 * G.width - 0.5
  const fy = Math.min(G.height - 1.001, Math.max(0, ((90 - lat) / 180) * G.height - 0.5))
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, w = G.width, d = G.data
  const xa = (x0 + w) % w, xb = (x0 + 1) % w
  return ((d[y0 * w + xa] * (1 - tx) + d[y0 * w + xb] * tx) * (1 - ty) + (d[(y0 + 1) * w + xa] * (1 - tx) + d[(y0 + 1) * w + xb] * tx) * ty) / 2 - 10000
}
function polarH(p: Polar, x: number, y: number): number {
  const fx = (x - p.x0) / p.pixelM - 0.5, fy = (p.y0 - y) / p.pixelM - 0.5
  if (fx < 0 || fy < 0 || fx >= p.width - 1 || fy >= p.height - 1) return NaN
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, w = p.width, d = p.data
  const a = d[y0 * w + x0], b = d[y0 * w + x0 + 1], c = d[(y0 + 1) * w + x0], e = d[(y0 + 1) * w + x0 + 1]
  if (a === p.noData || b === p.noData || c === p.noData || e === p.noData) return NaN
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty
}
/** South polar stereographic, true scale at the pole: map (x, y) metres → planetocentric lat/lon (same as moonData.ts). */
function fromStereo(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y)
  return [(2 * Math.atan(rho / (2 * R)) - Math.PI / 2) / DEG, Math.atan2(x, y) / DEG]
}

// ------------------------------------------------------------------ colour ramps
type Stop = [number, number, number, number]
const ELEV: Stop[] = [[0, 38, 22, 84], [0.18, 66, 58, 158], [0.36, 44, 122, 178], [0.52, 58, 168, 148], [0.66, 150, 192, 104], [0.8, 226, 190, 98], [0.92, 236, 150, 92], [1, 246, 236, 222]]
const SLOPE: Stop[] = [[0, 34, 84, 66], [5 / 35, 92, 150, 70], [10 / 35, 214, 200, 76], [15 / 35, 232, 140, 52], [25 / 35, 200, 62, 44], [1, 120, 24, 30]]
function ramp(stops: Stop[], t: number, out: number[]) {
  t = Math.max(0, Math.min(1, t))
  let k = 1
  while (k < stops.length - 1 && stops[k][0] < t) k++
  const a = stops[k - 1], b = stops[k], u = (t - a[0]) / (b[0] - a[0] || 1)
  out[0] = a[1] + (b[1] - a[1]) * u; out[1] = a[2] + (b[2] - a[2]) * u; out[2] = a[3] + (b[3] - a[3]) * u
}

// ------------------------------------------------------------------ build
async function build(q: RasterRequest): Promise<RasterResult> {
  const grid = gridFor(q.kind)
  if (!grid) return { id: q.id, kind: q.kind, layer: q.layer, bitmap: null, min: 0, max: 0, error: 'elevation not loaded' }
  const { W, H } = grid
  const img = new Uint8ClampedArray(W * H * 4)
  if (q.layer === 'photo') {
    await loadPhoto()
    if (!photo) return { id: q.id, kind: q.kind, layer: q.layer, bitmap: null, min: 0, max: 0, error: 'photo not loaded' }
    const ph = photo
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const [lat, lon] = grid.latlon(i, j)
      const fx = ((lon + 180) / 360) * ph.w - 0.5, fy = ((90 - lat) / 180) * ph.h - 0.5
      const x0 = Math.max(0, Math.min(ph.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(ph.h - 2, Math.floor(fy))), tx = fx - x0, ty = fy - y0
      const p = (y0 * ph.w + x0) * 4, r = ph.w * 4
      const v = (ph.px[p] * (1 - tx) + ph.px[p + 4] * tx) * (1 - ty) + (ph.px[p + r] * (1 - tx) + ph.px[p + r + 4] * tx) * ty
      const o = (j * W + i) * 4
      img[o] = img[o + 1] = img[o + 2] = v; img[o + 3] = 255
    }
    return finish(q, img, W, H, 0, 0)
  }
  // heights
  const h = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) h[j * W + i] = grid.height(i, j)
  // robust range for the colour ramp (1st–99th percentile)
  const sample: number[] = []
  for (let k = 0; k < h.length; k += Math.max(1, Math.floor(h.length / 40000))) if (!isNaN(h[k])) sample.push(h[k])
  sample.sort((a, b) => a - b)
  const lo = sample[Math.floor(sample.length * 0.01)] ?? 0, hi = sample[Math.floor(sample.length * 0.99)] ?? 1
  // light from screen up-left (azimuth 315°), 45° above the horizon: L = (sin az·cos alt, cos az·cos alt, sin alt)
  const alt = 45 * DEG, Lx = Math.sin(315 * DEG) * Math.cos(alt), Ly = Math.cos(315 * DEG) * Math.cos(alt), Lz = Math.sin(alt)
  const c = [0, 0, 0]
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 4, z = h[j * W + i]
      if (isNaN(z)) { img[o + 3] = 0; continue }
      const at = (ii: number, jj: number) => { const v = h[Math.max(0, Math.min(H - 1, jj)) * W + Math.max(0, Math.min(W - 1, ii))]; return isNaN(v) ? z : v }
      const [gx, gy] = grid.ground(i, j)
      const dzdx = (at(i + 1, j) - at(i - 1, j)) / (2 * gx)        // towards screen right
      const dzdy = (at(i, j - 1) - at(i, j + 1)) / (2 * gy)        // towards screen up
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      // surface normal (−∂z/∂x, −∂z/∂y, 1) normalised, dotted with the light
      const shade = Math.max(0, (-dzdx * Lx - dzdy * Ly + Lz) / Math.hypot(dzdx, dzdy, 1))
      if (q.layer === 'relief') { const v = 14 + 206 * Math.pow(shade, 1.15); img[o] = v; img[o + 1] = v; img[o + 2] = v * 0.98 }
      else if (q.layer === 'elevation') { ramp(ELEV, (z - lo) / (hi - lo), c); const k = 0.5 + 0.55 * shade; img[o] = c[0] * k; img[o + 1] = c[1] * k; img[o + 2] = c[2] * k }
      else { ramp(SLOPE, slope / DEG / 35, c); const k = 0.62 + 0.42 * shade; img[o] = c[0] * k; img[o + 1] = c[1] * k; img[o + 2] = c[2] * k }
      img[o + 3] = 255
    }
  }
  return finish(q, img, W, H, lo, hi)
}

async function finish(q: RasterRequest, img: Uint8ClampedArray, W: number, H: number, min: number, max: number): Promise<RasterResult> {
  const bitmap = await createImageBitmap(new ImageData(img as unknown as Uint8ClampedArray<ArrayBuffer>, W, H))
  return { id: q.id, kind: q.kind, layer: q.layer, bitmap, min, max }
}

interface Grid { W: number; H: number; height: (i: number, j: number) => number; latlon: (i: number, j: number) => [number, number]; ground: (i: number, j: number) => [number, number] }
function gridFor(kind: RasterKind): Grid | null {
  if (kind === 'global') {
    if (!G) return null
    const g = G, d = 180 / g.height
    return {
      W: g.width, H: g.height,
      height: (i, j) => g.data[j * g.width + i] / 2 - 10000,
      latlon: (i, j) => [90 - (j + 0.5) * d, -180 + (i + 0.5) * d],
      ground: (_i, j) => [Math.max(0.02, Math.cos((90 - (j + 0.5) * d) * DEG)) * R * d * DEG, R * d * DEG],
    }
  }
  const E = POLE_EXTENT[kind]
  if (kind === 'poleMid' && P) return polarGrid(P)
  if (kind === 'poleHi' && PH) return polarGrid(PH)
  if (kind !== 'poleWide') return null
  const W = 2048, px = (2 * E) / W
  return {
    W, H: W,
    height: (i, j) => {
      const x = -E + (i + 0.5) * px, y = E - (j + 0.5) * px
      const v = P ? polarH(P, x, y) : NaN
      if (!isNaN(v)) return v
      const [lat, lon] = fromStereo(x, y)
      return globalH(lat, lon)
    },
    latlon: (i, j) => fromStereo(-E + (i + 0.5) * px, E - (j + 0.5) * px),
    ground: (i, j) => { const k = scaleK(-E + (i + 0.5) * px, E - (j + 0.5) * px); return [px / k, px / k] },
  }
}
function polarGrid(p: Polar): Grid {
  return {
    W: p.width, H: p.height,
    height: (i, j) => { const v = p.data[j * p.width + i]; return v === p.noData ? NaN : v },
    latlon: (i, j) => fromStereo(p.x0 + (i + 0.5) * p.pixelM, p.y0 - (j + 0.5) * p.pixelM),
    ground: (i, j) => { const k = scaleK(p.x0 + (i + 0.5) * p.pixelM, p.y0 - (j + 0.5) * p.pixelM); return [p.pixelM / k, p.pixelM / k] },
  }
}
/** Stereographic scale factor (map distance / ground distance), 1 at the pole. */
function scaleK(x: number, y: number) { const lat = fromStereo(x, y)[0] * DEG; return 2 / (1 - Math.sin(lat)) }

async function loadPhoto() {
  if (photo || !colorUrl) return
  const blob = await (await fetch(colorUrl)).blob()
  const bmp = await createImageBitmap(blob)
  const oc = new OffscreenCanvas(bmp.width, bmp.height)
  const g = oc.getContext('2d')!
  g.drawImage(bmp, 0, 0)
  photo = { w: bmp.width, h: bmp.height, px: g.getImageData(0, 0, bmp.width, bmp.height).data }
  bmp.close()
}
