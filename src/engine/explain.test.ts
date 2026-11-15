import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { scoreStay } from '../services/api'
import { summarizeStatuses, type Status } from '../services/backendScore'
import { setEphemeris } from './ephemeris'
import { dateSensitivity, dateWords, rankReason } from './explain'
import { computeSeries, makeFrame, SPHERE_HORIZON, summarize, type Horizon, type Summary } from './sky'
import { DAY } from './time'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

// a crater-rim-like skyline: a 3° wall to the north, low elsewhere
const mask = new Float32Array(360).map((_, i) => (i < 60 || i > 300 ? 3 : 0.2))
const rim: Horizon = { kind: 'terrain', mask, source: 'test' }

describe('why a few days matter', () => {
  it('covers 15 days either side and agrees with a direct computation at the chosen date', () => {
    const f = makeFrame(-89, 0), t = Date.UTC(2026, 11, 1)
    const ds = dateSensitivity(f, rim, t, 14)
    expect(ds.offsets).toHaveLength(31); expect(ds.offsets[0]).toBe(-15); expect(ds.offsets[30]).toBe(15)
    const direct = summarize(computeSeries(f, rim, t, DAY / 96, 14 * 96 + 1))
    expect(Math.abs(ds.sun[15] - direct.sunPct)).toBeLessThan(2)
    expect(Math.abs(ds.earth[15] - direct.earthPct)).toBeLessThan(2)
    // near the pole behind a wall the date really matters
    expect(Math.max(...ds.sun) - Math.min(...ds.sun)).toBeGreaterThan(10)
  })
  it('marks dates outside the ephemeris table instead of extrapolating', () => {
    const ds = dateSensitivity(makeFrame(-85, 0), SPHERE_HORIZON, Date.UTC(2049, 11, 20), 7)
    expect(ds.sun.some((v) => isNaN(v))).toBe(true)
  })
  it('says the biggest change within a week, and calls a steady site forgiving', () => {
    const offsets = Array.from({ length: 31 }, (_, i) => i - 15)
    const swing = { offsets, sun: offsets.map((d) => (d === 4 ? 31 : 72)), earth: offsets.map(() => 60) }
    expect(dateWords(swing, 72, 60, 1.4, 3)[0]).toBe('Landing 4 days later would cut sunlight from 72% to 31%.')
    const flat = { offsets, sun: offsets.map(() => 80), earth: offsets.map(() => 100) }
    expect(dateWords(flat, 80, 100, 40, null)[0]).toMatch(/forgiving/)
    expect(dateWords(swing, 72, 60, 1.4, 3).some((t) => t.startsWith('Why: here the Sun never climbs more than 1.4°'))).toBe(true)
  })
})

describe('ranking reason', () => {
  it('explains a blocked site by what is missing', () => {
    const m = summarize(computeSeries(makeFrame(-89, 0), { kind: 'terrain', mask: new Float32Array(360).fill(20), source: 't' }, Date.UTC(2026, 11, 1), DAY / 24, 14 * 24))
    const sc = scoreStay(m, 2)
    expect(sc.score).toBe(0)
    expect(rankReason(sc, m, 2, 14)).toMatch(/never sees the Sun or Earth during these 14 days/)
  })
  it('names the strongest and weakest part otherwise', () => {
    const all = (st: Status) => new Array<Status>(1344).fill(st)
    const m: Summary = { sunPct: 100, sunAnyPct: 100, peakSunEl: 2, longestDarkH: 0, earthPct: 100, longestOutageH: 0, commWindows: 1, bothPct: 100, peakGroundK: 200, backend: summarizeStatuses(all('V'), all('V'), 900) }
    expect(rankReason(scoreStay(m, 13), m, 13, 14)).toBe('Helped most by sunlight 100% of the time; held back most by steep ground (13.0° slope).')
    // a 30-hour radio gap (120 samples of 15 min) makes safety the weak part
    const earth = all('V').fill('B', 0, 120)
    const gappy: Summary = { ...m, earthPct: 91, longestOutageH: 30, bothPct: 91, backend: summarizeStatuses(all('V'), earth, 900) }
    expect(rankReason(scoreStay(gappy, 1), gappy, 1, 14)).toBe('Helped most by sunlight 100% of the time; held back most by a 30 h radio gap.')
    expect(rankReason(scoreStay(m, 0.5), m, 0.5, 14)).toMatch(/^Even across the board/)
    // a weakest part that still scores well is not called a weakness
    expect(rankReason(scoreStay(m, 2.2), m, 2.2, 14)).toBe('Strong all round: every part scores 85 or more, the lowest being gentle ground (2.2° slope).')
    const short = { ...m, longestDarkH: 3.9 }
    expect(rankReason(scoreStay(short, 13), short, 13, 14)).toBe('Helped most by sunlight 100% of the time; held back most by steep ground (13.0° slope).')
  })
})
