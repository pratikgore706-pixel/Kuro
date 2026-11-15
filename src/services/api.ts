/**
 * KURO data access. Every page goes through these functions, never fetch() directly, so the app can move from
 * its built-in engine to the KURO scientific backend by setting one variable:
 *
 *   VITE_API_BASE=https://api.example.org   npm run dev
 *
 * Unset → everything is computed in the browser from the bundled DE421 table and the installed LOLA files.
 * Set   → the same functions call the REST endpoints below and expect the documented JSON shapes.
 * Endpoint shapes follow the product spec (doc 2, §17) and are a contract for the backend team, not existing services.
 */
import { SITES, type Site } from '../data/sites'
import { computeSeries, makeFrame, summarize, type Summary } from '../engine/sky'
import { DAY, HOUR } from '../engine/time'
import { horizonFor } from '../hooks'
import { estimateSlopeDeg, getMoonData, makeSampler } from '../explorer/moonData'
import { BACKEND_RANKING_WEIGHTS, scoreBackend } from './backendScore'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
export const usingBackend = () => API_BASE !== ''
export const dataSourceLabel = () => (usingBackend() ? `KURO backend at ${API_BASE}` : 'Computed in your browser (JPL DE421 + NASA LOLA)')

// ---------- contracts ----------

/** GET /api/candidates → Candidate[] */
export interface Candidate {
  id: string; name: string; note: string; group: Site['group']
  lat: number; lon: number; source: string; precision: Site['precision']
  eventUtc?: string
}

/** POST /api/mission/windows → WindowResult[] */
export interface MissionRequirements {
  name: string
  /** First and last landing dates to consider, ISO date (UTC). */
  windowStart: string; windowEnd: string
  stayDays: number
  minSunPct: number
  maxDarkHours: number
  minEarthPct: number
  maxGapHours: number
  siteIds: string[]
}
export type Check = 'sun' | 'dark' | 'earth' | 'gap'
export interface DayResult { date: string; ok: boolean; failed: Check[]; metrics: Pick<Summary, 'sunPct' | 'longestDarkH' | 'earthPct' | 'longestOutageH'> }
export interface WindowResult {
  siteId: string
  days: DayResult[]
  /** Number of landing dates that meet every requirement. */
  passCount: number
  /** Longest run of consecutive passing landing dates: first date and length in days. */
  bestRun: { start: string; days: number } | null
  horizon: 'terrain' | 'sphere'
}

/** GET /api/geometry?lat&lon&start&end&stepMinutes → GeometrySeries */
export interface GeometrySeries {
  start: string; stepMinutes: number
  sunEl: number[]; sunAz: number[]; sunVisibleFraction: number[]
  earthEl: number[]; earthAz: number[]; earthVisible: boolean[]
  horizon: 'terrain' | 'sphere'; source: string
}

/** POST /api/reports → { url } (backend) — locally the Reports page builds the file itself. */
export interface ReportRequest { mission: MissionRequirements | null; scenarios: { siteId: string; landingUtc: string; days: number }[] }

// ---------- helpers ----------

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!r.ok) throw new Error(`Backend replied ${r.status} for ${path}`)
  return (await r.json()) as T
}
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// ---------- API ----------

export async function getCandidates(): Promise<Site[]> {
  if (!usingBackend()) return SITES
  const list = await http<Candidate[]>('/api/candidates')
  return list.map((c) => ({ ...c, eventMs: c.eventUtc ? Date.parse(c.eventUtc) : undefined }))
}

export async function getGeometry(site: { lat: number; lon: number }, startMs: number, endMs: number, stepMinutes = 30, earthMarginDeg = 0): Promise<GeometrySeries> {
  if (usingBackend()) {
    const q = new URLSearchParams({ lat: String(site.lat), lon: String(site.lon), start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), stepMinutes: String(stepMinutes) })
    return http<GeometrySeries>(`/api/geometry?${q}`)
  }
  const h = horizonFor(site, getMoonData())
  const n = Math.floor((endMs - startMs) / (stepMinutes * 60000)) + 1
  const s = computeSeries(makeFrame(site.lat, site.lon), h, startMs, stepMinutes * 60000, n, earthMarginDeg)
  return {
    start: new Date(startMs).toISOString(), stepMinutes,
    sunEl: [...s.sunEl], sunAz: [...s.sunAz], sunVisibleFraction: [...s.sunFrac],
    earthEl: [...s.earthEl], earthAz: [...s.earthAz], earthVisible: [...s.earthUp].map(Boolean),
    horizon: h.kind, source: h.source,
  }
}

