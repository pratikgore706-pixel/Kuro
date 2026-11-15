import { create } from 'zustand'
import { GROUPS, SITES, type Site } from './data/sites'
import { DAY, startOfUtcDay } from './engine/time'
import type { MoonData } from './explorer/moonData'
import type { MissionRequirements, WindowResult } from './services/api'

/** Antenna margins offered in the UI: how far above the terrain horizon Earth must be to count as "in view", degrees. */
export const EARTH_MARGINS = [0, 1, 2, 3, 5, 8, 10]

export interface Scenario { id: string; siteId: string; landingMs: number; days: number }

interface State {
  ready: boolean
  /** Real NASA Moon data (colour, LOLA elevation) once loaded; null while loading. */
  moon: MoonData | null
  setMoon: (m: MoonData) => void
  mission: MissionRequirements
  windows: WindowResult[] | null
  setMission: (m: Partial<MissionRequirements>) => void
  setWindows: (w: WindowResult[] | null) => void
  error: string | null
  range: [number, number]
  siteId: string
  /** Landing instant (date and time, to the minute), UTC ms — the start of the stay. */
  landingMs: number
  /** Surface mission length in Earth days. */
  days: number
  /** The instant being inspected, inside the window. */
  cursorMs: number
  playing: boolean
  /** Simulated hours per real second. */
  speed: number
  /** Start the stay again from landing when playback reaches the end. */
  loop: boolean
  setLoop: (l: boolean) => void
  scenarios: Scenario[]
  /**
   * How far Earth's centre must clear the local (terrain) horizon before it counts as "in view", degrees.
   * 0 = pure line of sight; real antennas usually want a few degrees. Applies to every Earth number in the app.
   */
  earthMarginDeg: number
  setEarthMargin: (deg: number) => void
  /** How many of the 78 sites have their terrain skyline ready (the ranking waits for all of them). */
  horizonsReady: number
  setHorizonsReady: (n: number) => void
  setReady: (range: [number, number]) => void
  setError: (e: string) => void
  selectSite: (id: string) => void
  setLanding: (ms: number) => void
  setDays: (d: number) => void
  setCursor: (ms: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  tick: (dtReal: number) => void
  addScenario: (s?: Partial<Scenario>) => void
  updateScenario: (id: string, patch: Partial<Scenario>) => void
  removeScenario: (id: string) => void
}

const today = startOfUtcDay(Date.now())
const roundToMinute = (ms: number) => Math.round(ms / 60000) * 60000
let counter = 0
const uid = () => `s${Date.now().toString(36)}${counter++}`
const KEY = 'kuro.v2' // v2: the 78 candidate sites; v1 stored the old catalogue and custom sites

function restore(): Partial<State> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw)
    const margin = Number(v.earthMarginDeg)
    return { scenarios: Array.isArray(v.scenarios) ? v.scenarios : undefined, mission: v.mission && typeof v.mission === 'object' && Array.isArray(v.mission.siteIds) ? { ...v.mission, siteIds: v.mission.siteIds.filter((id: string) => SITES.some((x) => x.id === id)) } : undefined, earthMarginDeg: isFinite(margin) && margin >= 0 && margin <= 20 ? margin : undefined }
  } catch { return {} }
}
function persist(s: State) {
  try { localStorage.setItem(KEY, JSON.stringify({ scenarios: s.scenarios, mission: s.mission, earthMarginDeg: s.earthMarginDeg })) } catch { /* storage unavailable */ }
}

const saved = restore()

export const useStore = create<State>((set, get) => ({
  ready: false,
  moon: null,
  setMoon: (moon) => set({ moon }),
  mission: saved.mission ?? {
    name: 'South Pole lander', windowStart: new Date(today).toISOString().slice(0, 10), windowEnd: new Date(today + 120 * DAY).toISOString().slice(0, 10),
    stayDays: 14, minSunPct: 60, maxDarkHours: 72, minEarthPct: 50, maxGapHours: 96,
    siteIds: GROUPS.map((g) => SITES.find((x) => x.group === g)!.id), // the first candidate of each of the 9 regions
  },
  windows: null,
  setMission: (m) => { set((s) => ({ mission: { ...s.mission, ...m }, windows: null })); persist(get()) },
  setWindows: (windows) => set({ windows }),
  error: null,
  range: [0, 0],
  siteId: SITES[0].id,
  landingMs: today,
  days: 14,
  cursorMs: Date.now(),
  playing: false,
  speed: 6,
  loop: false,
  setLoop: (loop) => set({ loop }),
  scenarios: saved.scenarios ?? [
    { id: uid(), siteId: 'MMO01', landingMs: today, days: 14 },
    { id: uid(), siteId: 'MMO01', landingMs: today + 14 * DAY, days: 14 },
    { id: uid(), siteId: 'MMA01', landingMs: today, days: 14 },
  ],
  earthMarginDeg: saved.earthMarginDeg ?? 0,
  horizonsReady: 0,
  setHorizonsReady: (horizonsReady) => set({ horizonsReady }),
  setEarthMargin: (deg) => { set({ earthMarginDeg: Math.max(0, Math.min(20, deg)) }); persist(get()) },
  setReady: (range) => set({ ready: true, range }),
  setError: (error) => set({ error }),
  selectSite: (siteId) => set({ siteId }),
  setLanding: (ms) => {
    if (!isFinite(ms)) return
    const [a, b] = get().range
    // keep the time of day (to the minute): "landing at 14:30 UTC" is a different stay from midnight
    const landingMs = Math.min(Math.max(roundToMinute(ms), a), b - get().days * DAY)
    set({ landingMs, cursorMs: landingMs, playing: false })
  },
  setDays: (days) => set((s) => {
    // a longer stay must still end inside the ephemeris table: move the landing earlier if it would not
    const [a, b] = s.range
    const landingMs = b > a ? Math.max(a, Math.min(s.landingMs, b - days * DAY)) : s.landingMs
    const cursorMs = Math.min(Math.max(s.cursorMs, landingMs), landingMs + days * DAY)
    return { days, landingMs, cursorMs }
  }),
  setCursor: (ms) => set((s) => ({ cursorMs: Math.min(Math.max(ms, s.landingMs), s.landingMs + s.days * DAY) })),
  setPlaying: (playing) => set((s) => ({ playing, cursorMs: playing && s.cursorMs >= s.landingMs + s.days * DAY - 1000 ? s.landingMs : s.cursorMs })),
  setSpeed: (speed) => set({ speed }),
  tick: (dtReal) => set((s) => {
    const end = s.landingMs + s.days * DAY
    const next = s.cursorMs + dtReal * s.speed * 3600
    if (next < end) return { cursorMs: next }
    return s.loop ? { cursorMs: s.landingMs } : { cursorMs: end, playing: false }
  }),
  addScenario: (p) => { set((s) => ({ scenarios: [...s.scenarios, { id: uid(), siteId: s.siteId, landingMs: s.landingMs, days: s.days, ...p }].slice(0, 6) })); persist(get()) },
  updateScenario: (id, patch) => { set((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x)) })); persist(get()) },
  removeScenario: (id) => { set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) })); persist(get()) },
}))

export function findSite(id: string): Site {
  return SITES.find((s) => s.id === id) ?? SITES[0]
}
export const useSite = () => useStore((s) => findSite(s.siteId))
