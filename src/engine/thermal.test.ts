import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { setEphemeris } from './ephemeris'
import { computeSeries, makeFrame, SPHERE_HORIZON, summarize } from './sky'
import { equilibriumK, fmtC, solarFlux, SOLAR_CONSTANT, sunOnGround, sunOnPanel } from './thermal'
import { HOUR } from './time'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

describe('heat and light', () => {
  it('solar flux is the solar constant at 1 AU and follows the inverse square', () => {
    const r1 = Math.asin(695700 / 149597870.7) * 180 / Math.PI
    expect(solarFlux(r1)).toBeCloseTo(SOLAR_CONSTANT, 6)
    expect(solarFlux(r1 * 1.02)).toBeCloseTo(SOLAR_CONSTANT * 1.02 * 1.02, 0)
    expect(solarFlux()).toBe(SOLAR_CONSTANT)
  })
  it('level ground gets sin(elevation) of what a Sun-facing panel gets', () => {
    expect(sunOnGround(1, 90)).toBeCloseTo(sunOnPanel(1), 6)
    expect(sunOnGround(1, 1.5) / sunOnPanel(1)).toBeCloseTo(Math.sin(1.5 * Math.PI / 180), 6)
    expect(sunOnGround(1, -2)).toBe(0)
    expect(sunOnPanel(0.5)).toBeCloseTo(SOLAR_CONSTANT / 2, 6)
  })
  it('subsolar ground reaches about 385 K, like the measured lunar noon (~390 K)', () => {
    const t = equilibriumK(SOLAR_CONSTANT)
    expect(t).toBeGreaterThan(375); expect(t).toBeLessThan(395)
    expect(equilibriumK(0)).toBe(0)
  })
  it('formats Celsius with a true minus sign', () => {
    expect(fmtC(273.15)).toBe('0 °C'); expect(fmtC(173.15)).toBe('−100 °C'); expect(fmtC(373.15)).toBe('100 °C')
  })
  it('at the south pole level ground never gets warmer than about −120 °C', () => {
    const s = computeSeries(makeFrame(-90, 0), SPHERE_HORIZON, Date.UTC(2026, 0, 1), 6 * HOUR, 4 * 366)
    const k = summarize(s).peakGroundK
    // Sun at most ~1.6° up: q ≈ 1361·sin(1.6°) ≈ 38 W/m² → ≈ 157 K
    expect(k).toBeGreaterThan(140); expect(k).toBeLessThan(170)
  })
  it('a site that never sees the Sun reports 0 K (shown as "never lit")', () => {
    const s = computeSeries(makeFrame(-90, 0), { kind: 'terrain', mask: new Float32Array(360).fill(10), source: 'test wall' }, Date.UTC(2026, 0, 1), 6 * HOUR, 120)
    expect(summarize(s).sunAnyPct).toBe(0)
    expect(summarize(s).peakGroundK).toBe(0)
  })
})
