import { describe, expect, it } from 'vitest'
import { destination, estimateSlopeDeg, offsetLatLon, type Sampler } from './moonData'

const R = 1737400, D = Math.PI / 180
/** Great-circle distance in metres. */
function dist(a: [number, number], b: [number, number]) {
  const c = Math.sin(a[0] * D) * Math.sin(b[0] * D) + Math.cos(a[0] * D) * Math.cos(b[0] * D) * Math.cos((a[1] - b[1]) * D)
  return Math.acos(Math.min(1, c)) * R
}

describe('offsetLatLon', () => {
  it('zero offset is the same point', () => {
    const [la, lo] = offsetLatLon(-85, 30, 0, 0)
    expect(la).toBeCloseTo(-85, 9); expect(lo).toBeCloseTo(30, 9)
  })
  it('1 km north or east lands 1 km away in the right direction (matches destination())', () => {
    for (const [lat, lon] of [[-85, 30], [-89.67, 129.78], [10, -40]]) {
      const n = offsetLatLon(lat, lon, 0, 1000), e = offsetLatLon(lat, lon, 1000, 0)
      expect(dist([lat, lon], n)).toBeCloseTo(1000, 0); expect(dist([lat, lon], e)).toBeCloseTo(1000, 0)
      const dn = destination(lat, lon, 0, 1000), de = destination(lat, lon, 90, 1000)
      expect(dist(n, dn)).toBeLessThan(1); expect(dist(e, de)).toBeLessThan(1)
    }
  })
  it('works exactly at the pole: east and north are different directions', () => {
    const n = offsetLatLon(-90, 0, 0, 1000), e = offsetLatLon(-90, 0, 1000, 0)
    expect(dist([-90, 0], n)).toBeCloseTo(1000, 0); expect(dist([-90, 0], e)).toBeCloseTo(1000, 0)
    expect(dist(n, e)).toBeCloseTo(1000 * Math.SQRT2, 0)
  })
})

describe('Horn slope', () => {
  const flat: Sampler = { height: () => 0, heightVec: () => 0, resolution: () => 80, describe: () => 'test' }
  it('is 0° on flat ground', () => expect(estimateSlopeDeg(flat, -85, 30)).toBeCloseTo(0, 9))
  it('measures a 10 % ramp as 5.7°, whichever way it faces', () => {
    const lat0 = -85
    const northRamp: Sampler = { ...flat, height: (la) => 0.1 * (la - lat0) * D * R }
    expect(estimateSlopeDeg(northRamp, lat0, 30)).toBeCloseTo(Math.atan(0.1) / D, 1)
    const lon0 = 30, k = Math.cos(lat0 * D)
    const eastRamp: Sampler = { ...flat, height: (_la, lo) => 0.1 * (lo - lon0) * D * R * k }
    expect(estimateSlopeDeg(eastRamp, lat0, lon0)).toBeCloseTo(Math.atan(0.1) / D, 1)
  })
  it('is NaN where the elevation model has no data', () => {
    const hole: Sampler = { ...flat, height: () => NaN }
    expect(estimateSlopeDeg(hole, -85, 30)).toBeNaN()
  })
})
