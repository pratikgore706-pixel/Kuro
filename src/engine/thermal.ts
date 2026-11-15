/**
 * Heat and light at a site — a first, honest estimate, not a thermal model.
 *
 * Sunlight on a surface: the solar constant scaled by the inverse square of the Sun's distance (read from its
 * apparent size), times the fraction of the solar disc above the local horizon, times the cosine of the angle of
 * incidence. Temperature: radiative balance — absorbed sunlight equals heat radiated away,
 * (1 − A)·q = ε·σ·T⁴ — with the lunar surface's Bond albedo and infrared emissivity.
 *
 * What it leaves out, on purpose: heat stored in the regolith (it makes the ground cool gradually after
 * sunset instead of instantly), albedo rising at grazing light, sunlight and heat bounced off nearby crater
 * walls, and the lander's own materials. In shadow the balance has nothing to work with, so KURO quotes the
 * temperatures LRO's Diviner radiometer measures there instead of inventing a number.
 */

/** Total solar irradiance at 1 AU, W/m² (Kopp & Lean 2011). */
export const SOLAR_CONSTANT = 1361
/** Bond albedo of the lunar surface at normal incidence (Vasavada et al. 2012, Diviner). */
export const BOND_ALBEDO = 0.12
/** Broadband infrared emissivity of lunar regolith (Vasavada et al. 2012). */
export const EMISSIVITY = 0.95
const SIGMA = 5.670374419e-8
const DEG = Math.PI / 180
/** Apparent solar radius at exactly 1 AU, degrees. */
const SUN_R_1AU_DEG = Math.asin(695700 / 149597870.7) / DEG

/** Ground in shadow near the poles, from Diviner: below about 100 K (−170 °C); permanently shadowed floors 25–70 K. */
export const SHADOW_NOTE = 'In shadow the ground falls below about −170 °C; permanently shadowed crater floors reach −230 °C or colder (LRO Diviner).'

/** Solar irradiance at the Moon, W/m², from the Sun's apparent radius (falls back to the 1 AU value). */
export function solarFlux(sunRadiusDeg?: number): number {
  if (!sunRadiusDeg || !isFinite(sunRadiusDeg) || sunRadiusDeg <= 0) return SOLAR_CONSTANT
  const r = Math.sin(sunRadiusDeg * DEG) / Math.sin(SUN_R_1AU_DEG * DEG)
  return SOLAR_CONSTANT * r * r
}

/** Sunlight on a panel kept facing the Sun (a Sun-tracking array), W/m². */
export function sunOnPanel(sunFrac: number, sunRadiusDeg?: number): number {
  return solarFlux(sunRadiusDeg) * Math.max(0, Math.min(1, sunFrac))
}

/** Sunlight on level ground, W/m². */
export function sunOnGround(sunFrac: number, sunElDeg: number, sunRadiusDeg?: number): number {
  return sunOnPanel(sunFrac, sunRadiusDeg) * Math.max(0, Math.sin(sunElDeg * DEG))
}

/** Radiative-balance temperature of lunar ground receiving `incident` W/m², kelvin (0 when unlit). */
export function equilibriumK(incident: number): number {
  if (!(incident > 0)) return 0
  return Math.pow(((1 - BOND_ALBEDO) * incident) / (EMISSIVITY * SIGMA), 0.25)
}

export const kToC = (k: number) => k - 273.15

/** "−23 °C" — rounded, with a true minus sign. */
export function fmtC(k: number): string {
  const c = Math.round(kToC(k))
  return `${c < 0 ? '−' : ''}${Math.abs(c)} °C`
}
