import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Chapter 02 — "The Plan".
 *
 * A pinned (CSS `sticky`) cinematic scene driven by scroll position. A single
 * GSAP timeline is scrubbed against the wrapper's scroll range, so every
 * sub-animation below is just a position on that 0–100 timeline — scrolling
 * backwards runs it in reverse for free.
 *
 * Reuses the exact Chapter 1 assets (hero/earth.png, hero/rover-kit.png,
 * hero/terrain-kit.png) rather than generating new art. The lunar lander has
 * no approved photo yet, so `LanderGlyph` below is a deliberately plain,
 * clearly-labelled placeholder (an artistic reconstruction, not a photograph)
 * — swap it for a real asset the moment one is approved.
 */
export function Chapter02Plan() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const sunRef = useRef<HTMLDivElement>(null)
  const earthRef = useRef<HTMLImageElement>(null)
  const landerRef = useRef<HTMLDivElement>(null)
  const roverRef = useRef<HTMLImageElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const chapterRef = useRef<HTMLParagraphElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const sub1Ref = useRef<HTMLParagraphElement>(null)
  const sub2Ref = useRef<HTMLParagraphElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const vignetteRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const ctx = gsap.context(() => {
      const els = {
        bg: bgRef.current, sun: sunRef.current, earth: earthRef.current,
        lander: landerRef.current, rover: roverRef.current, shadow: shadowRef.current,
        chapter: chapterRef.current, headline: headlineRef.current,
        sub1: sub1Ref.current, sub2: sub2Ref.current,
        timeline: timelineRef.current, fill: fillRef.current, vignette: vignetteRef.current,
      }
      if (Object.values(els).some((el) => !el)) return

      // Starting state, shared by both the animated and reduced-motion paths.
      gsap.set(els.rover, { xPercent: -50, left: '50%', scale: 0.55, y: 0 })
      gsap.set(els.shadow, { xPercent: -50, left: '50%', scale: 0.55, opacity: 0 })
      gsap.set(els.earth, { scale: 1, opacity: 1, y: 0 })
      gsap.set(els.bg, { scale: 1 })
      gsap.set([els.chapter, els.headline, els.sub1, els.sub2, els.timeline, els.lander], { opacity: 0 })
      gsap.set(els.fill, { scaleX: 0, transformOrigin: 'left center' })
      gsap.set(els.sun, { opacity: 0.2, x: 0 })
      gsap.set(els.vignette, { opacity: 0 })

      if (reduced) {
        // No scroll-driven motion: present the chapter already in its resting,
        // fully-told state so the content stays reachable without animation.
        gsap.set(els.rover, { left: '70%', scale: 0.88 })
        gsap.set(els.shadow, { left: '70%', scale: 0.78, opacity: 1 })
        gsap.set(els.earth, { scale: 0.62, opacity: 0.45, y: -40 })
        gsap.set([els.chapter, els.headline, els.sub1, els.sub2, els.timeline, els.lander], { opacity: 1, y: 0 })
        gsap.set(els.fill, { scaleX: 1 })
        gsap.set(els.sun, { opacity: 0.55 })
        return
      }

      const tl = gsap.timeline({ defaults: { ease: 'none' } })

      // Phase A (0–15): camera approach — rover grows, Earth drifts out of focus.
      tl.to(els.bg, { scale: 1.1, duration: 15 }, 0)
        .to(els.earth, { scale: 0.62, opacity: 0.45, y: -40, duration: 15 }, 0)
        .to(els.rover, { scale: 1, duration: 15, ease: 'power1.out' }, 0)
        .to(els.shadow, { opacity: 1, scale: 0.95, duration: 12 }, 0)

      // Phase B (15–30): rover hero moment — held near centre, no major change.

      // Phase C (30–55): the rover drives across the surface to the right.
      tl.to(els.rover, { left: '70%', scale: 0.88, duration: 25, ease: 'power1.inOut' }, 30)
        .to(els.shadow, { left: '70%', scale: 0.78, duration: 25, ease: 'power1.inOut' }, 30)
        .to(els.rover, { y: -4, duration: 25 / 6, repeat: 5, yoyo: true, ease: 'sine.inOut' }, 30)

      // Phase D (45–65): left-side story text reveals as the rover clears the frame.
      tl.to(els.chapter, { opacity: 1, y: 0, duration: 6 }, 45)
        .fromTo(els.headline, { y: 16 }, { opacity: 1, y: 0, duration: 9 }, 49)
        .fromTo(els.sub1, { y: 10 }, { opacity: 1, y: 0, duration: 6 }, 57)
        .fromTo(els.sub2, { y: 10 }, { opacity: 1, y: 0, duration: 6 }, 61)

      // The lunar lander settles into the mid-ground once the rover has moved clear.
      tl.fromTo(els.lander, { y: 12, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 20 }, 60)

      // Phase (75–95): the 10-day timeline illuminates; low sunlight builds.
      tl.to(els.timeline, { opacity: 1, duration: 6 }, 75)
        .to(els.fill, { scaleX: 1, duration: 20, ease: 'power1.inOut' }, 75)
        .to(els.sun, { opacity: 0.55, duration: 20 }, 75)

      // Phase (95–100): bridge into Chapter 3 — the Sun edges toward the horizon, scene dims.
      tl.to(els.sun, { x: -36, opacity: 0.4, duration: 5 }, 95)
        .to(els.vignette, { opacity: 0.4, duration: 5 }, 95)

      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.4,
        animation: tl,
      })
    }, wrapRef)

    return () => ctx.revert()
  }, [])

  return (
    <section className="ch2-wrap" ref={wrapRef} aria-label="Chapter 2 — The Plan">
      <div className="ch2-stage">
        <div
          className="ch2-bg"
          ref={bgRef}
          aria-hidden="true"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}hero/terrain-kit.png)` }}
        />
        <div className="ch2-sun" ref={sunRef} aria-hidden="true" />

        <img className="ch2-earth" ref={earthRef} src={`${import.meta.env.BASE_URL}hero/earth.png`} alt="" aria-hidden="true" />

        <div className="ch2-lander" ref={landerRef} aria-hidden="true">
          <LanderGlyph />
        </div>

        <div className="ch2-rover-shadow" ref={shadowRef} aria-hidden="true" />
        <img className="ch2-rover" ref={roverRef} src={`${import.meta.env.BASE_URL}hero/rover-kit.png`} alt="" aria-hidden="true" />

        <div className="ch2-text">
          <p className="ch2-chapter mono" ref={chapterRef}>Chapter 02 / The Plan</p>
          <h2 className="ch2-headline" ref={headlineRef}>Everything was<br />planned around<br />the Sun.</h2>
          <p className="ch2-sub" ref={sub1Ref}>Athena was designed to operate for approximately ten days.</p>
          <p className="ch2-sub" ref={sub2Ref}>Its solar-powered systems depended on sunlight reaching its panels.</p>
        </div>

        <div className="ch2-timeline" ref={timelineRef}>
          <span className="ch2-timeline-label mono">Expected operational duration</span>
          <div className="ch2-timeline-row">
            <div className="ch2-timeline-track"><div className="ch2-timeline-fill" ref={fillRef} /></div>
            <span className="ch2-timeline-value">10 days</span>
          </div>
          <span className="ch2-timeline-note">Expected duration under suitable landing and operating conditions — not a guarantee.</span>
        </div>

        <div className="ch2-vignette" ref={vignetteRef} aria-hidden="true" />
      </div>
    </section>
  )
}

/** Plain, clearly-artistic lunar lander placeholder — not a photograph of Athena. */
function LanderGlyph() {
  return (
    <svg viewBox="0 0 220 160" width="100%" height="100%" aria-hidden="true">
      <ellipse cx="110" cy="146" rx="74" ry="8" fill="rgba(0,0,0,.55)" />
      {/* legs */}
      <g stroke="#9a9790" strokeWidth="3" strokeLinecap="round">
        <line x1="70" y1="92" x2="40" y2="140" />
        <line x1="150" y1="92" x2="180" y2="140" />
        <line x1="80" y1="100" x2="58" y2="138" />
        <line x1="140" y1="100" x2="162" y2="138" />
      </g>
      <g fill="#c9c6bf" stroke="#86837c" strokeWidth="1">
        <circle cx="40" cy="142" r="5" />
        <circle cx="180" cy="142" r="5" />
      </g>
      {/* solar panels */}
      <g fill="#1c2a3a" stroke="#B5A18A" strokeWidth="1.2">
        <rect x="4" y="66" width="62" height="34" />
        <rect x="154" y="66" width="62" height="34" />
      </g>
      <g stroke="rgba(181,161,138,.5)" strokeWidth="0.6">
        <line x1="4" y1="78" x2="66" y2="78" />
        <line x1="4" y1="90" x2="66" y2="90" />
        <line x1="154" y1="78" x2="216" y2="78" />
        <line x1="154" y1="90" x2="216" y2="90" />
      </g>
      {/* body */}
      <rect x="72" y="58" width="76" height="46" rx="4" fill="#d8d5cc" stroke="#9a9790" strokeWidth="1.5" />
      <rect x="86" y="68" width="22" height="16" fill="#101419" opacity="0.7" />
      <rect x="112" y="68" width="22" height="16" fill="#101419" opacity="0.55" />
      {/* antenna */}
      <line x1="110" y1="58" x2="110" y2="30" stroke="#B5A18A" strokeWidth="2" />
      <circle cx="110" cy="27" r="4" fill="#B5A18A" />
    </svg>
  )
}
