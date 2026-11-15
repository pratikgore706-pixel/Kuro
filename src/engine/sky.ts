import { summarizeStatuses, type BackendSummary, type Status } from '../services/backendScore'
import { sampleEphemeris } from './ephemeris'
import { equilibriumK, SOLAR_CONSTANT } from './thermal'
import { DAY, HOUR } from './time'

export const R_MOON_KM = 1737.4 // LOLA reference sphere
const AU_KM = 149597870.7
const R_SUN_KM = 695700
const R_EARTH_KM = 6378.137
const DEG = 180 / Math.PI

/** Local east/north/up basis and position (km, MOON_ME) of a point on the reference sphere. */
export interface SiteFrame { p: number[]; e: number[]; n: number[]; u: number[] }

export function makeFrame(latDeg: number, lonDeg: number, heightM = 0): SiteFrame {
  const la = latDeg / DEG, lo = lonDeg / DEG
  const cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo)
  const u = [cl * co, cl * so, sl]
  const r = R_MOON_KM + heightM / 1000
  return { p: [u[0] * r, u[1] * r, u[2] * r], e: [-so, co, 0], n: [-sl * co, -sl * so, cl], u }
}

/**
 * Local horizon. `mask` holds terrain horizon elevation (deg) in equal azimuth bins starting at north,
 * clockwise. Without a mask the horizon is the ideal smooth sphere at 0°.
 */
export interface Horizon { kind: 'sphere' | 'terrain'; mask?: Float32Array; source: string }
export const SPHERE_HORIZON: Horizon = { kind: 'sphere', source: 'Ideal smooth-sphere horizon (0°). Terrain not applied.' }

export function horizonAt(h: Horizon, azDeg: number): number {
  const m = h.mask
  if (!m) return 0
  const x = (((azDeg % 360) + 360) % 360) / 360 * m.length
  const i = Math.floor(x), f = x - i
  return m[i % m.length] * (1 - f) + m[(i + 1) % m.length] * f
}

export interface Sky {
  ok: boolean
  sunAz: number; sunEl: number; sunR: number
  earthAz: number; earthEl: number; earthR: number
  /** Fraction of the solar disc above the local horizon, 0–1. */
  sunFrac: number
  /** Earth's centre above the local horizon (geometric line of sight only). */
  earthUp: boolean
  sunClear: number; earthClear: number
}
export const newSky = (): Sky => ({ ok: false, sunAz: 0, sunEl: 0, sunR: 0.266, earthAz: 0, earthEl: 0, earthR: 0.95, sunFrac: 0, earthUp: false, sunClear: 0, earthClear: 0 })

const buf = new Float64Array(6)

/** Fraction of a disc above a straight horizon; x = (centre elevation − horizon) / angular radius. */
export function discFraction(x: number): number {
  if (x >= 1) return 1
  if (x <= -1) return 0
  return 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI
}

export function computeSky(f: SiteFrame, h: Horizon, utcMs: number, out: Sky, earthMarginDeg = 0): Sky {
  out.ok = sampleEphemeris(utcMs, buf)
  if (!out.ok) return out
  // Topocentric vectors: body − site position (parallax matters for Earth: up to 0.26°).
  let x = buf[0] * AU_KM - f.p[0], y = buf[1] * AU_KM - f.p[1], z = buf[2] * AU_KM - f.p[2]
  let d = Math.hypot(x, y, z)
  out.sunEl = Math.asin((x * f.u[0] + y * f.u[1] + z * f.u[2]) / d) * DEG
  out.sunAz = (Math.atan2(x * f.e[0] + y * f.e[1], x * f.n[0] + y * f.n[1] + z * f.n[2]) * DEG + 360) % 360
  out.sunR = Math.asin(R_SUN_KM / d) * DEG
  x = buf[3] - f.p[0]; y = buf[4] - f.p[1]; z = buf[5] - f.p[2]
  d = Math.hypot(x, y, z)
  out.earthEl = Math.asin((x * f.u[0] + y * f.u[1] + z * f.u[2]) / d) * DEG
  out.earthAz = (Math.atan2(x * f.e[0] + y * f.e[1], x * f.n[0] + y * f.n[1] + z * f.n[2]) * DEG + 360) % 360
  out.earthR = Math.asin(R_EARTH_KM / d) * DEG
  out.sunClear = out.sunEl - horizonAt(h, out.sunAz)
  out.earthClear = out.earthEl - horizonAt(h, out.earthAz)
  out.sunFrac = discFraction(out.sunClear / out.sunR)
  out.earthUp = out.earthClear > earthMarginDeg
  return out
}

