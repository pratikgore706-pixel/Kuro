/**
 * Performance tier. "lite" turns down the costly effects so low-end laptops and phones stay smooth:
 * no frosted-glass blur over the 3D view (the browser re-blurs it every frame), one 3D view at a time on
 * Compare instead of four, 30 frames a second and 1 device pixel per CSS pixel in the 3D views.
 *
 * Chosen once at start from the hardware the browser reports, and switched on later by watchFrameRate()
 * if the 3D view still runs slowly. Stored for the session so every page agrees.
 */
const KEY = 'kuro.lite'
type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }

function guessLite(): boolean {
  try {
    const s = sessionStorage.getItem(KEY)
    if (s === '1') return true
    if (s === '0') return false
  } catch { /* storage unavailable */ }
  const n = navigator as Nav
  const cores = n.hardwareConcurrency || 8
  const mem = n.deviceMemory ?? 8
  const touchOnly = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false
  return cores <= 4 || mem <= 4 || !!n.connection?.saveData || (touchOnly && Math.min(screen.width, screen.height) < 500)
}

let lite = typeof window !== 'undefined' ? guessLite() : false
const listeners = new Set<(on: boolean) => void>()

/** Puts the tier on <html class="lite"> so the CSS can drop expensive effects. Call once at start. */
export function applyPerfClass() { document.documentElement.classList.toggle('lite', lite) }
export const isLite = () => lite

export function setLite(on: boolean) {
  if (on === lite) return
  lite = on
  try { sessionStorage.setItem(KEY, on ? '1' : '0') } catch { /* storage unavailable */ }
  applyPerfClass()
  listeners.forEach((f) => f(on))
}
export function onLiteChange(f: (on: boolean) => void) { listeners.add(f); return () => { listeners.delete(f) } }

/**
 * Measures real frame times for a few seconds once a 3D view is up, and switches to lite if the median frame
 * takes longer than ~45 ms (under ~22 fps). Frames while the tab is hidden are ignored.
 */
export function watchFrameRate(delayMs = 4000, sampleMs = 3000): () => void {
  if (lite) return () => {}
  let raf = 0, stopped = false
  const times: number[] = []
  let last = 0, end = 0
  const step = (t: number) => {
    if (stopped) return
    if (document.hidden) { last = 0; raf = requestAnimationFrame(step); return }
    if (last) times.push(t - last)
    last = t
    if (t < end) { raf = requestAnimationFrame(step); return }
    if (times.length >= 20) {
      times.sort((a, b) => a - b)
      if (times[Math.floor(times.length / 2)] > 45) setLite(true)
    }
  }
  const timer = setTimeout(() => { end = performance.now() + sampleMs; raf = requestAnimationFrame(step) }, delayMs)
  return () => { stopped = true; clearTimeout(timer); cancelAnimationFrame(raf) }
}
