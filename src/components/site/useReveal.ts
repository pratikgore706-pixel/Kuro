import { useEffect, type RefObject } from 'react'

/**
 * Fades `.reveal` elements in as they scroll into view (instantly with reduced motion).
 * Anything that has reached the screen or gone past it is revealed, so a fast scroll, a jump
 * or a reload half-way down the page never leaves a section invisible.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = Array.from(el.querySelectorAll<HTMLElement>('.reveal'))
    const show = (i: Element) => i.classList.add('is-in')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach(show)
      return
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting || e.boundingClientRect.top < 0) { show(e.target); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    items.forEach((i) => io.observe(i))
    // backstop for jumps the observer never sees: reveal everything whose top is above the bottom of the screen
    let raf = 0
    const sweep = () => {
      raf = 0
      const limit = window.innerHeight * 0.96
      for (const i of items) if (!i.classList.contains('is-in') && i.getBoundingClientRect().top < limit) { show(i); io.unobserve(i) }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sweep) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    sweep()
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [root])
}
