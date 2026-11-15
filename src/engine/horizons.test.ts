import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { setEphemeris } from './ephemeris'
import { checkAgainstHorizons } from './horizonsCheck'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

describe('agreement with NASA/JPL Horizons (DE441)', () => {
  it('reproduces Horizons Sun and Earth positions at ten sites', () => {
    const r = checkAgainstHorizons()
    console.table(r.rows.map((x) => ({ site: x.id, n: x.n, 'sun Δel°': x.sunMaxEl.toFixed(4), 'earth Δel°': x.earthMaxEl.toFixed(4), 'max sep°': x.maxSep.toFixed(4), 'rms sep°': x.rmsSep.toFixed(4) })))
    expect(r.total).toBe(1440)
    expect(r.worstEl).toBeLessThan(0.02)
    expect(r.worstSep).toBeLessThan(0.02)
  })
})