/**
 * For every site and every landing date in the window: does a stay starting that day meet the requirements?
 * Pass / fail against the user's own thresholds — no scores, no weighting.
 */
export async function findWindows(req: MissionRequirements, sites: Site[], onProgress?: (done: number, total: number) => void, earthMarginDeg = 0): Promise<WindowResult[]> {
  if (usingBackend()) return http<WindowResult[]>('/api/mission/windows', { method: 'POST', body: JSON.stringify({ ...req, earthMarginDeg }) })
  const start = Date.parse(req.windowStart + 'T00:00:00Z'), end = Date.parse(req.windowEnd + 'T00:00:00Z')
  const nDays = Math.max(1, Math.round((end - start) / DAY) + 1)
  const out: WindowResult[] = []
  const chosen = sites.filter((s) => req.siteIds.includes(s.id))
  for (let k = 0; k < chosen.length; k++) {
    const site = chosen[k]
    const h = horizonFor(site, getMoonData())
    const per = 4 // samples per hour
    const stepMs = HOUR / per
    const total = (nDays + req.stayDays) * 24 * per
    const s = computeSeries(makeFrame(site.lat, site.lon), h, start, stepMs, total, earthMarginDeg)
    const stay = req.stayDays * 24 * per
    const days: DayResult[] = []
    for (let d = 0; d < nDays; d++) {
      const a = d * 24 * per
      const sub = { ...s, n: stay, startMs: start + d * DAY, sunEl: s.sunEl.subarray(a, a + stay), sunAz: s.sunAz.subarray(a, a + stay), sunFrac: s.sunFrac.subarray(a, a + stay), earthEl: s.earthEl.subarray(a, a + stay), earthAz: s.earthAz.subarray(a, a + stay), earthUp: s.earthUp.subarray(a, a + stay), sunVis: s.sunVis.subarray(a, a + stay) }
      const m = summarize(sub)
      const failed: Check[] = []
      if (m.sunPct < req.minSunPct) failed.push('sun')
      if (m.longestDarkH > req.maxDarkHours) failed.push('dark')
      if (m.earthPct < req.minEarthPct) failed.push('earth')
      if (m.longestOutageH > req.maxGapHours) failed.push('gap')
      days.push({ date: isoDate(start + d * DAY), ok: !failed.length, failed, metrics: { sunPct: m.sunPct, longestDarkH: m.longestDarkH, earthPct: m.earthPct, longestOutageH: m.longestOutageH } })
    }
    let best: WindowResult['bestRun'] = null, run = 0
    days.forEach((d, i) => {
      run = d.ok ? run + 1 : 0
      if (run && (!best || run > best.days)) best = { start: days[i - run + 1].date, days: run }
    })
    out.push({ siteId: site.id, days, passCount: days.filter((d) => d.ok).length, bestRun: best, horizon: h.kind })
    onProgress?.(k + 1, chosen.length)
    await new Promise((r) => setTimeout(r, 0)) // keep the page responsive between sites
  }
  return out
}

// ---------- ranking (one stay, scored and ordered — not pass/fail like findWindows above) ----------

export interface ComponentScores { terrain: number | null; safety: number | null; illumination: number | null; communication: number | null; mission: number | null }
export interface SiteScore {
  /** 0–100, higher is better; null if no component had data. The backend's score, or 0 when a blocker applies. */
  score: number | null
  /** The KURO backend's own overall score for this stay, before KURO's blocker rule. */
  backendScore: number | null
  /**
   * KURO's one rule on top of the backend formula, for a solar-powered lander that talks directly to Earth: no
   * sunlight at all, or Earth never in view, during the stay. Either sets the score to 0 however good the rest is.
   */
  blockers: string[]
  /** Share of the backend's full input set that was available, 0–100 (roughness and a hazard map are not, yet). */
  completenessPct: number
  componentScores: ComponentScores
  /** Each category's own data completeness, 0–100, as the backend reports it. */
  componentCompleteness: ComponentScores
}
export interface RankedSite extends SiteScore { siteId: string; site: Site; summary: Summary; slopeDeg: number | null }

/** Only south-polar sites are ranked: that is where the slope comes from the 80–320 m polar DEM. */
export const RANKING_MAX_LAT = -80

