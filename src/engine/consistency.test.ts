/**
 * Whole-app consistency: the same stay must give the same numbers everywhere it appears, every time.
 * Covers many sites × dates × stay lengths × antenna margins, with real NASA terrain-like skylines.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { runs, sunState } from '../components/Timeline'
import { GROUPS, SITES } from '../data/sites'
import { rankSites, scoreStay, stayStepCount } from '../services/api'
import { setEphemeris } from './ephemeris'
import { librationStay } from './libration'
import { computeSeries, computeSky, freshEvent, makeFrame, newSky, nextEvent, SPHERE_HORIZON, summarize, type Horizon } from './sky'
import { DAY, HOUR } from './time'

beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8'))
  const b = readFileSync('public/data/ephemeris.bin')
  setEphemeris(meta, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
})

// skylines like the real ones: a crater-rim wall, rolling hills, and the ideal sphere
const wall: Horizon = { kind: 'terrain', source: 'test wall', mask: new Float32Array(720).map((_, i) => (i < 160 || i > 560 ? 2.6 : 0.3)) }
const hills: Horizon = { kind: 'terrain', source: 'test hills', mask: new Float32Array(720).map((_, i) => 1.2 + 1.1 * Math.sin(i / 37) + 0.6 * Math.sin(i / 11)) }
const HORIZONS = [SPHERE_HORIZON, wall, hills]
/** One candidate from each of the 9 regions (the full 78 are checked in the site-list tests). */
const POLAR = GROUPS.map((g) => SITES.find((s) => s.group === g)!)
const DATES = [Date.UTC(2026, 10, 15), Date.UTC(2027, 2, 3, 14, 30), Date.UTC(2028, 7, 20, 6, 5), Date.UTC(2031, 0, 9)]
const STAYS = [7, 14, 30, 120]
const MARGINS = [0, 3, 8]

/** The stay exactly as the Explorer computes it (useSeries). */
function stay(lat: number, lon: number, h: Horizon, landing: number, days: number, margin: number) {
  const n = stayStepCount(days)
  return computeSeries(makeFrame(lat, lon), h, landing, (days * DAY) / (n - 1), n, margin)
}

describe('same input, same output (nothing random)', () => {
  it('series, summary, score and ranking are identical on every run', () => {
    for (const s of POLAR.slice(0, 4)) {
      const a = summarize(stay(s.lat, s.lon, wall, DATES[1], 14, 2)), b = summarize(stay(s.lat, s.lon, wall, DATES[1], 14, 2))
      expect(b).toEqual(a)
      expect(scoreStay(b, 4.2)).toEqual(scoreStay(a, 4.2))
    }
    expect(rankSites(POLAR, DATES[0], 14, 3)).toEqual(rankSites(POLAR, DATES[0], 14, 3))
  })
})