/** Moon-centred unit vectors to the Sun and Earth (MOON_ME) — used to light and annotate the 3D scene. */
export function bodyDirections(utcMs: number): { sun: number[]; earth: number[] } | null {
  if (!sampleEphemeris(utcMs, buf)) return null
  const s = Math.hypot(buf[0], buf[1], buf[2]), e = Math.hypot(buf[3], buf[4], buf[5])
  return { sun: [buf[0] / s, buf[1] / s, buf[2] / s], earth: [buf[3] / e, buf[4] / e, buf[5] / e] }
}

export interface Series {
  startMs: number; stepMs: number; n: number
  sunEl: Float32Array; sunAz: Float32Array; sunFrac: Float32Array
  earthEl: Float32Array; earthAz: Float32Array; earthUp: Uint8Array
  /** 1 when the centre of the Sun clears the horizon — the KURO backend's VISIBLE test for the Sun. */
  sunVis: Uint8Array
  /** False if any sample fell outside the ephemeris table. */
  complete: boolean
}

export function computeSeries(f: SiteFrame, h: Horizon, startMs: number, stepMs: number, n: number, earthMarginDeg = 0): Series {
  const s: Series = { startMs, stepMs, n, sunEl: new Float32Array(n), sunAz: new Float32Array(n), sunFrac: new Float32Array(n), earthEl: new Float32Array(n), earthAz: new Float32Array(n), earthUp: new Uint8Array(n), sunVis: new Uint8Array(n), complete: true }
  const k = newSky()
  for (let i = 0; i < n; i++) {
    computeSky(f, h, startMs + i * stepMs, k, earthMarginDeg)
    if (!k.ok) { s.complete = false; s.sunEl[i] = s.earthEl[i] = NaN; continue }
    s.sunEl[i] = k.sunEl; s.sunAz[i] = k.sunAz; s.sunFrac[i] = k.sunFrac
    s.earthEl[i] = k.earthEl; s.earthAz[i] = k.earthAz; s.earthUp[i] = k.earthUp ? 1 : 0
    s.sunVis[i] = k.sunClear > 0 ? 1 : 0
  }
  return s
}

export interface Summary {
  /** Mean fraction of the solar disc visible — a proxy for power from a Sun-tracking array. */
  sunPct: number
  /** Share of time any part of the Sun is visible. */
  sunAnyPct: number
  peakSunEl: number
  longestDarkH: number
  earthPct: number
  longestOutageH: number
  commWindows: number
  /** Share of time with both sunlight and line of sight to Earth. */
  bothPct: number
  /**
   * Warmest level ground during the stay, kelvin — radiative-balance estimate at the moment of most sunlight
   * (see engine/thermal.ts). 0 when the site never sees the Sun.
   */
  peakGroundK: number
  /** The same stay as the KURO backend's mission analysis sees it (Sun centre visible / Earth visible per sample). */
  backend: BackendSummary
}

/** The backend's per-sample classification of a series: incomplete samples (outside the table) are UNCERTAIN. */
export function seriesStatuses(s: Series): { sun: Status[]; earth: Status[] } {
  const sun: Status[] = new Array(s.n), earth: Status[] = new Array(s.n)
  for (let i = 0; i < s.n; i++) {
    const ok = !isNaN(s.sunEl[i])
    sun[i] = ok ? (s.sunVis[i] ? 'V' : 'B') : 'U'
    earth[i] = ok ? (s.earthUp[i] ? 'V' : 'B') : 'U'
  }
  return { sun, earth }
}

