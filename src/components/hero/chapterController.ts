// ChapterController — pure timeline math for the scroll story (no DOM).
//
// Scroll progress s (0–1) is remapped to story progress p so each chapter gets scroll
// distance proportional to its reading weight. Within each chapter the choreography is:
//
//   travel → slow down → STOP → LCD update → telemetry settles → bubble scales in
//   → dialogue fades in → read → bubble fades out → RESUME → (next chapter)
//
// Everything is a pure function of p, so scrolling backwards reverses all of it.

import { CHAPTERS, CTA, SEGMENTS, type Telemetry } from './storyScript'

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const ramp = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
export const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const STORY_START = 0.035   // the opening title must clear before chapter 01

export interface Phase {
  stop: number            // rover comes to rest
  tw0: number; tw1: number // telemetry tweens into this chapter's state
  b0: number; b1: number   // speech bubble scales + fades in
  t0: number; t1: number   // dialogue text fades in
  o0: number; o1: number   // bubble fades out
  resume: number | null    // rover sets off again (null: stays put)
}

const LAST = CHAPTERS.length - 1
const IDX_SUNSET = CHAPTERS.findIndex((c) => c.n === '06')   // rover stops for good, sun is gone
const IDX_WARN = CHAPTERS.findIndex((c) => c.n === '04')     // low-power section starts

export const PHASES: Phase[] = CHAPTERS.map((c, i) => {
  const f0 = Math.max(c.from, STORY_START)
  const L = c.to - f0
  const stop = f0 + 0.28 * L
  const last = i === LAST
  const o1 = last ? CTA.from - 0.004 : c.to - 0.08 * L
  return {
    stop,
    tw0: stop + 0.03 * L, tw1: stop + 0.15 * L,
    b0: stop + 0.10 * L, b1: stop + 0.18 * L,
    t0: stop + 0.15 * L, t1: stop + 0.23 * L,
    o0: o1 - 0.08 * L, o1,
    resume: i >= IDX_SUNSET ? null : c.to - 0.07 * L,
  }
})

const SEG_TOTAL = SEGMENTS.reduce((a, s) => a + s.weight, 0)
/** scroll progress → story progress */
export function storyProgress(s: number): number {
  let x = clamp(s) * SEG_TOTAL
  for (const seg of SEGMENTS) {
    if (x <= seg.weight) return seg.from + (seg.to - seg.from) * (x / seg.weight)
    x -= seg.weight
  }
  return 1
}

/** rover drive position 0–1: eased travel between chapter stops, still while stopped */
export function driveAt(p: number): number {
  let prevD = 0
  let start = STORY_START
  for (let i = 0; i < CHAPTERS.length; i++) {
    const ph = PHASES[i], d = CHAPTERS[i].drive
    if (p < ph.stop) return p <= start ? prevD : lerp(prevD, d, smooth(ramp(p, start, ph.stop)))
    if (ph.resume === null) return d
    if (p < ph.resume) return d
    prevD = d; start = ph.resume
  }
  return prevD
}

/** index of the chapter whose window contains p */
export function chapterAt(p: number): number {
  const i = CHAPTERS.findIndex((c) => p < c.to)
  return i === -1 ? LAST : i
}

/** speech bubble envelope (0–1) and dialogue text opacity for the chapter at p */
export function dialogueAt(p: number): { index: number; bubble: number; text: number } {
  const i = chapterAt(p)
  const ph = PHASES[i]
  const out = smooth(ramp(p, ph.o0, ph.o1))
  return {
    index: i,
    bubble: smooth(ramp(p, ph.b0, ph.b1)) * (1 - out),
    text: smooth(ramp(p, ph.t0, ph.t1)) * (1 - out),
  }
}

/** LCD crossfades: yellow when the rover stops in chapter 04, red when it stops in 06 */
export function lcdAt(p: number): { yellow: number; red: number } {
  const y = PHASES[IDX_WARN], r = PHASES[IDX_SUNSET]
  const ly = CHAPTERS[IDX_WARN].to - CHAPTERS[IDX_WARN].from
  const lr = CHAPTERS[IDX_SUNSET].to - CHAPTERS[IDX_SUNSET].from
  return {
    yellow: smooth(ramp(p, y.stop, y.stop + 0.06 * ly)),
    red: smooth(ramp(p, r.stop, r.stop + 0.06 * lr)),
  }
}

/** sun path parameter: rises at the first scroll, gone when the rover stops in chapter 06 */
export const SUNSET_AT = PHASES[IDX_SUNSET].stop
export const sunAt = (p: number) => ramp(p, 0.03, SUNSET_AT)

/** simulated telemetry: numbers tween between chapter states, statuses switch mid-tween */
export function telemetryAt(p: number): Telemetry {
  let state = CHAPTERS[0].telemetry
  for (let i = 1; i < CHAPTERS.length; i++) {
    const ph = PHASES[i]
    if (p < ph.tw0) break
    const next = CHAPTERS[i].telemetry
    const t = smooth(ramp(p, ph.tw0, ph.tw1))
    state = t >= 1 ? next : {
      battery: lerp(state.battery, next.battery, t),
      solar: lerp(state.solar, next.solar, t),
      temp: lerp(state.temp, next.temp, t),
      comm: t < 0.5 ? state.comm : next.comm,
      drive: t < 0.5 ? state.drive : next.drive,
      mode: t < 0.5 ? state.mode : next.mode,
      traction: t < 0.5 ? state.traction : next.traction,
      light: t < 0.5 ? state.light : next.light,
    }
    if (t < 1) break
  }
  return state
}
