import { useEffect } from 'react'
import { Pause, Play, SkipBack } from 'lucide-react'
import type { Series } from '../engine/sky'
import { DAY, fmtDate, fmtDuration, fmtUtc } from '../engine/time'
import { useStore } from '../store'
import { Timeline } from './Timeline'

export const DURATIONS: [number, string][] = [[7, '7 days'], [14, '14 days'], [30, '30 days · one lunar day'], [60, '60 days'], [120, '120 days']]
const SPEEDS: [number, string][] = [[1, '1 h/s'], [6, '6 h/s'], [24, '1 d/s'], [72, '3 d/s']]

export function TimeBar({ series }: { series: Series }) {
  const { landingMs, days, cursorMs, playing, speed, range } = useStore()
  const { setLanding, setDays, setCursor, setPlaying, setSpeed, tick } = useStore()

  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const step = (now: number) => { tick(Math.min(100, now - last)); last = now; raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, tick])

  return (
    <footer className="timebar">
      <div className="controls">
        <label className="field">
          <span className="eyebrow">Landing date (UTC)</span>
          <input type="date" value={fmtDate(landingMs)} min={fmtDate(range[0] + DAY)} max={fmtDate(range[1] - 121 * DAY)}
            onChange={(e) => { const t = Date.parse(e.target.value + 'T00:00:00Z'); if (isFinite(t)) setLanding(t) }} />
        </label>
        <label className="field">
          <span className="eyebrow">Surface stay</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DURATIONS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
        </label>
        <div className="transport">
          <button className="btn icon" onClick={() => { setPlaying(false); setCursor(landingMs) }} aria-label="Back to landing"><SkipBack size={15} /></button>
          <button className="btn primary icon" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
            {SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="readout mono" aria-live="off">
          <span className="big">T+{fmtDuration(cursorMs - landingMs)}</span>
          <span className="dim">{fmtUtc(cursorMs)} UTC</span>
        </div>
      </div>
      <Timeline series={series} cursorMs={cursorMs} onScrub={(ms) => { setPlaying(false); setCursor(ms) }} />
    </footer>
  )
}
