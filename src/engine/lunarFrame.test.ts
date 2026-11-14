import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import * as Astronomy from 'astronomy-engine'
import { sampleEphemeris, setEphemeris } from './ephemeris'
import { icrfToMoon } from './lunarFrame'
import { DAY } from './time'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

describe('ICRF → Moon body-fixed rotation (used for the real star sky)', () => {
  it('turns astronomy-engine’s J2000 Sun direction into the DE421 MOON_ME Sun direction within 0.05°', () => {
    const buf = new Float64Array(6)
    let worst = 0
    for (let i = 0; i < 80; i++) {
      const ms = Date.UTC(2025, 0, 1) + i * 9.37 * DAY
      sampleEphemeris(ms, buf)
      const t = new Date(ms)
      const sun = Astronomy.GeoVector(Astronomy.Body.Sun, t, false), moon = Astronomy.GeoMoon(t)
      const v = [sun.x - moon.x, sun.y - moon.y, sun.z - moon.z]
      const l = Math.hypot(...v)
      const m = icrfToMoon(ms)
      const r = [0, 1, 2].map((k) => (m[k * 3] * v[0] + m[k * 3 + 1] * v[1] + m[k * 3 + 2] * v[2]) / l)
      const ref = [buf[0], buf[1], buf[2]], rl = Math.hypot(...ref)
      const ang = Math.acos(Math.min(1, (r[0] * ref[0] + r[1] * ref[1] + r[2] * ref[2]) / rl)) * 180 / Math.PI
      worst = Math.max(worst, ang)
    }
    expect(worst).toBeLessThan(0.05)
  })
})
