import table from './site-horizons.json'
import type { MoonData } from '../explorer/moonData'

/**
 * Terrain skylines of the 78 candidate sites, traced ahead of time with the same code the browser uses
 * (computeHorizon, 360 bearings, 2 m eye, 300 km) from the packaged LOLA grids. Tracing all 78 live takes
 * about 3 s, so the page uses these instead whenever the loaded elevation is that same dataset.
 * Regenerate after changing the Moon data:  npm run build:horizons  (src/data/siteHorizons.test.ts checks them).
 */
export interface SiteHorizonTable { signature: string; bins: number; sites: Record<string, string> }
const T = table as SiteHorizonTable

/** Identifies an elevation dataset by its grids' sizes and value range. */
export function dataSignature(d: MoonData | null): string {
  if (!d?.global || !d.pole || !d.poleHi) return ''
  const g = d.global, p = d.pole, h = d.poleHi
  return `g${g.width}x${g.height}:${g.minM}:${g.maxM}|p${p.width}x${p.height}:${p.pixelM}:${p.x0}|h${h.width}x${h.height}:${h.pixelM}:${h.x0}`
}

export const siteKey = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`

const decoded = new Map<string, Float32Array>()
/** The pre-traced skyline for these coordinates, or null when not available for this dataset. */
export function storedHorizon(lat: number, lon: number, d: MoonData | null): Float32Array | null {
  if (!T.signature || T.signature !== dataSignature(d)) return null
  const key = siteKey(lat, lon)
  const hit = decoded.get(key)
  if (hit) return hit
  const b64 = T.sites[key]
  if (!b64) return null
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const mask = new Float32Array(bytes.buffer)
  decoded.set(key, mask)
  return mask
}
