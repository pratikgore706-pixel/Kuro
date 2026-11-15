import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Repeat, SkipBack } from 'lucide-react'
import { fmtLat, fmtLon, type Site } from '../data/sites'
import { horizonAt, type Horizon, type Series } from '../engine/sky'
import { DAY, HOUR, fmtDayShort, fmtDuration } from '../engine/time'
import { useSize } from '../hooks'
import { SPEEDS } from './TimeBar'

export interface SideRow { key: string; letter: string; site: Site; landingMs: number; days: number; series: Series; horizon: Horizon }

const PAD = { l: 6, r: 6, t: 8, b: 16 }
const COMPASS: [number, string][] = [[180, 'S'], [270, 'W'], [0, 'N'], [90, 'E'], [180, 'S']]
/** Highest elevation drawn; bodies above it are pinned to the top edge so polar skylines stay readable. */
const CAP_DEG = 24

interface Frame { w: number; h: number; lo: number; hi: number; x: (az: number) => number; y: (el: number) => number }

function useFrameFor(row: SideRow, w: number, h: number): Frame {
  return useMemo(() => {
    const m = row.horizon.mask, s = row.series
    let mn = 0, mx = 0
    if (m) for (let i = 0; i < m.length; i++) { mn = Math.min(mn, m[i]); mx = Math.max(mx, m[i]) }
    let top = mx + 1.5
    for (let i = 0; i < s.n; i++) { if (isFinite(s.sunEl[i])) top = Math.max(top, s.sunEl[i] + 1); if (isFinite(s.earthEl[i])) top = Math.max(top, s.earthEl[i] + 1) }
    const hi = Math.min(Math.max(top, 3), CAP_DEG)
    let low = mn
    for (let i = 0; i < s.n; i++) { if (s.sunEl[i] > -8) low = Math.min(low, s.sunEl[i]); if (s.earthEl[i] > -8) low = Math.min(low, s.earthEl[i]) }
    const lo = Math.max(low, -8) - 0.8
    const iw = Math.max(10, w - PAD.l - PAD.r), ih = Math.max(10, h - PAD.t - PAD.b)
    return { w, h, lo, hi, x: (az) => PAD.l + ((((az + 180) % 360) + 360) % 360) / 360 * iw, y: (el) => PAD.t + (1 - (Math.min(hi, Math.max(lo, el)) - lo) / (hi - lo)) * ih }
  }, [row.horizon, row.series, w, h])
}

