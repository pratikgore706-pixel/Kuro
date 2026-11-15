import { useEffect, useMemo, useRef, useState } from 'react'
import type { Site } from './data/sites'
import { computeSeries, computeSky, freshEvent, makeFrame, newSky, nextEvent, SPHERE_HORIZON, summarize, type Horizon } from './engine/sky'
import { DAY } from './engine/time'
import { computeHorizon, makeSampler, type MoonData } from './explorer/moonData'
import { storedHorizon } from './data/siteHorizons'
import { useStore } from './store'

const horizonCache = new Map<string, Horizon>()

/**
 * Horizon model for a site: the real LOLA terrain skyline when elevation data is installed, otherwise the
 * ideal smooth sphere. Cached per coordinate.
 */
export function horizonFor(site: { lat: number; lon: number }, data: MoonData | null): Horizon {
  const s = data ? makeSampler(data) : null
  if (!s) return SPHERE_HORIZON
  const key = `${site.lat.toFixed(5)},${site.lon.toFixed(5)}`
  let h = horizonCache.get(key)
  if (!h) {
    // the 78 candidate sites come pre-traced (identical values, see data/siteHorizons.ts); anything else is traced live
    const mask = storedHorizon(site.lat, site.lon, data) ?? computeHorizon(s, site.lat, site.lon)
    h = { kind: 'terrain', mask, source: `Terrain horizon from ${s.describe(site.lat)}, observer 2 m above ground, out to 300 km.` }
    horizonCache.set(key, h)
  }
  return h
}

export function useHorizon(site: Site): Horizon {
  const data = useStore((s) => s.moon)
  return useMemo(() => horizonFor(site, data), [site.lat, site.lon, data])
}

export const useFrame = (site: Site) => useMemo(() => makeFrame(site.lat, site.lon), [site.lat, site.lon])

/** The antenna margin every Earth-visibility number uses (degrees above the terrain horizon). */
export const useEarthMargin = () => useStore((s) => s.earthMarginDeg)

export function useSeries(site: Site, landingMs: number, days: number, samples = 960) {
  const f = useFrame(site), h = useHorizon(site), margin = useEarthMargin()
  return useMemo(() => {
    const n = Math.max(120, Math.min(samples, Math.round(days * 96)))
    const series = computeSeries(f, h, landingMs, (days * DAY) / (n - 1), n, margin)
    return { series, summary: summarize(series) }
  }, [f, h, landingMs, days, samples, margin])
}

export function useSkyAt(site: Site, ms: number) {
  const f = useFrame(site), h = useHorizon(site), margin = useEarthMargin()
  return useMemo(() => computeSky(f, h, ms, newSky(), margin), [f, h, ms, margin])
}

/** Next Sun / Earth visibility change. Recomputed at most once per simulated 10 minutes. */
export function useEvents(site: Site, ms: number) {
  const f = useFrame(site), h = useHorizon(site), margin = useEarthMargin()
  const bucket = Math.floor(ms / 600000)
  const base = useMemo(() => ({ sun: nextEvent(f, h, bucket * 600000, 'sun'), earth: nextEvent(f, h, bucket * 600000, 'earth', 60, margin) }), [f, h, bucket, margin])
  // an event inside the current 10-minute block may already be behind the cursor: then look again from the cursor,
  // so the countdown never disagrees with the sky the panel shows
  return useMemo(() => ({ sun: freshEvent(base.sun, f, h, ms, 'sun', margin), earth: freshEvent(base.earth, f, h, ms, 'earth', margin) }), [base, f, h, ms, margin])
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, set] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => set({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Trace the terrain skyline of every candidate site in the background, a few per frame, so the page never freezes
 * (about 35 ms each, ~2.7 s for all 78). Progress goes to the store; safe to call more than once.
 */
let warming: MoonData | null | undefined
export function warmHorizons(sites: { lat: number; lon: number }[], data: MoonData | null) {
  const setReady = useStore.getState().setHorizonsReady
  if (!data || !makeSampler(data)) { setReady(sites.length); return } // smooth sphere: nothing to trace
  if (warming === data) return
  warming = data
  let i = 0
  const step = () => {
    if (warming !== data) return
    const t0 = performance.now()
    while (i < sites.length && performance.now() - t0 < 24) horizonFor(sites[i++], data)
    setReady(i)
    if (i < sites.length) setTimeout(step, 0)
  }
  setReady(0)
  setTimeout(step, 0)
}
