/**
 * Plain-language comparison of ranked sites. Every sentence is built from the computed numbers of the sites on
 * screen — nothing here is canned commentary about a particular place.
 */
import { fmtHours } from '../../engine/time'
import { RANKING_LABELS, RANKING_WEIGHTS, type ComponentScores, type RankedSite } from '../../services/api'

type Cat = keyof ComponentScores
const WEEK_H = 168

export interface Metric {
  key: 'slope' | 'sun' | 'dark' | 'earth' | 'gap' | 'both'
  /** The question a non-specialist would ask. */
  q: string
  short: string
  better: 'high' | 'low'
  /** Why it matters, in everyday words. */
  why: string
  get: (r: RankedSite) => number | null
  fmt: (v: number) => string
  /** "this is X better/worse than <other>" in everyday units. */
  diff: (a: number, b: number, other: string) => string
  /** Upper end of the chart axis. */
  max: (vals: number[]) => number
}

const perWeek = (pct: number) => Math.round((Math.abs(pct) / 100) * WEEK_H)
const hrs = (n: number) => `${n} hour${n === 1 ? '' : 's'}`

export const METRICS: Metric[] = [
  {
    key: 'slope', q: 'Is the ground flat enough to land on?', short: 'Ground slope', better: 'low',
    why: 'A lander that touches down on a slope can tip over — Athena ended up on its side. KURO treats up to 5° as safe (about as steep as a wheelchair ramp) and 15° or more as unsafe.',
    get: (r) => r.slopeDeg, fmt: (v) => `${v.toFixed(1)}°`,
    diff: (a, b, o) => Math.abs(a - b) < 0.05 ? `about as flat as ${o}` : `${Math.abs(a - b).toFixed(1)}° ${a < b ? 'flatter' : 'steeper'} than ${o}`,
    max: (v) => Math.max(15, ...v),
  },
  {
    key: 'sun', q: 'How much sunshine reaches the solar panels?', short: 'Sunlight', better: 'high',
    why: 'The lander runs on solar power. More sunshine means more energy to drive, keep warm and send pictures home.',
    get: (r) => r.summary.sunPct, fmt: (v) => `${v.toFixed(0)}%`,
    diff: (a, b, o) => a < 2 && b > 10 ? `almost no sunshine, while ${o} is lit ${b.toFixed(0)}% of the time` : perWeek(a - b) === 0 ? `about the same sunshine as ${o}` : `${hrs(perWeek(a - b))} ${a > b ? 'more' : 'less'} sunshine every week than ${o}`,
    max: () => 100,
  },
  {
    key: 'dark', q: 'What is the longest it must sit in the dark?', short: 'Longest darkness', better: 'low',
    why: 'With no Sun the lander lives on its batteries and gets bitterly cold. A shorter dark spell means smaller batteries and less risk of freezing.',
    get: (r) => r.summary.longestDarkH, fmt: (v) => (v <= 0 ? 'never dark' : fmtHours(v)),
    diff: (a, b, o) => Math.abs(a - b) < 0.5 ? `about the same dark spell as ${o}` : `${fmtHours(Math.abs(a - b))} ${a < b ? 'less' : 'more'} time stuck in the dark than ${o}`,
    max: (v) => Math.max(24, ...v),
  },
  {
    key: 'earth', q: 'How often can it talk to Earth?', short: 'Earth in view', better: 'high',
    why: 'The lander phones home directly. When Earth sinks behind the hills, the line goes silent and nobody can steer it.',
    get: (r) => r.summary.earthPct, fmt: (v) => `${v.toFixed(0)}%`,
    diff: (a, b, o) => a < 2 && b > 10 ? `almost never in touch with Earth, while ${o} is ${b.toFixed(0)}% of the time` : perWeek(a - b) === 0 ? `about as much contact as ${o}` : `${hrs(perWeek(a - b))} ${a > b ? 'more' : 'less'} contact with Earth every week than ${o}`,
    max: () => 100,
  },
  {
    key: 'gap', q: 'What is the longest silence from Earth?', short: 'Longest radio gap', better: 'low',
    why: 'During a silence the team cannot send commands or get data back. Short gaps are an inconvenience; long ones are a risk.',
    get: (r) => r.summary.longestOutageH, fmt: (v) => (v <= 0 ? 'never silent' : fmtHours(v)),
    diff: (a, b, o) => Math.abs(a - b) < 0.5 ? `about the same silence as ${o}` : `${fmtHours(Math.abs(a - b))} ${a < b ? 'shorter' : 'longer'} silence than ${o}`,
    max: (v) => Math.max(24, ...v),
  },
  {
    key: 'both', q: 'How often does it have power and radio together?', short: 'Sun + Earth together', better: 'high',
    why: 'These are the easiest hours to work: the batteries charge while the team talks to the lander.',
    get: (r) => r.summary.bothPct, fmt: (v) => `${v.toFixed(0)}%`,
    diff: (a, b, o) => a < 2 && b > 10 ? `almost never has power and radio at the same time, while ${o} has both ${b.toFixed(0)}% of the time` : perWeek(a - b) === 0 ? `about the same as ${o}` : `${hrs(perWeek(a - b))} ${a > b ? 'more' : 'less'} easy working time every week than ${o}`,
    max: () => 100,
  },
]

