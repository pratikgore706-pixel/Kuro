// Time scales. The ephemeris table is indexed in TT; the UI works in UTC.
const D = (y: number, m: number) => Date.UTC(y, m - 1, 1)
// [UTC instant from which TAI−UTC equals value, value in seconds] — IERS Bulletin C, complete through 2026.
const LEAPS: [number, number][] = [
  [D(1972, 1), 10], [D(1972, 7), 11], [D(1973, 1), 12], [D(1974, 1), 13], [D(1975, 1), 14], [D(1976, 1), 15],
  [D(1977, 1), 16], [D(1978, 1), 17], [D(1979, 1), 18], [D(1980, 1), 19], [D(1981, 7), 20], [D(1982, 7), 21],
  [D(1983, 7), 22], [D(1985, 7), 23], [D(1988, 1), 24], [D(1990, 1), 25], [D(1991, 1), 26], [D(1992, 7), 27],
  [D(1993, 7), 28], [D(1994, 7), 29], [D(1996, 1), 30], [D(1997, 7), 31], [D(1999, 1), 32], [D(2006, 1), 33],
  [D(2009, 1), 34], [D(2012, 7), 35], [D(2015, 7), 36], [D(2017, 1), 37],
]

/** TT − UTC in seconds. Before 1972 (rubber-second era) a linear approximation good to ~1 s is used. */
export function ttMinusUtc(utcMs: number): number {
  if (utcMs < LEAPS[0][0]) {
    const f = (utcMs - D(1966, 1)) / (LEAPS[0][0] - D(1966, 1))
    return 32.184 + 4.3 + (10 - 4.3) * Math.max(0, f)
  }
  let tai = 10
  for (const [t, v] of LEAPS) { if (utcMs >= t) tai = v; else break }
  return 32.184 + tai
}

export const jdTT = (utcMs: number) => utcMs / 86400000 + 2440587.5 + ttMinusUtc(utcMs) / 86400

export const HOUR = 3600000
export const DAY = 86400000
/** Mean synodic month — one lunar day/night cycle. */
export const LUNAR_DAY = 29.530589 * DAY

export const startOfUtcDay = (ms: number) => Math.floor(ms / DAY) * DAY

const p2 = (n: number) => String(n).padStart(2, '0')
export function fmtUtc(ms: number, withSeconds = false): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}${withSeconds ? ':' + p2(d.getUTCSeconds()) : ''}`
}
export const fmtDate = (ms: number) => fmtUtc(ms).slice(0, 10)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDayShort(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
/** "3d 07h", "5h 12m", "42m" — operational countdown formatting. */
export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60
  if (d > 0) return `${d}d ${p2(h)}h`
  if (h > 0) return `${h}h ${p2(mm)}m`
  return `${mm}m`
}
/** "14:30" (UTC) — the value format an <input type="time"> uses. */
export const fmtTimeOfDay = (ms: number) => fmtUtc(ms).slice(11, 16)
/** Parse "HH:MM" into milliseconds after midnight; null if it isn't a valid time. */
export function parseTimeOfDay(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h < 24 && mi < 60 ? h * HOUR + mi * 60000 : null
}
export function fmtHours(h: number): string {
  if (!isFinite(h)) return '—'
  if (h <= 0) return 'none'
  if (h >= 48) return `${(h / 24).toFixed(1)} d`
  return `${h.toFixed(h < 10 ? 1 : 0)} h`
}
