/**
 * Plain-language explanations for non-specialists. Every sentence is generated from computed numbers — nothing
 * here is canned commentary about a particular site.
 */
import type { ComponentScores, SiteScore } from '../services/api'
import { computeSeries, type Horizon, type SiteFrame, type Summary } from './sky'
import { DAY, fmtHours } from './time'

type Key = keyof ComponentScores

/** What a category measures, said with this stay's own number. */
function phrase(k: Key, m: Summary, slopeDeg: number | null, weak = false): string {
  switch (k) {
    case 'terrain': return slopeDeg === null ? 'ground slope unknown' : `${slopeDeg < 5 ? 'gentle' : slopeDeg < 10 ? 'moderate' : 'steep'} ground (${slopeDeg.toFixed(1)}° slope)`
    case 'safety': {
      const dark = m.longestDarkH > 0 ? `a ${fmtHours(m.longestDarkH)} dark spell` : '', gap = m.longestOutageH > 0 ? `a ${fmtHours(m.longestOutageH)} radio gap` : ''
      if (!weak) return dark || gap ? `short waits for light and radio: at most ${m.longestDarkH > 0 ? `${fmtHours(m.longestDarkH)} dark` : 'never dark'}, ${m.longestOutageH > 0 ? `${fmtHours(m.longestOutageH)} without Earth` : 'never without Earth'}` : 'no dark spells or radio gaps'
      if (dark || gap) return [dark, gap].filter(Boolean).join(' and ')
      return slopeDeg === null ? 'safety margins' : `slope safety (${slopeDeg.toFixed(1)}° slope)`
    }
    case 'illumination': return `sunlight ${m.backend.sunVisiblePct.toFixed(0)}% of the time`
    case 'communication': return `Earth in view ${m.backend.earthVisiblePct.toFixed(0)}% of the time`
    case 'mission': return `power and radio together ${m.backend.jointPct.toFixed(0)}% of the time`
  }
}

/**
 * One sentence on why a site scored what it did: its best and worst categories, in words. Blocked sites say
 * what is missing instead.
 */
export function rankReason(sc: SiteScore, m: Summary, slopeDeg: number | null, days: number): string {
  if (sc.blockers.length) {
    const noSun = sc.blockers.includes('no sunlight'), noEarth = sc.blockers.includes('Earth never in view')
    const what = noSun && noEarth ? 'never sees the Sun or Earth' : noSun ? 'never sees the Sun' : 'never has Earth in view'
    return `This spot ${what} during these ${days} days, so a solar-powered lander here could not ${noSun && noEarth ? 'charge or call home' : noSun ? 'charge its batteries' : 'talk directly to Earth'}.`
  }
  const parts = (Object.keys(sc.componentScores) as Key[]).filter((k) => sc.componentScores[k] !== null).map((k) => ({ k, v: sc.componentScores[k] as number }))
  if (!parts.length) return 'Not enough data to explain this score.'
  parts.sort((a, b) => b.v - a.v)
  const best = parts[0], worst = parts[parts.length - 1]
  if (best.v - worst.v < 12) return `Even across the board: ${phrase(best.k, m, slopeDeg)} and ${phrase(worst.k, m, slopeDeg)}.`
  if (worst.v >= 70) return `Strong all round: every part scores ${Math.floor(worst.v)} or more, the lowest being ${phrase(worst.k, m, slopeDeg)}.`
  return `Helped most by ${phrase(best.k, m, slopeDeg)}; held back most by ${phrase(worst.k, m, slopeDeg, true)}.`
}

/** How a stay's sunlight and Earth contact change if the landing moves by whole days, −span … +span. */
export interface DateSensitivity {
  offsets: number[]
  /** Sunlight available (mean share of the solar disc in view), %, per offset; NaN outside the ephemeris. */
  sun: number[]
  /** Earth in view, %, per offset (with the antenna margin); NaN outside the ephemeris. */
  earth: number[]
}