export function summarize(s: Series): Summary {
  let sun = 0, any = 0, earth = 0, both = 0, peak = -90, dark = 0, maxDark = 0, out = 0, maxOut = 0, windows = 0, prevUp = 0, maxGround = 0
  for (let i = 0; i < s.n; i++) {
    const fr = s.sunFrac[i], up = s.earthUp[i]
    sun += fr; if (fr > 0) any++; earth += up; if (fr > 0 && up) both++
    if (s.sunEl[i] > peak) peak = s.sunEl[i]
    if (fr > 0 && s.sunEl[i] > 0) { const g = fr * Math.sin(s.sunEl[i] / DEG); if (g > maxGround) maxGround = g }
    if (fr > 0) dark = 0; else { dark++; if (dark > maxDark) maxDark = dark }
    if (up) out = 0; else { out++; if (out > maxOut) maxOut = out }
    if (up && !prevUp) windows++
    prevUp = up
  }
  const hStep = s.stepMs / HOUR
  // n samples span (n − 1) steps: a run can't be longer than the stay itself
  const spanH = Math.max(0, s.n - 1) * hStep
  maxDark = Math.min(maxDark, Math.ceil(spanH / hStep)); maxOut = Math.min(maxOut, Math.ceil(spanH / hStep))
  const st = seriesStatuses(s)
  return { sunPct: (100 * sun) / s.n, sunAnyPct: (100 * any) / s.n, peakSunEl: peak, longestDarkH: Math.min(maxDark * hStep, spanH), earthPct: (100 * earth) / s.n, longestOutageH: Math.min(maxOut * hStep, spanH), commWindows: windows, bothPct: (100 * both) / s.n, peakGroundK: equilibriumK(SOLAR_CONSTANT * maxGround), backend: summarizeStatuses(st.sun, st.earth, s.stepMs / 1000) }
}

export interface SkyEvent { ms: number; type: 'rise' | 'set' }

/**
 * Next change of visibility after `fromMs`: for the Sun, the instant its last sliver disappears (set) or
 * first appears (rise); for Earth, its centre crossing the horizon (+ margin). Null if nothing changes
 * within `maxDays` — e.g. Earth never sets for most near-side sites.
 */
export function nextEvent(f: SiteFrame, h: Horizon, fromMs: number, body: 'sun' | 'earth', maxDays = 60, earthMarginDeg = 0): SkyEvent | null {
  const k = newSky()
  const state = (ms: number): boolean | null => {
    computeSky(f, h, ms, k, earthMarginDeg)
    return k.ok ? (body === 'sun' ? k.sunFrac > 0 : k.earthUp) : null
  }
  const s0 = state(fromMs)
  if (s0 === null) return null
  const step = HOUR / 2
  for (let t = fromMs + step; t <= fromMs + maxDays * DAY; t += step) {
    const s = state(t)
    if (s === null) return null
    if (s !== s0) {
      let lo = t - step, hi = t
      while (hi - lo > 1000) { const mid = (lo + hi) / 2; if (state(mid) === s0) lo = mid; else hi = mid }
      return { ms: hi, type: s0 ? 'set' : 'rise' }
    }
  }
  return null
}

/**
 * A cached next-event answer, valid for the instant `ms`: if the cached event is already at or behind `ms`, the
 * next event is searched again from `ms` itself.
 */
export function freshEvent(ev: SkyEvent | null, f: SiteFrame, h: Horizon, ms: number, body: 'sun' | 'earth', earthMarginDeg = 0): SkyEvent | null {
  const margin = body === 'earth' ? earthMarginDeg : 0
  if (!ev) return ev
  if (ev.ms > ms) {
    // still ahead — but make sure the sky at `ms` is in the state the event leaves (a set needs the body up now)
    const k = computeSky(f, h, ms, newSky(), margin)
    if (!k.ok) return null
    const up = body === 'sun' ? k.sunFrac > 0 : k.earthUp
    if (up === (ev.type === 'set')) return ev
  }
  return nextEvent(f, h, ms, body, 60, margin)
}
