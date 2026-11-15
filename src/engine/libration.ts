/**
 * Libration: the slow wobble that makes Earth wander around its average place in the lunar sky.
 *
 * KURO does not add libration as a correction: it is already inside every Earth (and Sun) direction, because the
 * ephemeris gives Earth's position in the Moon's own body-fixed frame (MOON_ME), built from JPL DE421's
 * numerically integrated lunar orientation. That includes
 *   - optical libration (≈ ±7.9° in longitude from the Moon's elliptical orbit, ≈ ±6.7° in latitude from its
 *     tilted axis) — which is most of the effect, and
 *   - physical libration (the Moon's real rotation wobbling, ≈ 0.02–0.04°).
 * This module makes the wobble visible: where the sub-Earth point is, and what a site's Earth numbers would be
 * if Earth sat still at its average place instead (the "without libration" comparison).
 */
import { sampleEphemeris } from './ephemeris'
import { horizonAt, type Horizon, type SiteFrame } from './sky'

const DEG = 180 / Math.PI
const buf = new Float64Array(6)

/** Libration as the point on the Moon directly under Earth: latitude and longitude, degrees; Earth distance, km. */
export interface SubEarth { lat: number; lon: number; distKm: number }

export function subEarthPoint(utcMs: number): SubEarth | null {
  if (!sampleEphemeris(utcMs, buf)) return null
  const x = buf[3], y = buf[4], z = buf[5], d = Math.hypot(x, y, z)
  return { lat: Math.asin(z / d) * DEG, lon: Math.atan2(y, x) * DEG, distKm: d }
}

/**
 * Earth's elevation and azimuth from a site, with Earth's real direction (`real`) or held at its average place
 * over the sub-Earth point (0°, 0°) at its real distance (`fixed`). Same topocentric geometry as computeSky.
 */
function earthFrom(f: SiteFrame, ex: number, ey: number, ez: number) {
  const x = ex - f.p[0], y = ey - f.p[1], z = ez - f.p[2], d = Math.hypot(x, y, z)
  return {
    el: Math.asin((x * f.u[0] + y * f.u[1] + z * f.u[2]) / d) * DEG,
    az: (Math.atan2(x * f.e[0] + y * f.e[1], x * f.n[0] + y * f.n[1] + z * f.n[2]) * DEG + 360) % 360,
  }
}

export interface LibrationStay {
  ok: boolean
  /** Sub-Earth point along the stay (the wobble itself), degrees. */
  lat: Float32Array; lon: Float32Array
  latRange: [number, number]; lonRange: [number, number]
  /** Earth's elevation above the site's terrain horizon, real vs. held still at its average place. */
  realClearRange: [number, number]; fixedClear: [number, number]
  /** Share of the stay with Earth in view (with the antenna margin): real vs. no-libration. */
  realPct: number; fixedPct: number
  n: number
}

/**
 * The wobble over a stay, sampled exactly like a Series (pass the series' start, step and count) so `realPct`
 * equals that series' "Earth in view" to the last digit.
 */
export function librationStay(f: SiteFrame, h: Horizon, startMs: number, step: number, n: number, earthMarginDeg = 0): LibrationStay {
  const lat = new Float32Array(n), lon = new Float32Array(n)
  let latLo = 90, latHi = -90, lonLo = 180, lonHi = -180, rLo = 90, rHi = -90, fLo = 90, fHi = -90, real = 0, fixed = 0, ok = true
  for (let i = 0; i < n; i++) {
    if (!sampleEphemeris(startMs + i * step, buf)) { ok = false; lat[i] = lon[i] = NaN; continue }
    const ex = buf[3], ey = buf[4], ez = buf[5], d = Math.hypot(ex, ey, ez)
    lat[i] = Math.asin(ez / d) * DEG; lon[i] = Math.atan2(ey, ex) * DEG
    latLo = Math.min(latLo, lat[i]); latHi = Math.max(latHi, lat[i]); lonLo = Math.min(lonLo, lon[i]); lonHi = Math.max(lonHi, lon[i])
    const r = earthFrom(f, ex, ey, ez), q = earthFrom(f, d, 0, 0)
    const rc = r.el - horizonAt(h, r.az), qc = q.el - horizonAt(h, q.az)
    rLo = Math.min(rLo, rc); rHi = Math.max(rHi, rc); fLo = Math.min(fLo, qc); fHi = Math.max(fHi, qc)
    if (rc > earthMarginDeg) real++
    if (qc > earthMarginDeg) fixed++
  }
  return { ok, lat, lon, latRange: [latLo, latHi], lonRange: [lonLo, lonHi], realClearRange: [rLo, rHi], fixedClear: [fLo, fHi], realPct: (100 * real) / n, fixedPct: (100 * fixed) / n, n }
}

/** A sentence for a non-specialist on what the wobble does at this site during this stay. */
export function librationWords(L: LibrationStay, days: number): string {
  const diff = L.realPct - L.fixedPct
  const span = L.realClearRange[1] - L.realClearRange[0]
  const head = `Because of the wobble, Earth’s height above this site’s hills changes by ${span.toFixed(1)}° during these ${days} days.`
  if (Math.abs(diff) < 0.5) return `${head} Here it makes no difference to the link: Earth would be in view ${L.realPct.toFixed(0)}% of the time either way.`
  if (L.fixedPct === 0) return `${head} Without it Earth would stay hidden behind the horizon all the time — every minute of contact here (${L.realPct.toFixed(0)}% of the stay) exists only because of libration.`
  if (L.fixedPct >= 99.5 && L.realPct < 99.5) return `${head} Without it Earth would never set; the wobble is what causes the ${(100 - L.realPct).toFixed(0)}% of the stay without contact.`
  return `${head} Ignoring it would put Earth in view ${L.fixedPct.toFixed(0)}% of the time instead of the real ${L.realPct.toFixed(0)}% — a ${Math.abs(diff).toFixed(0)}-point ${diff > 0 ? 'underestimate' : 'overestimate'}.`
}