export function dateSensitivity(f: SiteFrame, h: Horizon, landingMs: number, days: number, earthMarginDeg = 0, span = 15): DateSensitivity {
  const per = days > 30 ? 12 : 24 // samples per day: hourly, or every 2 h for long stays
  const step = DAY / per, n = (2 * span + days) * per + 1
  const s = computeSeries(f, h, landingMs - span * DAY, step, n, earthMarginDeg)
  const accS = new Float64Array(n + 1), accE = new Float64Array(n + 1), bad = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const ok = !isNaN(s.sunEl[i])
    accS[i + 1] = accS[i] + (ok ? s.sunFrac[i] : 0); accE[i + 1] = accE[i] + (ok ? s.earthUp[i] : 0); bad[i + 1] = bad[i] + (ok ? 0 : 1)
  }
  const offsets: number[] = [], sun: number[] = [], earth: number[] = [], len = days * per
  for (let d = -span; d <= span; d++) {
    const a = (d + span) * per, b = a + len
    offsets.push(d)
    if (bad[b] - bad[a] > 0) { sun.push(NaN); earth.push(NaN); continue }
    sun.push((100 * (accS[b] - accS[a])) / len); earth.push((100 * (accE[b] - accE[a])) / len)
  }
  return { offsets, sun, earth }
}

const dayWord = (d: number) => `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ${d < 0 ? 'earlier' : 'later'}`

/**
 * Plain sentences on why the date matters here: the biggest change within a week either way, and the best start
 * within the span. `nowSun` / `nowEarth` are the panel's own figures for the chosen date, so the words match it.
 */
export function dateWords(ds: DateSensitivity, nowSun: number, nowEarth: number, peakSunEl: number, maxHillDeg: number | null): string[] {
  const out: string[] = []
  const week = ds.offsets.map((d, i) => ({ d, s: ds.sun[i], e: ds.earth[i] })).filter((p) => p.d !== 0 && Math.abs(p.d) <= 7 && isFinite(p.s))
  if (!week.length) return ['The ephemeris table does not cover the days around this landing.']
  const bigS = week.reduce((b, p) => (Math.abs(p.s - nowSun) > Math.abs(b.s - nowSun) ? p : b), week[0])
  const bigE = week.reduce((b, p) => (Math.abs(p.e - nowEarth) > Math.abs(b.e - nowEarth) ? p : b), week[0])
  if (Math.abs(bigS.s - nowSun) >= 5) out.push(`Landing ${dayWord(bigS.d)} would ${bigS.s > nowSun ? 'raise' : 'cut'} sunlight from ${nowSun.toFixed(0)}% to ${bigS.s.toFixed(0)}%.`)
  if (Math.abs(bigE.e - nowEarth) >= 5) out.push(`Landing ${dayWord(bigE.d)} would ${bigE.e > nowEarth ? 'raise' : 'cut'} the time with Earth in view from ${nowEarth.toFixed(0)}% to ${bigE.e.toFixed(0)}%.`)
  if (!out.length) out.push(`Moving the landing by up to a week changes sunlight and Earth contact here by less than 5 points: this site is forgiving about the date.`)
  const all = ds.offsets.map((d, i) => ({ d, v: ds.sun[i] + ds.earth[i] })).filter((p) => isFinite(p.v))
  const best = all.reduce((b, p) => (p.v > b.v ? p : b), all[0])
  const here = all.find((p) => p.d === 0)
  if (best && here && best.d !== 0 && best.v - here.v >= 10) {
    const i = ds.offsets.indexOf(best.d)
    out.push(`The best start in these ${ds.offsets.length} days is ${dayWord(best.d)}: sunlight ${ds.sun[i].toFixed(0)}%, Earth in view ${ds.earth[i].toFixed(0)}%.`)
  }
  if (peakSunEl < 10) out.push(`Why: here the Sun never climbs more than ${Math.max(0, peakSunEl).toFixed(1)}° above level ground${maxHillDeg !== null && maxHillDeg > 0.3 ? `, while the surrounding hills rise up to ${maxHillDeg.toFixed(1)}°` : ''}. It circles the horizon once a month, so shifting the start by a few days changes which part of that circle falls behind the hills.`)
  return out
}
