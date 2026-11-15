// The one scroll controller for the landing story.
//
// The hero is pinned (position: sticky inside a tall .hv-track). Each frame:
//   scroll → story progress p (chapterController) → scene, rover, telemetry, dialogue.
// Writes are transform / opacity / filter / text on a few elements, batched in one rAF,
// with no React state, so nothing re-renders while scrolling. Every value is a function
// of p, so scrolling back reverses the whole choreography. The lighting is art direction,
// not computed illumination; the telemetry is simulated (see storyScript.ts).

import {
  PHASES, STORY_START, chapterAt, clamp, dialogueAt, driveAt, lcdAt, ramp, smooth,
  storyProgress, sunAt, telemetryAt, SUNSET_AT,
} from './chapterController'
import { ROVER_PTS, createRoverAnimation } from './roverAnimation'
import { CHAPTERS, CTA, SEGMENTS } from './storyScript'
import { bindTelemetry } from './telemetryView'

const HORIZON = 0.61          // horizon height as a fraction of the ground band
const TEXT_IN = 0.03          // chapter text fade-in (story progress)
const TEXT_OUT = 0.025        // chapter text fade-out
const BUBBLE_GAP = 12         // px between the tail tip and the rover

function envelope(p: number, from: number, to: number) {
  const start = Math.max(from, STORY_START)
  const inT = smooth(ramp(p, start, start + TEXT_IN))
  const outT = to >= 1 ? 0 : smooth(ramp(p, to - TEXT_OUT, to))
  return { o: inT * (1 - outT), y: (1 - inT) * 22 - outT * 18 }
}

// chapter 03 crosses the rough ground: extra suspension while driving into it
const ROUGH_FROM = CHAPTERS[1].drive, ROUGH_TO = CHAPTERS[2].drive

