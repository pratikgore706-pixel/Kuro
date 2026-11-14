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
import { getMoonData } from '../explorer/moonData'

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

export async function getGeometry(site: { lat: number; lon: number }, startMs: number, endMs: number, stepMinutes = 30): Promise<GeometrySeries> {
  if (usingBackend()) {
    const q = new URLSearchParams({ lat: String(site.lat), lon: String(site.lon), start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), stepMinutes: String(stepMinutes) })
    return http<GeometrySeries>(`/api/geometry?${q}`)
  }
  const h = horizonFor(site, getMoonData())
  const n = Math.floor((endMs - startMs) / (stepMinutes * 60000)) + 1
  const s = computeSeries(makeFrame(site.lat, site.lon), h, startMs, stepMinutes * 60000, n)
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
export async function findWindows(req: MissionRequirements, sites: Site[], onProgress?: (done: number, total: number) => void): Promise<WindowResult[]> {
  if (usingBackend()) return http<WindowResult[]>('/api/mission/windows', { method: 'POST', body: JSON.stringify(req) })
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
    const s = computeSeries(makeFrame(site.lat, site.lon), h, start, stepMs, total)
    const stay = req.stayDays * 24 * per
    const days: DayResult[] = []
    for (let d = 0; d < nDays; d++) {
      const a = d * 24 * per
      const sub = { ...s, n: stay, startMs: start + d * DAY, sunEl: s.sunEl.subarray(a, a + stay), sunAz: s.sunAz.subarray(a, a + stay), sunFrac: s.sunFrac.subarray(a, a + stay), earthEl: s.earthEl.subarray(a, a + stay), earthAz: s.earthAz.subarray(a, a + stay), earthUp: s.earthUp.subarray(a, a + stay) }
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
