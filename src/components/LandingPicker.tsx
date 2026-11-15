import { CalendarDays } from 'lucide-react'
import { DAY, fmtDate, fmtTimeOfDay, parseTimeOfDay, startOfUtcDay } from '../engine/time'
import { useStore } from '../store'
import { DURATIONS } from './TimeBar'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** ["Saturday", "14 November 2026"] (UTC). */
function longDate(ms: number): [string, string] {
  const d = new Date(ms)
  return [WEEKDAYS[d.getUTCDay()], `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`]
}

/**
 * The first decision on the page: when the lander touches down and how long it stays. Everything else — the
 * ranking below it, the site panel, the timeline — follows from these three values.
 */
export function LandingPicker() {
  const landingMs = useStore((s) => s.landingMs)
  const days = useStore((s) => s.days)
  const range = useStore((s) => s.range)
  const setLanding = useStore((s) => s.setLanding)
  const setDays = useStore((s) => s.setDays)
  const dayStart = startOfUtcDay(landingMs), timeOfDay = landingMs - dayStart
  const [weekday, date] = longDate(landingMs)

  return (
    <section className="lp" aria-label="Landing date, time and length of stay">
      <header className="lp-head">
        <h2><CalendarDays size={15} aria-hidden="true" /> Landing</h2>
        <span className="lp-hint">Change the date to re-rank the sites</span>
      </header>
      <p className="lp-long" aria-hidden="true"><span>{weekday}, {fmtTimeOfDay(landingMs)} UTC</span>{date}</p>
      <div className="lp-fields">
        <input type="date" value={fmtDate(landingMs)} min={fmtDate(range[0] + DAY)} max={fmtDate(range[1] - 121 * DAY)} aria-label="Landing date, UTC"
          onChange={(e) => { const t = Date.parse(e.target.value + 'T00:00:00Z'); if (isFinite(t)) setLanding(t + timeOfDay) }} />
        <input type="time" step={60} value={fmtTimeOfDay(landingMs)} aria-label="Landing time, UTC"
          onChange={(e) => { const t = parseTimeOfDay(e.target.value); if (t !== null) setLanding(dayStart + t) }} />
      </div>
      <div className="lp-stay" role="radiogroup" aria-label="Length of stay on the surface">
        <span className="lp-stay-l">Stay</span>
        {DURATIONS.map(([d, l]) => (
          <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)} title={l}>
            {d}<small> d</small>
          </button>
        ))}
      </div>
    </section>
  )
}
