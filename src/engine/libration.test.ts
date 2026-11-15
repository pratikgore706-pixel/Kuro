import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import { setEphemeris } from './ephemeris'
import { librationStay, librationWords, subEarthPoint } from './libration'
import { computeSeries, makeFrame, SPHERE_HORIZON, summarize } from './sky'
import { DAY } from './time'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

describe('libration is inside KURO’s Earth directions', () => {
  it('the sub-Earth point wobbles by the textbook amounts (≈ ±7.9° east–west, ≈ ±6.7° north–south)', () => {
    let lonMax = 0, latMax = 0
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2031, 0, 1); t += 6 * 3600000) {
      const p = subEarthPoint(t)!
      lonMax = Math.max(lonMax, Math.abs(p.lon)); latMax = Math.max(latMax, Math.abs(p.lat))
    }
    expect(lonMax).toBeGreaterThan(7.5); expect(lonMax).toBeLessThan(8.3)
    expect(latMax).toBeGreaterThan(6.4); expect(latMax).toBeLessThan(7.0)
  })
  it('agrees with astronomy-engine’s independent libration theory to within 0.1°', () => {
    let worst = 0
    for (let i = 0; i < 200; i++) {
      const t = Date.UTC(2024, 0, 1) + i * 3.7 * DAY
      const p = subEarthPoint(t)!, a = Astronomy.Libration(new Date(t))
      worst = Math.max(worst, Math.abs(p.lat - a.elat), Math.abs(p.lon - a.elon))
    }
    expect(worst).toBeLessThan(0.1)
  })
  it('real Earth numbers are the same samples as the stay summary', () => {
    const f = makeFrame(-89.67, 129.78), start = Date.UTC(2026, 11, 1), n = 1345, step = (14 * DAY) / (n - 1)
    const s = computeSeries(f, SPHERE_HORIZON, start, step, n, 2)
    const L = librationStay(f, SPHERE_HORIZON, start, step, n, 2)
    expect(L.realPct).toBe(summarize(s).earthPct)
    expect(L.ok).toBe(true)
  })
  it('at the pole the wobble decides contact: without it Earth would sit just below the horizon all month', () => {
    const f = makeFrame(-90, 0), start = Date.UTC(2026, 11, 1), n = 2881, step = (30 * DAY) / (n - 1)
    const L = librationStay(f, SPHERE_HORIZON, start, step, n)
    // seen from the south pole, parallax puts an Earth held at its average place ≈ 0.26° below a smooth horizon
    expect(L.fixedPct).toBe(0)
    expect(L.fixedClear[0]).toBeCloseTo(-0.26, 1); expect(L.fixedClear[1]).toBeCloseTo(-0.26, 1)
    expect(L.realPct).toBeGreaterThan(20); expect(L.realPct).toBeLessThan(80)
    expect(L.realClearRange[1] - L.realClearRange[0]).toBeGreaterThan(10)
    expect(librationWords(L, 30)).toMatch(/only because of libration/)
  })
  it('far from the poles and limbs the wobble changes nothing for the link', () => {
    const f = makeFrame(0.67, 23.47), start = Date.UTC(2026, 11, 1), n = 1345, step = (14 * DAY) / (n - 1)
    const L = librationStay(f, SPHERE_HORIZON, start, step, n)
    expect(L.realPct).toBe(100); expect(L.fixedPct).toBe(100)
    expect(librationWords(L, 14)).toMatch(/no difference/)
  })
  it('outside the ephemeris table it says so instead of extrapolating', () => {
    expect(subEarthPoint(Date.UTC(2060, 0, 1))).toBeNull()
  })
})
