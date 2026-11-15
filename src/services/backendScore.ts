/**
 * Line-by-line port of the KURO scientific backend's recommendation engine (kuro_backend_fast,
 * engines/recommendation/*.py v1.0.0, and the mission-analysis summaries it reads). Same thresholds, same
 * weights, same rounding, same order of floating-point operations, so the browser gives the backend's exact
 * numbers. src/services/backendScore.test.ts checks this against a fixture produced by running the real
 * Python code (make_parity_fixture.py); do not change anything here without regenerating that fixture.
 *
 * Inputs are per-sample visibility classifications, exactly what the backend's visibility engine produces:
 *   V = VISIBLE (body centre clears the terrain horizon by more than the tolerance)
 *   B = BLOCKED
 *   U = UNCERTAIN (incomplete horizon data; counts as neither)
 */

export type Status = 'V' | 'B' | 'U'

/** Stays in backend-parity.json, each scored by the real Python backend; backendScore.test.ts checks the count. */
export const PARITY_CASES = 77

/** Python's round(x, 2): correctly rounded, ties to even. JS toFixed rounds ties up; ties only occur at odd/8. */
export function pyRound2(x: number): number {
  if (!isFinite(x)) return x
  const t = x * 8
  if (Number.isInteger(t) && Math.abs(t) % 2 === 1 && Math.abs(x) < 2 ** 45) {
    const n = Math.floor(x * 100) // exact: x·100 = odd·12.5
    return (n % 2 === 0 ? n : n + 1) / 100
  }
  return Number(x.toFixed(2))
}

/**
 * Python's built-in sum() over floats. Since Python 3.12 it uses Neumaier's compensated summation, so plain
 * left-to-right addition can differ from the backend in the last bit, and occasionally by 0.01 after rounding.
 * This is CPython's algorithm (Objects/bltinmodule.c, builtin_sum_impl), step for step.
 */
