import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import { setEphemeris } from './ephemeris'
import { computeSeries, computeSky, discFraction, makeFrame, newSky, nextEvent, SPHERE_HORIZON, summarize } from './sky'
import { DAY, HOUR, ttMinusUtc } from './time'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

describe('time', () => {
  it('TT−UTC is 69.184 s after 2017', () => expect(ttMinusUtc(Date.UTC(2026, 0, 1))).toBeCloseTo(69.184, 6))
  it('TT−UTC is 42.184 s in 1972', () => expect(ttMinusUtc(Date.UTC(1972, 2, 1))).toBeCloseTo(42.184, 6))
})

describe('sky geometry vs astronomy-engine (independent model)', () => {
  // At the sub-Earth point Earth is at the zenith, so Earth's elevation seen from (lat 0, lon 0) is
  // 90° minus the angular size of the libration. astronomy-engine uses an analytic theory (~0.03°).
  it('Earth elevation at the mean sub-Earth point matches optical libration', () => {
    const f = makeFrame(0, 0), k = newSky()
    for (let i = 0; i < 60; i++) {
      const ms = Date.UTC(2024, 0, 3) + i * 17.3 * DAY
      computeSky(f, SPHERE_HORIZON, ms, k)
      const lib = Astronomy.Libration(new Date(ms))
      const sep = Math.acos(Math.cos(lib.elat * Math.PI / 180) * Math.cos(lib.elon * Math.PI / 180)) * 180 / Math.PI
      // geocentric → topocentric parallax at the sub-Earth point is second-order here; allow 0.08°
      expect(Math.abs(90 - k.earthEl - sep)).toBeLessThan(0.08)
      expect(k.earthR).toBeCloseTo(lib.diam_deg ? Math.asin(6378.137 / (lib.dist_km - 1737.4)) * 180 / Math.PI : 0, 2)
    }
  })
  it('Sun is overhead at lon 0 near full Moon and on the far side near new Moon', () => {
    const k = newSky()
    const full = Astronomy.SearchMoonPhase(180, new Date(Date.UTC(2026, 0, 1)), 40)!.date.getTime()
    const neu = Astronomy.SearchMoonPhase(0, new Date(Date.UTC(2026, 0, 1)), 40)!.date.getTime()
    expect(computeSky(makeFrame(0, 0), SPHERE_HORIZON, full, k).sunEl).toBeGreaterThan(80)
    expect(computeSky(makeFrame(0, 180), SPHERE_HORIZON, neu, k).sunEl).toBeGreaterThan(80)
    expect(computeSky(makeFrame(0, 0), SPHERE_HORIZON, neu, k).sunEl).toBeLessThan(-80)
  })
  it('Apollo 11: Sun ~10.8° above the eastern horizon at touchdown (1969-07-20 20:17:40 UTC)', () => {
    const k = computeSky(makeFrame(0.67416, 23.47314), SPHERE_HORIZON, Date.UTC(1969, 6, 20, 20, 17, 40), newSky())
    expect(k.sunEl).toBeGreaterThan(10.3); expect(k.sunEl).toBeLessThan(11.3)
    expect(k.sunAz).toBeGreaterThan(85); expect(k.sunAz).toBeLessThan(95)
    expect(k.earthUp).toBe(true)
  })
  it('at the south pole the Sun never climbs above ~1.6°', () => {
    const s = computeSeries(makeFrame(-90, 0), SPHERE_HORIZON, Date.UTC(2026, 0, 1), 6 * HOUR, 4 * 366)
    const peak = summarize(s).peakSunEl
    expect(peak).toBeGreaterThan(1.4); expect(peak).toBeLessThan(1.7)
  })
})

describe('events and helpers', () => {
  it('disc fraction limits', () => {
    expect(discFraction(-1)).toBe(0); expect(discFraction(1)).toBe(1); expect(discFraction(0)).toBeCloseTo(0.5, 9)
  })
  it('sunrise/sunset alternate about half a synodic month apart at the equator', () => {
    const f = makeFrame(0, 30), t0 = Date.UTC(2027, 3, 1)
    const a = nextEvent(f, SPHERE_HORIZON, t0, 'sun')!, b = nextEvent(f, SPHERE_HORIZON, a.ms + HOUR, 'sun')!
    expect(a.type).not.toBe(b.type)
    expect((b.ms - a.ms) / DAY).toBeGreaterThan(14.2); expect((b.ms - a.ms) / DAY).toBeLessThan(15.4)
  })
  it('Earth never sets at the centre of the near side; never rises at the centre of the far side', () => {
    expect(nextEvent(makeFrame(0, 0), SPHERE_HORIZON, Date.UTC(2026, 5, 1), 'earth')).toBeNull()
    expect(computeSky(makeFrame(0, 180), SPHERE_HORIZON, Date.UTC(2026, 5, 1), newSky()).earthUp).toBe(false)
  })
  it('refuses to extrapolate outside the table', () => {
    expect(computeSky(makeFrame(0, 0), SPHERE_HORIZON, Date.UTC(2055, 0, 1), newSky()).ok).toBe(false)
  })
})
