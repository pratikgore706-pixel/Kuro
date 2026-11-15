import { describe, expect, it } from 'vitest'
import type { Summary } from '../engine/sky'
import { fmtOffset } from '../data/sites'
import { fmtTimeOfDay, parseTimeOfDay } from '../engine/time'
import { useStore } from '../store'
import { RANKING_WEIGHTS, scoreStay } from './api'
import { summarizeStatuses, type Status } from './backendScore'

const all = (st: Status, n = 1344) => new Array<Status>(n).fill(st)
const backend = (sun: Status, earth: Status) => summarizeStatuses(all(sun), all(earth), 900)
const ideal: Summary = { sunPct: 100, sunAnyPct: 100, peakSunEl: 1.5, longestDarkH: 0, earthPct: 100, longestOutageH: 0, commWindows: 1, bothPct: 100, peakGroundK: 150, backend: backend('V', 'V') }
const dark: Summary = { sunPct: 0, sunAnyPct: 0, peakSunEl: -1, longestDarkH: 336, earthPct: 0, longestOutageH: 336, commWindows: 0, bothPct: 0, peakGroundK: 0, backend: backend('B', 'B') }

describe('site score', () => {
  it('weights add up to 1', () => expect(Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12))
  it('a flat, always-lit, always-in-contact stay scores 100; a steep, dark, silent one scores 0', () => {
    expect(scoreStay(ideal, 0).score).toBeCloseTo(100, 9)
    expect(scoreStay(dark, 20).score).toBeCloseTo(0, 9)
  })
  it('no sunlight or no Earth at all scores 0, however flat the ground', () => {
    const noSun = scoreStay({ ...ideal, sunPct: 0, sunAnyPct: 0, bothPct: 0, backend: backend('B', 'V') }, 0)
    expect(noSun.score).toBe(0); expect(noSun.blockers).toEqual(['no sunlight'])
    // the backend's own number is kept and shown: it rates flat, safe ground even without light
    expect(noSun.backendScore!).toBeGreaterThan(40)
    const noEarth = scoreStay({ ...ideal, earthPct: 0, bothPct: 0, backend: backend('V', 'B') }, 0)
    expect(noEarth.score).toBe(0); expect(noEarth.blockers).toEqual(['Earth never in view'])
    expect(scoreStay(ideal, 0).blockers).toEqual([])
  })
  it('without slope data the score uses the other parts and says so', () => {
    const s = scoreStay(ideal, null)
    expect(s.componentScores.terrain).toBeNull()
    // safety keeps only darkness and radio gap (40% of its inputs); terrain has nothing
    expect(s.completenessPct).toBeCloseTo(60, 9)
    expect(scoreStay(ideal, 1).completenessPct).toBeCloseTo(80, 9)
    expect(s.score).toBeCloseTo(100, 9)
  })
  it('steeper ground lowers the score', () => {
    expect(scoreStay(ideal, 10).score!).toBeLessThan(scoreStay(ideal, 2).score!)
  })
  it('every part stays within 0–100', () => {
    const weird: Summary = { ...ideal, longestDarkH: 1e6, longestOutageH: -5, sunPct: 140 }
    for (const v of Object.values(scoreStay(weird, 99).componentScores)) { expect(v!).toBeGreaterThanOrEqual(0); expect(v!).toBeLessThanOrEqual(100) }
  })
})

describe('landing time', () => {
  it('parses and formats HH:MM', () => {
    expect(parseTimeOfDay('14:30')).toBe((14 * 60 + 30) * 60000)
    expect(parseTimeOfDay('00:00')).toBe(0)
    expect(parseTimeOfDay('24:00')).toBeNull(); expect(parseTimeOfDay('')).toBeNull(); expect(parseTimeOfDay('9:75')).toBeNull()
    expect(fmtTimeOfDay(Date.UTC(2026, 11, 1, 7, 5))).toBe('07:05')
  })
  it('the store keeps the time of day (to the minute) instead of snapping to midnight', () => {
    useStore.getState().setReady([Date.UTC(2000, 0, 1), Date.UTC(2040, 0, 1)])
    useStore.getState().setLanding(Date.UTC(2026, 11, 1, 14, 30, 20))
    expect(useStore.getState().landingMs).toBe(Date.UTC(2026, 11, 1, 14, 30))
    expect(useStore.getState().cursorMs).toBe(Date.UTC(2026, 11, 1, 14, 30))
    useStore.getState().setLanding(NaN)
    expect(useStore.getState().landingMs).toBe(Date.UTC(2026, 11, 1, 14, 30))
  })
  it('antenna margin is clamped to 0–20°', () => {
    useStore.getState().setEarthMargin(-3); expect(useStore.getState().earthMarginDeg).toBe(0)
    useStore.getState().setEarthMargin(50); expect(useStore.getState().earthMarginDeg).toBe(20)
    useStore.getState().setEarthMargin(3); expect(useStore.getState().earthMarginDeg).toBe(3)
  })
})

describe('nearby map labels', () => {
  it('describes offsets in plain words', () => {
    expect(fmtOffset(0, 0)).toBe('the site itself')
    expect(fmtOffset(500, 1000)).toBe('1.0 km N, 500 m E')
    expect(fmtOffset(-250, -2000)).toBe('2.0 km S, 250 m W')
  })
})

describe('playback', () => {
  it('stops at the end of the stay, or starts again at landing when looping', () => {
    const s = useStore.getState()
    s.setReady([Date.UTC(2000, 0, 1), Date.UTC(2040, 0, 1)])
    s.setLanding(Date.UTC(2026, 11, 1)); s.setDays(7); s.setSpeed(168)
    const end = Date.UTC(2026, 11, 8)
    s.setLoop(false); s.setCursor(end - 3600000); s.setPlaying(true)
    useStore.getState().tick(1000)
    expect(useStore.getState().cursorMs).toBe(end); expect(useStore.getState().playing).toBe(false)
    s.setLoop(true); s.setCursor(end - 3600000); s.setPlaying(true)
    useStore.getState().tick(1000)
    expect(useStore.getState().cursorMs).toBe(Date.UTC(2026, 11, 1)); expect(useStore.getState().playing).toBe(true)
    s.setLoop(false); s.setPlaying(false)
  })
})
