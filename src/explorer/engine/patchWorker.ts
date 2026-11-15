/// <reference lib="webworker" />
import { loadMoonData, makeSampler, setMoonData, type MoonData } from '../moonData'

/** lat/lon: origin of the local frame. ce/cn: centre of the square in that frame (metres east/north), for detail patches. */
export interface PatchRequest { id: number; base: string; lat: number; lon: number; spanM: number; n: number; ce?: number; cn?: number; tag?: string; key?: string; warm?: boolean }
export interface PatchResult {
  id: number; ok: boolean; error?: string
  n: number; spanM: number; lat: number; lon: number; ce: number; cn: number; tag?: string; key?: string
  /** Height of each cell above the origin's tangent plane, metres, curvature included (row 0 = north edge). */
  z: Float32Array
  /** Height above the 1737.4 km sphere, metres. */
  h: Float32Array
  /** Surface slope, degrees. */
  slope: Float32Array
  minH: number; maxH: number; resM: number; source: string
}

const R = 1737400
const DEG = Math.PI / 180

self.onmessage = async (ev: MessageEvent<PatchRequest | { init: MoonData }>) => {
  if ('init' in ev.data) { setMoonData(ev.data.init); return }
  const { id, base, lat, lon, spanM, n, tag, key } = ev.data
  const req = ev.data
  const ce = req.ce ?? 0, cn = req.cn ?? 0
  try {
    const data = await loadMoonData(base)
    if (req.warm) return // just load the elevation files so the first real request starts at once
    const s = makeSampler(data)
    if (!s) throw new Error('No elevation data installed')
    const la = lat * DEG, lo = lon * DEG
    const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
    const e = [-Math.sin(lo), Math.cos(lo), 0]
    const nn = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)]
    const z = new Float32Array(n * n), h = new Float32Array(n * n), slope = new Float32Array(n * n)
    const cell = spanM / n
    let minH = Infinity, maxH = -Infinity
    for (let j = 0; j < n; j++) {
      const north = cn + spanM / 2 - (j + 0.5) * cell
      for (let i = 0; i < n; i++) {
        const east = ce + (i + 0.5) * cell - spanM / 2
        const qx = u[0] * R + e[0] * east + nn[0] * north, qy = u[1] * R + e[1] * east + nn[1] * north, qz = u[2] * R + e[2] * east + nn[2] * north
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz), dx = qx / q, dy = qy / q, dz = qz / q
        let hv = s.heightVec(dx, dy, dz)
        if (isNaN(hv)) hv = 0
        const k = j * n + i
        h[k] = hv
        z[k] = (R + hv) * (dx * u[0] + dy * u[1] + dz * u[2]) - R
        if (hv < minH) minH = hv
        if (hv > maxH) maxH = hv
      }
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = h[j * n + Math.max(0, i - 1)], b = h[j * n + Math.min(n - 1, i + 1)]
      const c = h[Math.max(0, j - 1) * n + i], d = h[Math.min(n - 1, j + 1) * n + i]
      const gx = (b - a) / (2 * cell), gy = (c - d) / (2 * cell)
      slope[j * n + i] = Math.atan(Math.sqrt(gx * gx + gy * gy)) / DEG
    }
    const res: PatchResult = { id, ok: true, n, spanM, lat, lon, ce, cn, tag, key, z, h, slope, minH, maxH, resM: Math.max(cell, s.resolution(lat)), source: s.describe(lat) }
    ;(self as unknown as Worker).postMessage(res, [z.buffer, h.buffer, slope.buffer])
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, tag, key, error: (err as Error).message })
  }
}
