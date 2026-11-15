import { describe, expect, it } from 'vitest'
import { computeHorizon, destination, fromStereo, toStereo, type Sampler } from './moonData'

describe('south polar stereographic', () => {
  it('round-trips latitude and longitude', () => {
    for (const [la, lo] of [[-89.9, 10], [-85, -120], [-80.5, 179], [-88, 0]]) {
      const [x, y] = toStereo(la, lo)
      const [la2, lo2] = fromStereo(x, y)
      expect(la2).toBeCloseTo(la, 9); expect(lo2).toBeCloseTo(lo, 9)
    }
  })
  it('puts 80°S about 304 km from the pole', () => {
    const [x, y] = toStereo(-80, 0)
    expect(Math.hypot(x, y) / 1000).toBeCloseTo(304.1, 0)
  })
})

describe('terrain horizon', () => {
  const flat: Sampler = { height: () => 0, heightVec: () => 0, resolution: () => 500, describe: () => 'flat test sphere' }
  it('on a smooth sphere the horizon sits just below 0° (curvature + 2 m eye)', () => {
    const m = computeHorizon(flat, -60, 20, 2, 36, 300)
    for (const v of m) { expect(v).toBeLessThan(0); expect(v).toBeGreaterThan(-0.2) }
  })
  it('a 1 km ridge 20 km to the east raises the eastern horizon to about 2.5° (incl. curvature)', () => {
    const ridge: Sampler = { ...flat, height: (la, lo) => (Math.abs(lo - 21.319) < 0.03 && Math.abs(la + 60) < 1 ? 1000 : 0) }
    const [la, lo] = destination(-60, 20, 90, 20000)
    expect(la).toBeCloseTo(-60, 0); expect(lo).toBeCloseTo(21.319, 2)
    const m = computeHorizon(ridge, -60, 20, 2, 360, 100)
    expect(m[90]).toBeGreaterThan(2.2); expect(m[90]).toBeLessThan(2.9)
    expect(m[270]).toBeLessThan(0)
  })
})