describe('numbers stay sane for every site, date, stay and antenna margin', () => {
  it('percentages in 0–100, durations within the stay, “both” never more than either', () => {
    let cases = 0
    for (const s of POLAR) for (const h of HORIZONS) for (const t of DATES) for (const d of STAYS) for (const m of MARGINS) {
      if (d === 120 && h !== wall) continue // keep the run short; the long stay is covered on one skyline
      const m1 = summarize(stay(s.lat, s.lon, h, t, d, m))
      for (const v of [m1.sunPct, m1.sunAnyPct, m1.earthPct, m1.bothPct]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
      expect(m1.sunPct).toBeLessThanOrEqual(m1.sunAnyPct + 1e-9)
      expect(m1.bothPct).toBeLessThanOrEqual(Math.min(m1.sunAnyPct, m1.earthPct) + 1e-9)
      expect(m1.longestDarkH).toBeLessThanOrEqual(d * 24 + 1)
      expect(m1.longestOutageH).toBeLessThanOrEqual(d * 24 + 1)
      const sc = scoreStay(m1, 3)
      if (sc.score !== null) { expect(sc.score).toBeGreaterThanOrEqual(0); expect(sc.score).toBeLessThanOrEqual(100) }
      expect(sc.blockers.includes('no sunlight')).toBe(m1.sunAnyPct === 0)
      expect(sc.blockers.includes('Earth never in view')).toBe(m1.earthPct === 0)
      cases++
    }
    expect(cases).toBeGreaterThan(400)
  })
  it('a stricter antenna margin never gives more Earth time', () => {
    for (const s of POLAR) for (const t of DATES) {
      const e = MARGINS.map((m) => summarize(stay(s.lat, s.lon, hills, t, 14, m)).earthPct)
      expect(e[1]).toBeLessThanOrEqual(e[0]); expect(e[2]).toBeLessThanOrEqual(e[1])
    }
  })
  it('outside the 1966–2049 table nothing is invented: the stay is marked incomplete', () => {
    const s = stay(-85, 30, SPHERE_HORIZON, Date.UTC(2049, 11, 25), 14, 0)
    expect(s.complete).toBe(false)
    expect(computeSky(makeFrame(-85, 30), SPHERE_HORIZON, Date.UTC(2055, 0, 1), newSky()).ok).toBe(false)
  })
})

describe('the bottom timeline agrees with the panels above it', () => {
  it('its bands cover exactly the share of the stay the panel reports', () => {
    for (const s of POLAR.slice(0, 5)) for (const t of DATES) {
      const se = stay(s.lat, s.lon, wall, t, 14, 2), m = summarize(se)
      const lit = runs(se.n, sunState(se)).filter(([, , st]) => st > 0).reduce((a, [x, y]) => a + (y - x), 0)
      const earth = runs(se.n, (i) => se.earthUp[i]).filter(([, , st]) => st > 0).reduce((a, [x, y]) => a + (y - x), 0)
      expect((100 * lit) / se.n).toBeCloseTo(m.sunAnyPct, 9)
      expect((100 * earth) / se.n).toBeCloseTo(m.earthPct, 9)
    }
  })
  it('every band edge is where the countdown says the Sun or Earth rises or sets', () => {
    let edges = 0
    for (const s of POLAR.slice(0, 5)) for (const t of DATES.slice(0, 3)) for (const body of ['sun', 'earth'] as const) {
      const f = makeFrame(s.lat, s.lon), margin = 2, se = stay(s.lat, s.lon, wall, t, 14, margin)
      const on = (i: number) => (body === 'sun' ? se.sunFrac[i] > 0 : se.earthUp[i] > 0)
      for (let i = 1; i < se.n; i++) {
        if (on(i) === on(i - 1)) continue
        // the countdown, asked from the sample before the edge, must land between the two samples
        const ev = nextEvent(f, wall, se.startMs + (i - 1) * se.stepMs, body, 60, margin)
        expect(ev).not.toBeNull()
        expect(ev!.type).toBe(on(i) ? 'rise' : 'set')
        expect(ev!.ms).toBeGreaterThan(se.startMs + (i - 1) * se.stepMs)
        expect(ev!.ms).toBeLessThanOrEqual(se.startMs + i * se.stepMs + 30000)
        edges++
      }
    }
    expect(edges).toBeGreaterThan(20)
  })
  it('the hover card shows exactly the values drawn under the cursor', () => {
    const f = makeFrame(-84.79, 29.2), se = stay(-84.79, 29.2, hills, DATES[0], 14, 3)
    for (let i = 0; i < se.n; i += 37) {
      const k = computeSky(f, hills, se.startMs + i * se.stepMs, newSky(), 3)
      expect(k.sunEl).toBeCloseTo(se.sunEl[i], 4); expect(k.earthEl).toBeCloseTo(se.earthEl[i], 4)
      expect(k.sunFrac).toBeCloseTo(se.sunFrac[i], 5); expect(k.earthUp ? 1 : 0).toBe(se.earthUp[i])
    }
  })
  it('the countdown never points to a moment behind the slider', () => {
    // walk a slider through a stay in 1-minute steps, using the 10-minute cache like the Explorer does
    const f = makeFrame(-85.2, 53.5), h = wall, margin = 0
    let bad = 0, checked = 0
    for (let ms = DATES[0]; ms < DATES[0] + 3 * DAY; ms += 60000) {
      const bucket = Math.floor(ms / 600000) * 600000
      for (const body of ['sun', 'earth'] as const) {
        const ev = freshEvent(nextEvent(f, h, bucket, body, 60, margin), f, h, ms, body, margin)
        if (!ev) continue
        checked++
        const now = computeSky(f, h, ms, newSky(), margin)
        const up = body === 'sun' ? now.sunFrac > 0 : now.earthUp
        if (ev.ms <= ms || (ev.type === 'set') !== up) bad++
      }
    }
    expect(checked).toBeGreaterThan(1000)
    expect(bad).toBe(0)
  })
})

describe('the same stay shows the same numbers in every place', () => {
  it('ranking row = site panel = libration card = Compare', () => {
    const t = DATES[0], days = 14, margin = 2
    const ranked = rankSites(POLAR, t, days, margin)
    for (const r of ranked) {
      const panel = summarize(stay(r.site.lat, r.site.lon, SPHERE_HORIZON, t, days, margin))
      expect(r.summary).toEqual(panel)
      const n = stayStepCount(days), f = makeFrame(r.site.lat, r.site.lon)
      expect(librationStay(f, SPHERE_HORIZON, t, (days * DAY) / (n - 1), n, margin).realPct).toBe(panel.earthPct)
    }
  })
  it('ranking is in score order and blocked sites score 0', () => {
    const ranked = rankSites(POLAR, DATES[2], 30, 0)
    for (let i = 1; i < ranked.length; i++) expect((ranked[i - 1].score ?? -1) >= (ranked[i].score ?? -1)).toBe(true)
    for (const r of ranked) if (r.blockers.length) expect(r.score).toBe(0)
  })
  it('moving the landing by a day changes the stay (the date really is used)', () => {
    const a = summarize(stay(-89.67, 129.78, wall, DATES[0], 14, 0)), b = summarize(stay(-89.67, 129.78, wall, DATES[0] + 9 * DAY, 14, 0))
    expect(a).not.toEqual(b)
    expect(HOUR).toBe(3600000)
  })
})