export function pySum(values: number[]): number {
  let f = 0, c = 0
  for (const x of values) {
    const t = f + x
    if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x
    else c += (x - t) + f
    f = t
  }
  if (c && isFinite(c)) f += c
  return f
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const finite = (v: number | null | undefined): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

/** scoring.linear_score */
export function linearScore(value: number | null | undefined, best: number, worst: number, higherIsBetter = false): number | null {
  const n = finite(value)
  if (n === null) return null
  const s = higherIsBetter ? ((n - worst) / (best - worst)) * 100 : ((worst - n) / (worst - best)) * 100
  return pyRound2(clamp(s))
}

interface Part { score: number | null; weight: number }
interface Weighted { score: number | null; completeness: number }

/** scoring.weighted_score: missing parts drop out, completeness reports how much weight was available. */
export function weightedScore(parts: Part[]): Weighted & { availableWeight: number; totalWeight: number } {
  const total = pySum(parts.map((p) => p.weight))
  const avail = parts.filter((p) => p.score !== null)
  const aw = pySum(avail.map((p) => p.weight))
  if (aw === 0) return { score: null, completeness: 0, availableWeight: 0, totalWeight: total }
  const s = pySum(avail.map((p) => (p.score as number) * p.weight))
  return { score: pyRound2(s / aw), completeness: pyRound2(total ? (aw / total) * 100 : 0), availableWeight: aw, totalWeight: total }
}

/** safety_scorer._score_lower_is_safer */
function lowerIsSafer(value: number | null, safe: number, critical: number): number | null {
  const n = finite(value)
  if (n === null) return null
  if (n <= safe) return 100
  if (n >= critical) return 0
  return pyRound2(((critical - n) / (critical - safe)) * 100)
}

/** The backend's mission-analysis summary of one candidate's samples (common.summarize_status / calculate_windows). */
export interface BackendSummary {
  sampleCount: number
  sunVisiblePct: number
  earthVisiblePct: number
  jointPct: number
  /** Longest run of BLOCKED Sun samples, seconds (UNCERTAIN breaks a run). */
  longestDarkS: number
  /** Longest run of BLOCKED Earth samples, seconds. */
  longestOutageS: number
}

export function summarizeStatuses(sun: ArrayLike<Status>, earth: ArrayLike<Status>, stepSeconds: number): BackendSummary {
  const n = sun.length
  let sv = 0, ev = 0, joint = 0, dark = 0, maxDark = 0, gap = 0, maxGap = 0
  for (let i = 0; i < n; i++) {
    const s = sun[i], e = earth[i]
    if (s === 'V') sv++
    if (e === 'V') ev++
    if (s === 'V' && e === 'V') joint++
    if (s === 'B') { dark++; if (dark > maxDark) maxDark = dark } else dark = 0
    if (e === 'B') { gap++; if (gap > maxGap) maxGap = gap } else gap = 0
  }
  // window duration = (last − first) + one step = count × step for evenly spaced samples
  const step = n > 1 ? stepSeconds : 0
  return {
    sampleCount: n,
    sunVisiblePct: n ? pyRound2((sv / n) * 100) : 0,
    earthVisiblePct: n ? pyRound2((ev / n) * 100) : 0,
    jointPct: n ? pyRound2((joint / n) * 100) : 0,
    longestDarkS: maxDark * step,
    longestOutageS: maxGap * step,
  }
}

export const BACKEND_RANKING_WEIGHTS = { terrain: 0.25, safety: 0.25, illumination: 0.2, communication: 0.15, mission: 0.15 } as const
export type Category = keyof typeof BACKEND_RANKING_WEIGHTS
export const TERRAIN_WEIGHTS = { slope: 0.6, roughness: 0.4 } as const
export const SAFETY_WEIGHTS = { slope: 0.2, roughness: 0.15, hazard: 0.25, darkness: 0.2, outage: 0.2 } as const
export const THRESHOLDS = {
  terrainSlope: [0, 15], terrainRoughness: [0, 1],
  safetySlope: [5, 15], safetyRoughness: [0.2, 1],
  darknessS: [2 * 86400, 10 * 86400], outageS: [2 * 3600, 24 * 3600],
} as const

export interface BackendInputs { slopeDeg: number | null; roughnessM: number | null; summary: BackendSummary }
export interface BackendResult {
  overall: number | null
  /** The backend's own ranking-level completeness (share of completeness-adjusted weight with a score). */
  overallCompleteness: number
  /**
   * Share of the backend's full input set that was available, 0–100: each category's completeness times its
   * weight. Lower than 100 when roughness (needs ≤ 40 m terrain) or a hazard map is missing.
   */
  dataCoverage: number
  components: Record<Category, Weighted>
}

export function scoreBackend({ slopeDeg, roughnessM, summary: m }: BackendInputs): BackendResult {
  const terrain = weightedScore([
    { score: linearScore(slopeDeg, THRESHOLDS.terrainSlope[0], THRESHOLDS.terrainSlope[1]), weight: TERRAIN_WEIGHTS.slope },
    { score: linearScore(roughnessM, THRESHOLDS.terrainRoughness[0], THRESHOLDS.terrainRoughness[1]), weight: TERRAIN_WEIGHTS.roughness },
  ])
  const safety = weightedScore([
    { score: lowerIsSafer(slopeDeg, THRESHOLDS.safetySlope[0], THRESHOLDS.safetySlope[1]), weight: SAFETY_WEIGHTS.slope },
    { score: lowerIsSafer(roughnessM, THRESHOLDS.safetyRoughness[0], THRESHOLDS.safetyRoughness[1]), weight: SAFETY_WEIGHTS.roughness },
    { score: null, weight: SAFETY_WEIGHTS.hazard }, // no structured hazard assessment exists yet (same as the backend today)
    { score: lowerIsSafer(m.longestDarkS, THRESHOLDS.darknessS[0], THRESHOLDS.darknessS[1]), weight: SAFETY_WEIGHTS.darkness },
    { score: lowerIsSafer(m.longestOutageS, THRESHOLDS.outageS[0], THRESHOLDS.outageS[1]), weight: SAFETY_WEIGHTS.outage },
  ])
  const pct = (v: number) => clamp(v)
  const illumination = weightedScore([{ score: pct(m.sunVisiblePct), weight: 1 }])
  const communication = weightedScore([{ score: m.sampleCount > 0 ? pct(m.earthVisiblePct) : null, weight: 1 }])
  const mission = weightedScore([{ score: pct(m.jointPct), weight: 1 }])
  const components: Record<Category, Weighted> = {
    terrain: { score: terrain.score, completeness: terrain.completeness },
    safety: { score: safety.score, completeness: safety.completeness },
    illumination: { score: illumination.score, completeness: illumination.completeness },
    communication: { score: communication.score, completeness: communication.completeness },
    mission: { score: mission.score, completeness: mission.completeness },
  }
  // ranking_engine.rank_candidate: each category's weight is scaled by its own completeness
  const parts: Part[] = (Object.keys(BACKEND_RANKING_WEIGHTS) as Category[]).map((k) => {
    const c = components[k]
    return c.score === null ? { score: null, weight: 0 } : { score: clamp(c.score), weight: (BACKEND_RANKING_WEIGHTS[k] * clamp(c.completeness)) / 100 }
  })
  const r = weightedScore(parts)
  let cov = 0
  for (const k of Object.keys(BACKEND_RANKING_WEIGHTS) as Category[]) cov += BACKEND_RANKING_WEIGHTS[k] * (components[k].score === null ? 0 : components[k].completeness)
  return { overall: r.score, overallCompleteness: r.completeness, dataCoverage: cov, components }
}

/** ranking_engine.rank_candidates ordering: scored first, then score, then completeness (stable). */
export function backendOrder<T extends { result: BackendResult }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = a.result.overall, sb = b.result.overall
    if ((sa !== null) !== (sb !== null)) return sa !== null ? -1 : 1
    if (sa !== null && sb !== null && sa !== sb) return sb - sa
    return b.result.overallCompleteness - a.result.overallCompleteness
  })
}