/** Which plain metric speaks for each score category. */
const CAT_METRIC: Record<Cat, Metric['key'][]> = { terrain: ['slope'], safety: ['dark', 'gap', 'slope'], illumination: ['sun'], communication: ['earth'], mission: ['both'] }

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th']

/** Where a site places among the ones on screen for one metric, e.g. "Best of the 4". */
export function placing(m: Metric, r: RankedSite, all: RankedSite[]): { place: number; words: string; best: boolean } | null {
  const v = m.get(r)
  if (v === null || !isFinite(v)) return null
  const vals = all.map((x) => m.get(x)).filter((x): x is number => x !== null && isFinite(x))
  const better = vals.filter((x) => (m.better === 'high' ? x > v + 1e-9 : x < v - 1e-9)).length
  const tied = vals.filter((x) => Math.abs(x - v) < 1e-9).length > 1
  const n = vals.length
  const words = better === 0 ? (tied ? `Tied best of the ${n}` : `Best of the ${n}`) : better === n - 1 ? `Last of the ${n}` : `${ORD[better]} of ${n}`
  return { place: better + 1, words, best: better === 0 }
}

/** The single most useful comparison for this metric: against the runner-up if this site leads, else against the leader. */
export function diffLine(m: Metric, r: RankedSite, all: RankedSite[]): string | null {
  const v = m.get(r)
  if (v === null || !isFinite(v)) return null
  const others = all.filter((x) => x.siteId !== r.siteId && m.get(x) !== null && isFinite(m.get(x)!))
  if (!others.length) return null
  others.sort((a, b) => (m.better === 'high' ? m.get(b)! - m.get(a)! : m.get(a)! - m.get(b)!))
  const lead = others[0]
  return m.diff(v, m.get(lead)!, lead.site.name)
}

/** Points each category adds to the overall score — the backend's weighted mean, split into its parts. */
export function points(r: RankedSite): Record<Cat, number | null> {
  const cats = Object.keys(RANKING_WEIGHTS) as Cat[]
  const w = (k: Cat) => (r.componentScores[k] === null ? 0 : (RANKING_WEIGHTS[k] * (r.componentCompleteness[k] ?? 100)) / 100)
  const sum = cats.reduce((a, k) => a + w(k), 0)
  const out = {} as Record<Cat, number | null>
  for (const k of cats) out[k] = r.componentScores[k] === null || !sum ? null : ((r.componentScores[k] as number) * w(k)) / sum
  return out
}
export const CATS = Object.keys(RANKING_WEIGHTS) as Cat[]
export const catLabel = (k: Cat) => RANKING_LABELS[k]

