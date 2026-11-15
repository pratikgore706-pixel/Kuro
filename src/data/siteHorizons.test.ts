import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeHorizon, makeSampler, type MoonData } from '../explorer/moonData'
import { SITES } from './sites'
import { dataSignature, siteKey, storedHorizon } from './siteHorizons'

// Builds MoonData from the raw grids in public/moon, exactly as the browser loader does.
function rawMoon(): MoonData | null {
  const dir = join(process.cwd(), 'public', 'moon')
  if (!existsSync(join(dir, 'manifest.json'))) return null
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  const read = (f: string) => { const p = join(dir, f); if (!existsSync(p)) return null; const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }
  const gb = read(m.global.file), pb = read(m.pole.file), hb = read(m.poleHi.file)
  if (!gb || !pb || !hb) return null
  const polar = (d: any, b: ArrayBuffer) => ({ width: d.width, height: d.height, data: new Int16Array(b), x0: d.x0, y0: d.y0, pixelM: d.pixelM, noData: d.noData, source: d.source })
  return {
    ok: true, colorUrl: null, colorSource: null, missing: [],
    global: { width: m.global.width, height: m.global.height, data: new Uint16Array(gb), minM: m.global.minM, maxM: m.global.maxM, source: m.global.source, pixelDeg: m.global.pixelDeg },
    pole: polar(m.pole, pb), poleHi: polar(m.poleHi, hb),
  }
}
// npm sets npm_lifecycle_event on every platform, so this needs no cross-env
const BUILD = process.env.npm_lifecycle_event === 'build:horizons'
const moon = rawMoon()
const b64 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')

describe('pre-traced site skylines', () => {
  // npm run build:horizons
  it.skipIf(!BUILD || !moon)('writes src/data/site-horizons.json', () => {
    const s = makeSampler(moon!)!
    const sites: Record<string, string> = {}
    for (const site of SITES) sites[siteKey(site.lat, site.lon)] = b64(computeHorizon(s, site.lat, site.lon))
    writeFileSync(join(process.cwd(), 'src', 'data', 'site-horizons.json'), JSON.stringify({ signature: dataSignature(moon), bins: 360, sites }) + '\n')
  }, 120000)

  it.skipIf(!!BUILD || !moon)('match a live trace, value for value, for every site', () => {
    const s = makeSampler(moon!)!
    for (const site of SITES) {
      const stored = storedHorizon(site.lat, site.lon, moon)
      expect(stored, site.id).not.toBeNull()
      expect(b64(stored!)).toBe(b64(computeHorizon(s, site.lat, site.lon)))
    }
  }, 120000)
})
