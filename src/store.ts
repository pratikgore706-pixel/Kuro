import { create } from 'zustand'
import { SITES, type Site } from './data/sites'
import { DAY, startOfUtcDay } from './engine/time'
import type { MoonData } from './explorer/moonData'
import type { MissionRequirements, WindowResult } from './services/api'

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
  custom: Site[]
  siteId: string
  /** Start of the mission window (the landing date), UTC ms. */
  landingMs: number
  /** Surface mission length in Earth days. */
  days: number
  /** The instant being inspected, inside the window. */
  cursorMs: number
  playing: boolean
  /** Simulated hours per real second. */
  speed: number
  scenarios: Scenario[]
  setReady: (range: [number, number]) => void
  setError: (e: string) => void
  selectSite: (id: string) => void
  addCustom: (lat: number, lon: number, name?: string) => string
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
let counter = 0
const uid = () => `s${Date.now().toString(36)}${counter++}`
const KEY = 'kuro.v1'

function restore(): Partial<State> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw)
    return { custom: Array.isArray(v.custom) ? v.custom : [], scenarios: Array.isArray(v.scenarios) ? v.scenarios : undefined, mission: v.mission && typeof v.mission === 'object' ? v.mission : undefined }
  } catch { return {} }
}
function persist(s: State) {
  try { localStorage.setItem(KEY, JSON.stringify({ custom: s.custom, scenarios: s.scenarios, mission: s.mission })) } catch { /* storage unavailable */ }
}

const saved = restore()

export const useStore = create<State>((set, get) => ({
  ready: false,
  moon: null,
  setMoon: (moon) => set({ moon }),
  mission: saved.mission ?? {
    name: 'South Pole lander', windowStart: new Date(today).toISOString().slice(0, 10), windowEnd: new Date(today + 120 * DAY).toISOString().slice(0, 10),
    stayDays: 14, minSunPct: 60, maxDarkHours: 72, minEarthPct: 50, maxGapHours: 96,
    siteIds: ['im2', 'mouton', 'malapert', 'nobile', 'haworth', 'gerlache', 'shackleton', 'im1', 'cy3'],
  },
  windows: null,
  setMission: (m) => { set((s) => ({ mission: { ...s.mission, ...m }, windows: null })); persist(get()) },
  setWindows: (windows) => set({ windows }),
  error: null,
  range: [0, 0],
  custom: saved.custom ?? [],
  siteId: 'im2',
  landingMs: today,
  days: 14,
  cursorMs: Date.now(),
  playing: false,
  speed: 6,
  scenarios: saved.scenarios ?? [
    { id: uid(), siteId: 'im2', landingMs: today, days: 14 },
    { id: uid(), siteId: 'im2', landingMs: today + 14 * DAY, days: 14 },
    { id: uid(), siteId: 'malapert', landingMs: today, days: 14 },
  ],
  setReady: (range) => set({ ready: true, range }),
  setError: (error) => set({ error }),
  selectSite: (siteId) => set({ siteId }),
  addCustom: (lat, lon, name) => {
    const id = uid()
    const n = get().custom.length + 1
    const site: Site = { id, name: name?.trim() || `Custom ${n}`, note: 'User-entered coordinates', group: 'Custom', lat, lon, source: 'User input', precision: 'user' }
    set((s) => ({ custom: [...s.custom, site], siteId: id }))
    persist(get())
    return id
  },
  setLanding: (ms) => {
    const [a, b] = get().range
    const landingMs = Math.min(Math.max(startOfUtcDay(ms), a), b - get().days * DAY)
    set({ landingMs, cursorMs: landingMs, playing: false })
  },
  setDays: (days) => set((s) => ({ days, cursorMs: Math.min(s.cursorMs, s.landingMs + days * DAY) })),
  setCursor: (ms) => set((s) => ({ cursorMs: Math.min(Math.max(ms, s.landingMs), s.landingMs + s.days * DAY) })),
  setPlaying: (playing) => set((s) => ({ playing, cursorMs: playing && s.cursorMs >= s.landingMs + s.days * DAY - 1000 ? s.landingMs : s.cursorMs })),
  setSpeed: (speed) => set({ speed }),
  tick: (dtReal) => set((s) => {
    const end = s.landingMs + s.days * DAY
    const next = s.cursorMs + dtReal * s.speed * 3600
    return next >= end ? { cursorMs: end, playing: false } : { cursorMs: next }
  }),
  addScenario: (p) => { set((s) => ({ scenarios: [...s.scenarios, { id: uid(), siteId: s.siteId, landingMs: s.landingMs, days: s.days, ...p }].slice(0, 6) })); persist(get()) },
  updateScenario: (id, patch) => { set((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x)) })); persist(get()) },
  removeScenario: (id) => { set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) })); persist(get()) },
}))

export function findSite(id: string, custom: Site[]): Site {
  return SITES.find((s) => s.id === id) ?? custom.find((s) => s.id === id) ?? SITES[0]
}
export const useSite = () => useStore((s) => findSite(s.siteId, s.custom))