/** The KURO backend's five categories and weights (engines/recommendation/ranking_engine.py). */
export const RANKING_WEIGHTS = BACKEND_RANKING_WEIGHTS
export const RANKING_LABELS: Record<keyof ComponentScores, string> = { terrain: 'Flat ground', safety: 'Safety', illumination: 'Sunlight', communication: 'Earth link', mission: 'Sun + Earth' }

/**
 * Score one stay with the KURO backend's recommendation engine, ported exactly (services/backendScore.ts; checked
 * against the real Python in backendScore.test.ts). The backend reads its Sun test as "centre of the Sun above
 * the hills" and its Earth test as "centre of Earth above the hills" (plus the antenna margin here), sample by
 * sample. Roughness is left out because it needs 20–40 m terrain and KURO has 80 m; the backend drops a missing
 * input and scales that category down, and so does this. On top, KURO's blocker rule: no sunlight at all or Earth
 * never in view → 0.
 */
export function scoreStay(summary: Summary, slopeDeg: number | null): SiteScore {
  const r = scoreBackend({ slopeDeg, roughnessM: null, summary: summary.backend })
  const blockers: string[] = []
  if (!(summary.sunAnyPct > 0)) blockers.push('no sunlight')
  if (!(summary.earthPct > 0)) blockers.push('Earth never in view')
  const c = r.components
  return {
    score: r.overall === null ? null : blockers.length ? 0 : r.overall,
    backendScore: r.overall,
    blockers,
    completenessPct: r.dataCoverage,
    componentScores: { terrain: c.terrain.score, safety: c.safety.score, illumination: c.illumination.score, communication: c.communication.score, mission: c.mission.score },
    componentCompleteness: { terrain: c.terrain.completeness, safety: c.safety.completeness, illumination: c.illumination.completeness, communication: c.communication.completeness, mission: c.mission.completeness },
  }
}

/**
 * Local slope at a site from the installed LOLA elevation, or null without it. Only south of 80°S, where the
 * polar DEM resolves lander-sized slopes (80–320 m); the 3.8 km global grid would flatten every slope to ~0°.
 */
export function slopeAt(site: { lat: number; lon: number }): number | null {
  if (site.lat > RANKING_MAX_LAT) return null
  const moon = getMoonData()
  const sampler = moon ? makeSampler(moon) : null
  const v = sampler ? estimateSlopeDeg(sampler, site.lat, site.lon) : NaN
  return isFinite(v) ? v : null
}

/**
 * Score and rank candidate sites for ONE landing date + stay — the complement to findWindows, which scans many
 * dates pass/fail against user thresholds. Always computed in the browser from the bundled ephemeris and the
 * installed LOLA tiles, whatever VITE_API_BASE says, with the backend's own scoring formula (see scoreStay).
 */
/** Samples used for one stay everywhere in KURO: about one every 15 minutes, between 120 and 960. */
export const stayStepCount = (days: number) => Math.max(120, Math.min(960, Math.round(days * 96)))

export function rankSites(sites: Site[], landingMs: number, days: number, earthMarginDeg = 0): RankedSite[] {
  const moon = getMoonData()
  // the same samples as the Explorer site panel and Compare (useSeries): every number matches across the app
  const n = stayStepCount(days), stepMs = (days * DAY) / (n - 1)
  return sites.map((site) => {
    const series = computeSeries(makeFrame(site.lat, site.lon), horizonFor(site, moon), landingMs, stepMs, n, earthMarginDeg)
    const summary = summarize(series)
    const slopeDeg = slopeAt(site)
    const none: ComponentScores = { terrain: null, safety: null, illumination: null, communication: null, mission: null }
    const sc: SiteScore = series.complete ? scoreStay(summary, slopeDeg) : { score: null, backendScore: null, blockers: [], completenessPct: 0, componentScores: none, componentCompleteness: none }
    return { siteId: site.id, site, summary, slopeDeg, ...sc }
  }).sort((a, b) => {
    // the backend's order (scored first, then score, then completeness), with KURO's blockers already applied
    if ((a.score !== null) !== (b.score !== null)) return a.score !== null ? -1 : 1
    return (b.score ?? -1) - (a.score ?? -1) || (b.backendScore ?? -1) - (a.backendScore ?? -1) || b.completenessPct - a.completenessPct
  })
}
