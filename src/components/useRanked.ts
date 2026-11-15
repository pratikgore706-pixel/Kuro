import { SITES } from '../data/sites'
import { useEarthMargin } from '../hooks'
import { rankSites, type RankedSite } from '../services/api'
import { useStore } from '../store'

// one ranking per landing, stay, antenna margin and terrain, shared by every part of the page that shows it
let cache: { key: string; moon: unknown; ranked: RankedSite[] } | null = null

/**
 * The 78 candidate sites ranked for the chosen landing and stay, best first, or null while the terrain
 * skylines are still being traced (see warmHorizons). The welcome dialog, the left panel, the site details
 * and the rover tour captions all read this one list, so their ranks always agree.
 */
export function useRanked(): RankedSite[] | null {
  const landingMs = useStore((s) => s.landingMs)
  const days = useStore((s) => s.days)
  const moon = useStore((s) => s.moon)
  const ready = useStore((s) => s.horizonsReady) >= SITES.length
  const margin = useEarthMargin()
  if (!ready) return null
  const key = `${landingMs}|${days}|${margin}`
  if (!cache || cache.key !== key || cache.moon !== moon) cache = { key, moon, ranked: rankSites(SITES, landingMs, days, margin) }
  return cache.ranked
}