export function mountHeroStory(track: HTMLElement): () => void {
  const q = <T extends HTMLElement = HTMLElement>(s: string) => track.querySelector<T>(s)
  const hv = q('.hv')
  const ground = q('.hv-ground')
  const land = q('.hv-land')
  const sun = q('.hv-sun')
  if (!hv || !ground || !land || !sun || !q('.hv-rover')) return () => {}

  const earth = q('.hv-earthwrap')
  const head = q('.hv-head')
  const copy = q('.hv-copy')
  const cue = q('.hv-scroll-pos')
  const sunWarm = q('.hv-sun-warm')
  const chEls = Array.from(track.querySelectorAll<HTMLElement>('.hv-ch'))
  const cta = q('.hv-cta')
  const tel = q('.rtel')
  const dlg = q('.rdlg')
  const dlgText = q('.rdlg-lines')
  const dlgLines = Array.from(track.querySelectorAll<HTMLElement>('.rdlg-line'))
  const dlgCh = q('.rdlg-ch-n')

  const rover = createRoverAnimation(hv)
  const writeTelemetry = tel ? bindTelemetry(tel) : null

  let vw = 0, hvH = 0, horizonY = 0, sunPeak = 0, narrow = false
  let bubbleW = 0, bubbleH = 0
  const measure = () => {
    vw = hv.clientWidth
    hvH = hv.clientHeight
    narrow = vw <= 900
    horizonY = ground.offsetTop + ground.offsetHeight * HORIZON
    // low south-pole arc; flatter on phones so it passes under the speech bubble
    // (raised so the ridges never hide it for long: about twice the old height)
    sunPeak = Math.max(60, Math.min(hvH * (narrow ? 0.13 : 0.26), horizonY - 90))
    rover.measure()
    if (dlg) { bubbleW = dlg.offsetWidth; bubbleH = dlg.offsetHeight }
  }

  let lastLine = -1, side = ''
  let dPrev = -1, motion = 0

  const render = (p: number) => {
    // ---- opening clears on the first scroll ----
    const txt = smooth(ramp(p, 0, 0.05))
    if (head) { head.style.opacity = String(1 - txt); head.style.transform = `translateY(${-txt * 24}px)` }
    if (copy) { copy.style.opacity = String(1 - txt); copy.style.transform = `translateY(${-txt * 24}px)` }
    if (cue) cue.style.opacity = String(1 - ramp(p, 0, 0.03))
    // Earth has set behind the horizon before KURO's first speech bubble appears
    const intro = smooth(ramp(p, 0, 0.09))
    if (earth) {
      earth.style.opacity = String(1 - smooth(narrow ? ramp(p, 0, 0.045) : ramp(p, 0.015, 0.075)))
      earth.style.transform = `translate(-50%, ${intro * hvH * 0.34}px) scale(${1 - intro * 0.1})`
    }

    // ---- sun: rises right, low arc, gone when the rover stops in chapter 06 ----
    const u = sunAt(p)
    const elev = Math.sin(Math.PI * u)
    const sunXn = 0.86 - 0.7 * u
    // height on screen climbs faster than the light (power 0.6), so the Sun clears the ridges soon after rising
    const lift = Math.pow(elev, 0.6)
    sun.style.transform = `translate3d(${sunXn * vw}px, ${horizonY + 26 - lift * sunPeak}px, 0)`
    sun.style.opacity = u > 0 && u < 1 ? '1' : '0'
    if (sunWarm) sunWarm.style.opacity = String(clamp(1 - elev * 2.2))
    const sunLight = clamp(elev * 1.8)
    const night = ramp(p, PHASES[4].o0, SUNSET_AT + 0.03)
    land.style.filter = `brightness(${(0.45 + 0.42 * sunLight - 0.23 * night * (1 - sunLight)).toFixed(3)})`

    // ---- rover: travel / stop choreography; wheels + suspension follow real velocity ----
    const d = driveAt(p)
    const vel = dPrev < 0 ? 0 : Math.abs(d - dPrev)
    dPrev = d
    motion += (clamp(vel * 140) - motion) * 0.2
    if (motion < 0.004) motion = 0
    const rough = smooth(ramp(d, ROUGH_FROM, ROUGH_FROM + 0.05)) * (1 - smooth(ramp(d, ROUGH_TO - 0.04, ROUGH_TO)))
    const lcd = lcdAt(p)
    rover.update({ d, motion, rough, sunLight, night, sunXn, elev, yellow: lcd.yellow, red: lcd.red })

    // ---- chapter text + final CTA ----
    chEls.forEach((el, i) => {
      const c = CHAPTERS[i]
      if (!c) return
      const e = envelope(p, c.from, c.to)
      el.style.opacity = e.o.toFixed(3)
      el.style.transform = `translate3d(0, ${e.y.toFixed(1)}px, 0)`
      el.style.visibility = e.o > 0.001 ? 'visible' : 'hidden'
    })
    if (cta) {
      const o = smooth(ramp(p, CTA.from, CTA.from + 0.025))
      cta.style.opacity = o.toFixed(3)
      cta.style.transform = `translate3d(0, ${((1 - o) * 16).toFixed(1)}px, 0)`
      cta.style.visibility = o > 0.001 ? 'visible' : 'hidden'
      cta.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
    }

    // ---- telemetry (simulated): appears with the story, settles after each stop ----
    if (tel) {
      const o = smooth(ramp(p, STORY_START, STORY_START + 0.03))
      tel.style.opacity = o.toFixed(3)
      tel.style.visibility = o > 0.001 ? 'visible' : 'hidden'
      tel.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
      writeTelemetry?.(telemetryAt(p))
    }

    // ---- speech bubble: scales out of the rover's side after it stops ----
    if (dlg) {
      const dl = dialogueAt(p)
      if (dl.index !== lastLine) {
        dlgLines.forEach((l, i) => l.classList.toggle('is-on', i === dl.index))
        if (dlgCh) dlgCh.textContent = CHAPTERS[dl.index].n
        lastLine = dl.index
        bubbleH = dlg.offsetHeight
      }
      // beside the rover on the opposite side from the chapter text; above it on phones
      const want = narrow ? 'top' : CHAPTERS[chapterAt(p)].side === 'left' ? 'right' : 'left'
      if (want !== side) { dlg.dataset.side = want; side = want; bubbleW = dlg.offsetWidth; bubbleH = dlg.offsetHeight }

      let x: number, y: number
      if (side === 'top') {
        const top = rover.point(ROVER_PTS.top.u, ROVER_PTS.top.v)
        x = top.x - bubbleW / 2
        y = top.y - BUBBLE_GAP - 14 - bubbleH
      } else if (side === 'right') {
        const tip = rover.point(ROVER_PTS.lcdRight.u, ROVER_PTS.lcdRight.v)
        x = tip.x + BUBBLE_GAP
        y = tip.y - BUBBLE_GAP - bubbleH
      } else {
        const tip = rover.point(ROVER_PTS.mastLeft.u, ROVER_PTS.mastLeft.v)
        x = tip.x - BUBBLE_GAP - bubbleW
        y = tip.y - BUBBLE_GAP - bubbleH
      }
      x = clamp(x, 12, vw - 12 - bubbleW)
      const b = dl.bubble
      const slide = (1 - b) * 10
      const dx = side === 'right' ? -slide : side === 'left' ? slide : 0
      const dy = side === 'top' ? slide : slide * 0.4
      dlg.style.transform = `translate3d(${(x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px, 0) scale(${(0.9 + 0.1 * b).toFixed(4)})`
      dlg.style.opacity = b.toFixed(3)
      dlg.style.visibility = b > 0.001 ? 'visible' : 'hidden'
      if (dlgText) dlgText.style.opacity = dl.text.toFixed(3)
    }
  }

  // ---- loop: lerp toward the scroll target; keep running while the rover settles ----
  let target = 0, cur = 0, raf = 0
  const read = () => {
    const total = track.offsetHeight - hv.offsetHeight
    target = total > 0 ? clamp(-track.getBoundingClientRect().top / total) : 0
  }
  const tick = () => {
    cur += (target - cur) * 0.12
    if (Math.abs(target - cur) < 0.0001) cur = target
    render(storyProgress(cur))
    raf = cur !== target || motion > 0 ? requestAnimationFrame(tick) : 0
  }
  const kick = () => { read(); if (!raf) raf = requestAnimationFrame(tick) }
  const onResize = () => { measure(); read(); cur = target; dPrev = -1; render(storyProgress(cur)) }

  measure(); read(); cur = target; render(storyProgress(cur))
  window.addEventListener('scroll', kick, { passive: true })
  window.addEventListener('resize', onResize)
  // images decode after mount; re-measure once they have real sizes
  const onLoad = () => onResize()
  window.addEventListener('load', onLoad)

  // ---- chapter stepping: one scroll gesture = one chapter, at a calm pace ----
  // A fast flick or a long trackpad swipe used to race through several chapters. While the story is pinned,
  // each wheel gesture, arrow / Page / Space key or swipe glides to the next (or previous) reading point.
  // A gesture (a mouse-wheel notch or a whole trackpad swipe with its momentum) moves exactly one chapter;
  // a new gesture made during a glide is queued and runs as soon as the glide ends. Past the last chapter
  // the page scrolls normally again.
  const stops = (() => {
    // story progress where each chapter's text is fully in and comfortable to read
    const ps = [0, ...PHASES.map((ph) => ph.t1 + 0.35 * (ph.o0 - ph.t1)), 1]
    const total = SEGMENTS.reduce((a, g) => a + g.weight, 0)
    // invert storyProgress: story progress → scroll progress
    return ps.map((pv) => {
      let acc = 0
      for (const g of SEGMENTS) {
        if (pv <= g.to) return clamp((acc + g.weight * clamp((pv - g.from) / (g.to - g.from))) / total)
        acc += g.weight
      }
      return 1
    })
  })()
  const GLIDE_MS = 650
  /** Wheel events closer together than this belong to the same gesture (trackpad momentum, a fast spin). */
  const GESTURE_GAP_MS = 180
  let busyUntil = 0, glide = 0, touchY: number | null = null, queued = 0
  let lastWheel = 0, gestureUsed = false, gesturePeak = 0
  const span = () => {
    const top = track.getBoundingClientRect().top + window.scrollY
    return { top, len: Math.max(0, track.offsetHeight - hv.offsetHeight) }
  }
  const pinned = () => { const { len } = span(); return len > hv.offsetHeight * 1.5 }
  /** Is the story on screen and is there a reading point to go to in direction d? */
  const nextStop = (d: number): number | undefined => {
    if (!pinned()) return undefined
    const { top, len } = span(), y = window.scrollY
    if (y < top - 2 || y > top + len + 2) return undefined       // the story is not on screen
    const ys = stops.map((sv) => top + sv * len)
    return d > 0 ? ys.find((v) => v > y + 4) : [...ys].reverse().find((v) => v < y - 4)
  }
  /** Step one chapter in direction d (+1 down, -1 up). Returns false if the page should scroll normally. */
  const step = (d: number): boolean => {
    const now = performance.now()
    if (now < busyUntil) { queued = d; return true }             // gliding: run this step right after
    const to = nextStop(d)
    if (to === undefined) return false                            // past the ends: normal scrolling
    const from = window.scrollY, t0 = now
    const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : GLIDE_MS
    busyUntil = now + dur
    cancelAnimationFrame(glide)
    const run = () => {
      const k = Math.min(1, (performance.now() - t0) / dur)
      const e = 1 - Math.pow(1 - k, 3)                            // ease-out: moves at once, settles softly
      window.scrollTo(0, from + (to - from) * e)
      if (k < 1) { glide = requestAnimationFrame(run); return }
      busyUntil = 0
      if (queued) { const q = queued; queued = 0; step(q) }
    }
    glide = requestAnimationFrame(run)
    return true
  }
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    const now = performance.now(), fresh = now - lastWheel > GESTURE_GAP_MS, mag = Math.abs(e.deltaY)
    lastWheel = now
    if (fresh) { gestureUsed = false; gesturePeak = 0 }
    gesturePeak = Math.max(gesturePeak, mag)
    const d = Math.sign(e.deltaY)
    if (!d) return
    const inStory = now < busyUntil || nextStop(d) !== undefined
    if (!inStory) return                                          // outside the story: normal scrolling
    e.preventDefault()
    if (now < busyUntil) { if (!gestureUsed) { gestureUsed = true; step(d) } return } // fresh scroll mid-glide: queue it
    // Same gesture, glide finished: keep going while the user is still scrolling at full strength (a held
    // spin or a moving finger), but ignore the fading tail of a trackpad flick so it cannot skip chapters.
    if (gestureUsed && mag < 0.6 * gesturePeak) return
    gestureUsed = true
    step(d)
  }
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) && e.key === ' '))) return
    const d = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) ? -1 : 0
    if (d && step(d)) e.preventDefault()
  }
  const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? null }
  const onTouchMove = (e: TouchEvent) => {
    if (touchY === null || !pinned()) return
    const dy = touchY - (e.touches[0]?.clientY ?? touchY)
    // inside the story the stepper moves the page, not the finger (until the last chapter)
    if (performance.now() < busyUntil || (Math.abs(dy) > 2 && nextStop(Math.sign(dy)) !== undefined)) e.preventDefault()
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (touchY === null) return
    const dy = touchY - (e.changedTouches[0]?.clientY ?? touchY)
    touchY = null
    if (Math.abs(dy) > 40) step(Math.sign(dy))
  }
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKey)
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd, { passive: true })

  return () => {
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    cancelAnimationFrame(glide)
    window.removeEventListener('scroll', kick)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('load', onLoad)
    if (raf) cancelAnimationFrame(raf)
  }
}
