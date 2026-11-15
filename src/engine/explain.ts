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

/** One plain-language reason, with what kind of reason it is (drawn with a matching icon). */
export interface StoryLine { kind: 'sun' | 'earth' | 'ground' | 'dark' | 'both' | 'warn'; good: boolean; text: string }

const pct = (v: number) => `${Math.round(v)}%`
const hoursOrDays = (h: number) => (h < 48 ? `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}` : `${(h / 24).toFixed(1)} days`)

/**
 * The story of one ranked site, for someone who has never planned a landing: a headline and a few short reasons,
 * each tied to one number the stay actually has. `next` is the site ranked just below (or above, for the last).
 */
export function siteStory(r: { site: { name: string }; summary: Summary; slopeDeg: number | null; score: number | null; blockers: string[] }, rank: number, total: number, days: number, next?: { site: { name: string }; score: number | null }): { headline: string; lines: StoryLine[] } {
  const m = r.summary, lines: StoryLine[] = []
  const sun = m.sunAnyPct, earth = m.earthPct
  // power
  if (sun === 0) lines.push({ kind: 'sun', good: false, text: `The Sun never reaches this spot during these ${days} days, so solar panels could not charge at all.` })
  else if (sun >= 80) lines.push({ kind: 'sun', good: true, text: `Sunlight ${pct(sun)} of the time: solar panels can charge almost the whole stay.` })
  else if (sun >= 50) lines.push({ kind: 'sun', good: true, text: `Sunlight ${pct(sun)} of the time: more than half the stay, enough to keep batteries topped up.` })
  else lines.push({ kind: 'sun', good: false, text: `Sunlight only ${pct(sun)} of the time: the lander would run on batteries for most of the stay.` })
  // radio
  if (earth === 0) lines.push({ kind: 'earth', good: false, text: 'Earth never rises above the hills here, so the lander could not talk home without a relay satellite.' })
  else if (earth >= 95) lines.push({ kind: 'earth', good: true, text: `Earth is in view ${pct(earth)} of the time: the lander can call home whenever it needs to.` })
  else if (earth >= 50) lines.push({ kind: 'earth', good: true, text: `Earth is in view ${pct(earth)} of the time: there are regular windows to send data home.` })
  else lines.push({ kind: 'earth', good: false, text: `Earth is in view only ${pct(earth)} of the time: long silences between contacts.` })
  // ground
  if (r.slopeDeg !== null) {
    const s = r.slopeDeg
    if (s < 5) lines.push({ kind: 'ground', good: true, text: `The ground slopes just ${s.toFixed(1)}°: gentle enough for a safe touchdown.` })
    else if (s < 10) lines.push({ kind: 'ground', good: true, text: `The ground slopes ${s.toFixed(1)}°: landable, but the legs must handle a tilt.` })
    else lines.push({ kind: 'ground', good: false, text: `The ground slopes ${s.toFixed(1)}°: steep, with a real risk of tipping over on landing.` })
  }
  // the night to survive
  if (sun > 0) {
    const d = m.longestDarkH
    if (d <= 0) lines.push({ kind: 'dark', good: true, text: 'It never goes dark during the stay, so there is no cold night to survive.' })
    else if (d < 24) lines.push({ kind: 'dark', good: true, text: `The longest dark spell is ${hoursOrDays(d)}: batteries only need to bridge a short gap.` })
    else if (d < 96) lines.push({ kind: 'dark', good: false, text: `The longest dark spell is ${hoursOrDays(d)}: the lander must keep warm on batteries through it.` })
    else lines.push({ kind: 'dark', good: false, text: `The longest dark spell is ${hoursOrDays(d)}, near −170 °C: very hard to survive without nuclear heaters.` })
  }
  // power and radio together
  if (sun > 0 && earth > 0) lines.push({ kind: 'both', good: m.bothPct >= 50, text: `Power and a radio link at the same time ${pct(m.bothPct)} of the stay${m.bothPct >= 50 ? ': the easiest hours to work in.' : '.'}` })

  let headline: string
  if (r.blockers.length) headline = `Ruled out for this date: ${r.blockers.join(' and ')}.`
  else if (rank === 0) {
    const gap = next && next.score !== null && r.score !== null ? Math.round(r.score - next.score) : null
    headline = `The best of all ${total} sites for this landing${gap !== null && gap > 0 ? `, ${gap} point${gap === 1 ? '' : 's'} ahead of ${next!.site.name}` : gap === 0 ? `, level with ${next!.site.name}` : ''}.`
  } else headline = `Number ${rank + 1} of ${total} for this landing.`
  return { headline, lines }
}
