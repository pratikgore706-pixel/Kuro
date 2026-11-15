import ref from '../data/horizons-reference.json'
import { computeSky, makeFrame, newSky, SPHERE_HORIZON } from './sky'

/**
 * Cross-check against NASA/JPL Horizons. The reference file holds Horizons' own airless apparent azimuth and
 * elevation of the Sun and Earth, fetched from the Horizons API (DE441, MEAN_ME frame) for ten sites every 61 hours
 * from 14 Nov 2026 to 13 May 2027. This recomputes the same 1,440 directions with KURO's engine and reports the
 * differences, so anyone can see — and the test suite enforces — how closely KURO agrees with JPL.
 */
export interface CheckRow { id: string; lat: number; lon: number; n: number; sunMaxEl: number; earthMaxEl: number; maxSep: number; rmsSep: number }
export interface CheckResult { rows: CheckRow[]; worstEl: number; worstSep: number; total: number; source: string; fetched: string; span: string }

const D = Math.PI / 180
/** Angle between two (az, el) directions, degrees. */
function sep(az1: number, el1: number, az2: number, el2: number) {
  const c = Math.sin(el1 * D) * Math.sin(el2 * D) + Math.cos(el1 * D) * Math.cos(el2 * D) * Math.cos((az1 - az2) * D)
  return Math.acos(Math.max(-1, Math.min(1, c))) / D
}

export function checkAgainstHorizons(): CheckResult {
  const start = Date.parse(ref.startUtc), step = ref.stepHours * 3600000
  const rows: CheckRow[] = []
  const k = newSky()
  let total = 0
  for (const [id, s] of Object.entries(ref.sites)) {
    const f = makeFrame(s.lat, s.lon)
    let sunMaxEl = 0, earthMaxEl = 0, maxSep = 0, sumSq = 0, n = 0
    for (let i = 0; i < ref.n; i++) {
      computeSky(f, SPHERE_HORIZON, start + i * step, k)
      if (!k.ok) continue
      const [sa, se] = s.sun[i], [ea, ee] = s.earth[i]
      sunMaxEl = Math.max(sunMaxEl, Math.abs(k.sunEl - se))
      earthMaxEl = Math.max(earthMaxEl, Math.abs(k.earthEl - ee))
      for (const d of [sep(k.sunAz, k.sunEl, sa, se), sep(k.earthAz, k.earthEl, ea, ee)]) { maxSep = Math.max(maxSep, d); sumSq += d * d; n++ }
    }
    total += n
    rows.push({ id, lat: s.lat, lon: s.lon, n, sunMaxEl, earthMaxEl, maxSep, rmsSep: Math.sqrt(sumSq / Math.max(n, 1)) })
  }
  return {
    rows, total,
    worstEl: Math.max(...rows.map((r) => Math.max(r.sunMaxEl, r.earthMaxEl))),
    worstSep: Math.max(...rows.map((r) => r.maxSep)),
    source: ref.source, fetched: ref.fetched, span: `${ref.startUtc.slice(0, 10)} to ${ref.lastTime}`,
  }
}
