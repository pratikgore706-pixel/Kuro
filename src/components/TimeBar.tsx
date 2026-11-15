import { useEffect } from 'react'
import { Pause, Play, Repeat, SkipBack } from 'lucide-react'
import type { Horizon, Series, Sky } from '../engine/sky'
import { DAY, fmtDate, fmtDuration, fmtTimeOfDay, fmtUtc, parseTimeOfDay, startOfUtcDay } from '../engine/time'
import { useStore } from '../store'
import { Timeline } from './Timeline'

export const DURATIONS: [number, string][] = [[7, '7 days'], [14, '14 days'], [30, '30 days · one lunar day'], [60, '60 days'], [120, '120 days']]
export const SPEEDS: [number, string][] = [[1, '1 h/s'], [6, '6 h/s'], [24, '1 d/s'], [72, '3 d/s'], [168, '7 d/s']]

/**
 * Playback and the stay timeline. With `when` (the default) it also carries the landing date, time and stay
 * fields; the Explorer turns that off because its Landing picker sits at the top of the left column instead.
 */
export function TimeBar({ series, when = true, probe, horizon }: { series: Series; when?: boolean; probe?: (ms: number) => Sky; horizon?: Horizon }) {
  const { landingMs, days, cursorMs, playing, speed, range, loop, earthMarginDeg } = useStore()
  const { setLanding, setDays, setCursor, setPlaying, setSpeed, setLoop, tick } = useStore()
  const dayStart = startOfUtcDay(landingMs), timeOfDay = landingMs - dayStart

  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const step = (now: number) => { tick(Math.min(100, now - last)); last = now; raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, tick])

  return (
    <footer className={'timebar' + (when ? '' : ' play-only')}>
      <div className="controls">
        {when && (<>
        <div className="field">
          <span className="eyebrow" id="landing-when">Landing date and time (UTC)</span>
          <div className="row when" role="group" aria-labelledby="landing-when">
            <input type="date" value={fmtDate(landingMs)} min={fmtDate(range[0] + DAY)} max={fmtDate(range[1] - 121 * DAY)} aria-label="Landing date, UTC"
              onChange={(e) => { const t = Date.parse(e.target.value + 'T00:00:00Z'); if (isFinite(t)) setLanding(t + timeOfDay) }} />
            <input type="time" step={60} value={fmtTimeOfDay(landingMs)} aria-label="Landing time, UTC"
              onChange={(e) => { const t = parseTimeOfDay(e.target.value); if (t !== null) setLanding(dayStart + t) }} />
          </div>
        </div>
        <label className="field">
          <span className="eyebrow">Surface stay</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DURATIONS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
        </label>
        </>)}
        <div className="transport">
          <button className="btn icon" onClick={() => { setPlaying(false); setCursor(landingMs) }} aria-label="Back to landing"><SkipBack size={15} /></button>
          <button className="btn primary icon" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'} title={(playing ? 'Pause' : 'Play the stay') + ' (P)'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed" title="Simulated time per real second">
            {SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className={'btn icon' + (loop ? ' on' : '')} onClick={() => setLoop(!loop)} aria-pressed={loop} aria-label="Loop playback" title={loop ? 'Looping: playback starts again at landing' : 'Loop: start again at landing when the stay ends'}><Repeat size={15} /></button>
        </div>
        <div className="readout mono" aria-live="off">
          <span className="big" title="Time since landing">T+{fmtDuration(cursorMs - landingMs)}</span>
          <span className="dim">{fmtUtc(cursorMs)} UTC</span>
        </div>
      </div>
      <Timeline series={series} cursorMs={cursorMs} onScrub={(ms) => { setPlaying(false); setCursor(ms) }} probe={probe} horizon={horizon} margin={earthMarginDeg} />
    </footer>
  )
}