/** A body's track across the stay as two SVG paths — where it can be seen, and where it is hidden — broken at the wrap. */
function tracks(f: Frame, n: number, az: Float32Array, el: Float32Array, seen: (i: number) => boolean) {
  const every = Math.max(1, Math.floor(n / 700))
  let on = '', off = '', prev: { x: number; v: boolean } | null = null
  for (let i = 0; i < n; i += every) {
    if (!isFinite(el[i])) { prev = null; continue }
    const x = f.x(az[i]), y = f.y(el[i]), v = seen(i)
    const cont = prev && prev.v === v && Math.abs(x - prev.x) < f.w / 2
    const seg = `${cont ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    if (v) on += seg; else off += seg
    prev = { x, v }
  }
  return { on, off }
}

const Card = memo(function Card({ row, t }: { row: SideRow; t: number }) {
  const [ref, { w }] = useSize<HTMLDivElement>()
  const h = 132
  const f = useFrameFor(row, w, h)
  const s = row.series
  const sun = useMemo(() => (w ? tracks(f, s.n, s.sunAz, s.sunEl, (i) => s.sunFrac[i] > 0) : null), [f, s, w])
  const earth = useMemo(() => (w ? tracks(f, s.n, s.earthAz, s.earthEl, (i) => s.earthUp[i] > 0) : null), [f, s, w])
  const ground = useMemo(() => {
    if (!w) return null
    const yb = h - PAD.b, x = (i: number) => PAD.l + (i / 360) * (w - PAD.l - PAD.r)
    let d = `M${PAD.l} ${yb}`, line = ''
    for (let i = 0; i <= 360; i++) { const px = x(i).toFixed(1), py = f.y(horizonAt(row.horizon, i - 180)).toFixed(1); d += `L${px} ${py}`; line += `${i ? 'L' : 'M'}${px} ${py}` }
    return { fill: d + `L${w - PAD.r} ${yb}Z`, line }
  }, [f, row.horizon, w])
  // running totals so "so far" is one subtraction per frame
  const acc = useMemo(() => {
    const a = new Float64Array(s.n + 1), b = new Float64Array(s.n + 1)
    for (let i = 0; i < s.n; i++) { a[i + 1] = a[i] + (isFinite(s.sunEl[i]) ? s.sunFrac[i] : 0); b[i + 1] = b[i] + (s.earthUp[i] || 0) }
    return { a, b }
  }, [s])
  const span = row.days * DAY, over = t > span
  const i = Math.min(s.n - 1, Math.max(0, Math.round(Math.min(t, span) / s.stepMs)))
  const ok = isFinite(s.sunEl[i])
  const sunSeen = s.sunFrac[i] > 0, earthSeen = s.earthUp[i] > 0
  // hidden above level ground means a hill is in the way; otherwise it is simply below the horizon
  const hidden = (el: number) => (el > 0 ? 'behind the hills' : 'below the horizon')
  const sunWord = !ok ? 'outside the ephemeris' : sunSeen ? (s.sunFrac[i] >= 0.999 ? 'in full view' : `${Math.round(s.sunFrac[i] * 100)}% of the disc in view`) : hidden(s.sunEl[i])
  const earthWord = !ok ? 'outside the ephemeris' : earthSeen ? 'in view' : hidden(s.earthEl[i])
  const soFarS = (100 * acc.a[i + 1]) / (i + 1), soFarE = (100 * acc.b[i + 1]) / (i + 1)
  const sx = f.x(s.sunAz[i]), sy = f.y(s.sunEl[i]), ex = f.x(s.earthAz[i]), ey = f.y(s.earthEl[i])
  return (
    <article className={'sbs-card' + (over ? ' over' : '')} aria-label={`Scenario ${row.letter}: ${row.site.name}`}>
      <header>
        <span className="sbs-letter">{row.letter}</span>
        <div><h3>{row.site.name}</h3><p>{fmtLat(row.site.lat, 2)} {fmtLon(row.site.lon, 2)}, landing {fmtDayShort(row.landingMs)}, {row.days} days</p></div>
      </header>
      <div className="sbs-sky" ref={ref}>
        {w > 0 && sun && earth && ground && (
          <svg width={w} height={h} role="img" aria-label={`Skyline of ${row.site.name} with the Sun's and Earth's paths across the stay. Now: Sun ${sunWord}, Earth ${earthWord}.`}>
            <line x1={PAD.l} x2={w - PAD.r} y1={f.y(0)} y2={f.y(0)} className="hs-zero" />
            <path d={earth.off} className="sbs-trk earth off" /><path d={earth.on} className="sbs-trk earth" />
            <path d={sun.off} className="sbs-trk sun off" /><path d={sun.on} className="sbs-trk sun" />
            {ok && <>
              <circle cx={ex} cy={ey} r={4.5} className={'hs-earth' + (earthSeen ? '' : ' dim')} />
              <circle cx={sx} cy={sy} r={9} className="hs-sunglow" /><circle cx={sx} cy={sy} r={5} className={'hs-sun' + (sunSeen ? '' : ' dim')} />
            </>}
            <path d={ground.fill} className="sbs-ground" /><path d={ground.line} className="hs-skyline" />
            {COMPASS.map(([az, c], k) => (
              <text key={k} x={k === 0 ? PAD.l : k === COMPASS.length - 1 ? w - PAD.r : f.x(az)} y={h - 4} className="hs-cmp" textAnchor={k === 0 ? 'start' : k === COMPASS.length - 1 ? 'end' : 'middle'}>{c}</text>
            ))}
            {f.hi >= CAP_DEG && <text x={w - PAD.r} y={PAD.t + 8} className="hs-cmp" textAnchor="end">above {CAP_DEG}° pinned to top</text>}
          </svg>
        )}
      </div>
      <dl className="sbs-now">
        <div className={'sun' + (sunSeen ? ' up' : '')}><dt>Sun</dt><dd>{sunWord}</dd></div>
        <div className={'earth' + (earthSeen ? ' up' : '')}><dt>Earth</dt><dd>{earthWord}</dd></div>
      </dl>
      <div className="sbs-sofar" aria-label="Share of the stay so far">
        <div><span>Sunlight so far</span><i><b className="sun" style={{ width: `${soFarS}%` }} /></i><em>{soFarS.toFixed(0)}%</em></div>
        <div><span>Earth in view so far</span><i><b className="earth" style={{ width: `${soFarE}%` }} /></i><em>{soFarE.toFixed(0)}%</em></div>
      </div>
      {over && <p className="sbs-over">This {row.days}-day stay has ended; the others continue.</p>}
    </article>
  )
})

/**
 * Every scenario on one screen at once, each with its own skyline and the Sun's and Earth's paths across its
 * stay, driven by one shared clock: time since each scenario's own landing, so different dates line up.
 */
export function SideBySide({ rows }: { rows: SideRow[] }) {
  const longest = Math.max(...rows.map((r) => r.days)) * DAY
  const [t, setTState] = useState(0)
  const tRef = useRef(0)
  const setT = (v: number) => { tRef.current = v; setTState(v) }
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(24)
  const [loop, setLoop] = useState(true)
  // a scenario removed or shortened: keep the cursor inside the longest remaining stay
  useEffect(() => { if (tRef.current > longest) { tRef.current = longest; setTState(longest) } }, [longest])
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(100, now - last); last = now
      const next = tRef.current + dt * speed * 3600
      if (next < longest) { tRef.current = next; setTState(next) }
      else if (loop) { tRef.current = 0; setTState(0) }
      else { tRef.current = longest; setTState(longest); setPlaying(false); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, loop, longest])

  return (
    <section className="sbs" aria-label="Scenarios side by side">
      <header className="sbs-head">
        <div>
          <h2>Side by side</h2>
          <p className="lede">Each card is one scenario’s real skyline with the Sun’s path (gold) and Earth’s path (blue) across the whole stay; faint parts are hidden behind the hills. Press play to watch every scenario at the same time since its own landing.</p>
        </div>
      </header>
      <div className="sbs-bar" role="group" aria-label="Shared playback">
        <button className="btn icon" onClick={() => { setPlaying(false); setT(0) }} aria-label="Back to landing"><SkipBack size={15} /></button>
        <button className="btn primary icon" onClick={() => { if (!playing && t >= longest) setT(0); setPlaying(!playing) }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">{SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className={'btn icon' + (loop ? ' on' : '')} onClick={() => setLoop(!loop)} aria-pressed={loop} aria-label="Loop playback" title="Start again at landing when the longest stay ends"><Repeat size={15} /></button>
        <input type="range" className="sbs-range" min={0} max={Math.round(longest / HOUR)} step={1} value={Math.round(t / HOUR)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value) * HOUR) }} aria-label="Time since landing, hours" aria-valuetext={`${fmtDuration(t)} after landing`} />
        <span className="sbs-t"><b>T+{fmtDuration(t)}</b> since each landing</span>
      </div>
      <div className="sbs-grid">
        {rows.map((r) => <Card key={r.key} row={r} t={t} />)}
      </div>
    </section>
  )
}
