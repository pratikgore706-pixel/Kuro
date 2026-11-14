import { memo, useMemo, useRef } from 'react'
import type { Series } from '../engine/sky'
import { DAY, HOUR, fmtDayShort } from '../engine/time'
import { useSize } from '../hooks'

/** Merge consecutive samples that share a state into [startIndex, endIndex, state] runs. */
export function runs(n: number, state: (i: number) => number): [number, number, number][] {
  const out: [number, number, number][] = []
  let a = 0, cur = state(0)
  for (let i = 1; i <= n; i++) {
    const v = i < n ? state(i) : -1
    if (v !== cur) { out.push([a, i, cur]); a = i; cur = v }
  }
  return out
}
export const sunState = (s: Series) => (i: number) => (s.sunFrac[i] >= 0.999 ? 2 : s.sunFrac[i] > 0 ? 1 : 0)

const L = 56, R = 10

const Plot = memo(function Plot({ series, w, h }: { series: Series; w: number; h: number }) {
  const iw = w - L - R
  const X = (i: number) => L + (i / (series.n - 1)) * iw
  const band = 11, y1 = 2, y2 = y1 + band + 4, top = y2 + band + 8, bot = h - 16
  const { lo, hi } = useMemo(() => {
    let lo = 0, hi = 0
    for (let i = 0; i < series.n; i++) { lo = Math.min(lo, series.sunEl[i], series.earthEl[i]); hi = Math.max(hi, series.sunEl[i], series.earthEl[i]) }
    const pad = Math.max(1, (hi - lo) * 0.08)
    return { lo: lo - pad, hi: Math.min(90, hi + pad) }
  }, [series])
  const Y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (bot - top)
  const path = (a: Float32Array) => { let d = ''; for (let i = 0; i < a.length; i++) if (!isNaN(a[i])) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(a[i]).toFixed(1); return d }
  const span = (series.n - 1) * series.stepMs
  const every = [1, 2, 5, 7, 10, 14, 30].find((k) => span / DAY / k <= Math.max(4, iw / 70)) ?? 30
  const days: number[] = []
  for (let d = 0; d * DAY <= span; d += every) days.push(d)
  return (
    <g>
      <text x={L - 8} y={y1 + 9} className="axis" textAnchor="end">Sun</text>
      <text x={L - 8} y={y2 + 9} className="axis" textAnchor="end">Earth</text>
      <rect x={L} y={y1} width={iw} height={band} className="bandbg" />
      <rect x={L} y={y2} width={iw} height={band} className="bandbg" />
      {runs(series.n, sunState(series)).map(([a, b, st]) => st > 0 && <rect key={a} x={X(a)} y={y1} width={Math.max(1, X(Math.min(b, series.n - 1)) - X(a))} height={band} className={st === 2 ? 'band sun' : 'band sun part'} />)}
      {runs(series.n, (i) => series.earthUp[i]).map(([a, b, st]) => st > 0 && <rect key={a} x={X(a)} y={y2} width={Math.max(1, X(Math.min(b, series.n - 1)) - X(a))} height={band} className="band earth" />)}
      {days.map((d) => (
        <g key={d}>
          <line x1={L + (d * DAY / span) * iw} x2={L + (d * DAY / span) * iw} y1={top} y2={bot} className="grid" />
          <text x={L + (d * DAY / span) * iw} y={h - 3} className="axis" textAnchor={d === 0 ? 'start' : d * DAY >= span ? 'end' : 'middle'}>{fmtDayShort(series.startMs + d * DAY)}</text>
        </g>
      ))}
      <line x1={L} x2={w - R} y1={Y(0)} y2={Y(0)} className="grid zero" />
      <text x={L - 8} y={Y(0) + 3.5} className="axis" textAnchor="end">0°</text>
      <text x={L - 8} y={top + 8} className="axis" textAnchor="end">{hi.toFixed(0)}°</text>
      <path d={path(series.earthEl)} className="trk earth" />
      <path d={path(series.sunEl)} className="trk sun" />
    </g>
  )
})

/** Mission-window timeline: sunlight and Earth-visibility bands above elevation curves, with a draggable playhead. */
export function Timeline({ series, cursorMs, onScrub }: { series: Series; cursorMs: number; onScrub: (ms: number) => void }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const drag = useRef(false)
  const span = (series.n - 1) * series.stepMs
  const x = L + ((cursorMs - series.startMs) / span) * (w - L - R)
  const at = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    onScrub(series.startMs + Math.min(1, Math.max(0, (e.clientX - r.left - L) / (w - L - R))) * span)
  }
  return (
    <div className="timeline" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h}
          role="slider" tabIndex={0} aria-label="Mission time" aria-valuemin={0} aria-valuemax={Math.round(span / HOUR)} aria-valuenow={Math.round((cursorMs - series.startMs) / HOUR)}
          aria-valuetext={`${Math.round((cursorMs - series.startMs) / HOUR)} hours after landing`}
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e) }}
          onPointerMove={(e) => drag.current && at(e)}
          onPointerUp={() => { drag.current = false }}
          onKeyDown={(e) => {
            const k = e.shiftKey ? 6 * HOUR : HOUR
            if (e.key === 'ArrowRight') { onScrub(cursorMs + k); e.preventDefault() }
            if (e.key === 'ArrowLeft') { onScrub(cursorMs - k); e.preventDefault() }
          }}>
          <Plot series={series} w={w} h={h} />
          <line x1={x} x2={x} y1={0} y2={h - 14} className="playhead" />
          <path d={`M${x - 5} 0h10l-5 7z`} className="playhead-cap" />
        </svg>
      )}
    </div>
  )
}