/** Headline and reasons for the Details dialog: why this site beats (or trails) the others on screen. */
export function verdict(r: RankedSite, all: RankedSite[]): { title: string; lead: string; reasons: string[]; weak: string | null } {
  const ranked = [...all].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const pos = ranked.findIndex((x) => x.siteId === r.siteId)
  const score = r.score === null ? null : Math.round(r.score)
  if (r.blockers.length) {
    const noSun = r.blockers.includes('no sunlight')
    return { title: `Why ${r.site.name} is ruled out`, lead: `${r.site.name} ${noSun ? 'never sees the Sun' : 'never has Earth in view'} during this stay, so a solar-powered lander ${noSun ? 'could not charge its batteries' : 'could not talk to Earth'}. However good the ground is, that makes it a 0.`, reasons: [], weak: null }
  }
  const metricsOf = (k: Cat) => CAT_METRIC[k].map((key) => METRICS.find((m) => m.key === key)!)
  const best = METRICS.filter((m) => placing(m, r, all)?.best)
  const reasons: string[] = []
  if (pos === 0) {
    const next = ranked[1]
    for (const m of best) { const d = diffLine(m, r, all); if (d) reasons.push(`${m.short}: ${d}.`) }
    if (!reasons.length) reasons.push('It is never the very best at one thing, but it has no weak spot — and steady beats spiky.')
    const lead = next ? `${r.site.name} scores ${score} out of 100 — ${Math.round((r.score ?? 0) - (next.score ?? 0))} point${Math.round((r.score ?? 0) - (next.score ?? 0)) === 1 ? '' : 's'} ahead of ${next.site.name}, the next best of these ${all.length}.` : `${r.site.name} scores ${score} out of 100.`
    const worst = METRICS.map((m) => ({ m, p: placing(m, r, all) })).filter((x) => x.p && x.p.place > 1).sort((a, b) => b.p!.place - a.p!.place)[0]
    return { title: `Why ${r.site.name} comes out on top`, lead, reasons: reasons.slice(0, 4), weak: worst ? `${worst.m.short} is its weakest point: ${diffLine(worst.m, r, all)}.` : null }
  }
  const above = ranked[pos - 1]
  const pa = points(r), pb = points(above)
  const gaps = CATS.map((k) => ({ k, d: (pa[k] ?? 0) - (pb[k] ?? 0) })).sort((a, b) => a.d - b.d)
  for (const g of gaps.filter((g) => g.d < -0.5).slice(0, 2)) {
    const m = metricsOf(g.k).find((m) => m.get(r) !== null && m.get(above) !== null && Math.abs(m.get(r)! - m.get(above)!) > 1e-6) ?? metricsOf(g.k)[0]
    const a = m.get(r), b = m.get(above)
    reasons.push(`It loses ${Math.round(-g.d)} point${Math.round(-g.d) === 1 ? '' : 's'} on ${catLabel(g.k).toLowerCase()}${a !== null && b !== null ? `: ${m.diff(a, b, above.site.name)}` : ''}.`)
  }
  const win = gaps.filter((g) => g.d > 0.5).pop()
  if (win) {
    const m = metricsOf(win.k)[0], a = m.get(r), b = m.get(above)
    reasons.push(`It wins back ${Math.round(win.d)} on ${catLabel(win.k).toLowerCase()}${a !== null && b !== null ? `: ${m.diff(a, b, above.site.name)}` : ''} — not enough to close the gap.`)
  }
  const diff = Math.round((above.score ?? 0) - (r.score ?? 0))
  const lead = `${r.site.name} scores ${score} out of 100 and comes ${ORD[pos]} of these ${all.length}. ${above.site.name}, one place above, scores ${Math.round(above.score ?? 0)} — ${diff === 0 ? 'almost a tie' : `${diff} point${diff === 1 ? '' : 's'} more`}.`
  const strong = best.map((m) => `${m.short.toLowerCase()}`)
  return { title: `Why ${r.site.name} ranks below ${above.site.name}`, lead, reasons, weak: strong.length ? `Still, it is the best of the ${all.length} for ${strong.join(' and ')}.` : null }
}

/** One short line the rover guide says about a site: what it leads on, or what holds it back against the leader. */
export function guideLine(r: RankedSite, all: RankedSite[]): string {
  if (r.blockers.length) return r.blockers.includes('no sunlight') ? 'ruled out: it never sees the Sun during this stay.' : 'ruled out: Earth never comes into view, so it could not call home.'
  const best = METRICS.filter((m) => placing(m, r, all)?.best).map((m) => m.short.toLowerCase())
  const ranked = [...all].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  if (ranked[0]?.siteId === r.siteId) return best.length ? `best here for ${best.slice(0, 3).join(', ')}.` : 'no single best number, but no weak spot either.'
  const lead = ranked[0], pa = points(r), pb = points(lead)
  const worst = CATS.map((k) => ({ k, d: (pa[k] ?? 0) - (pb[k] ?? 0) })).sort((a, b) => a.d - b.d)[0]
  const m = METRICS.find((x) => x.key === CAT_METRIC[worst.k][0])!
  const a = m.get(r), b = m.get(lead)
  const why = a !== null && b !== null ? m.diff(a, b, lead.site.name) : `weaker on ${catLabel(worst.k).toLowerCase()}`
  return `${best.length ? `best here for ${best[0]}, but ` : ''}${why}.`
}
