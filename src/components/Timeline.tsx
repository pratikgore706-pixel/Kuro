import { memo, useMemo, useRef, useState } from 'react'
import { horizonAt, type Horizon, type Series, type Sky } from '../engine/sky'
import { equilibriumK, fmtC, sunOnGround, sunOnPanel } from '../engine/thermal'
import { DAY, HOUR, fmtDayShort, fmtDuration, fmtUtc } from '../engine/time'
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

/** Vertical layout of the plot: the two bands on top, the elevation curves below. */
const BAND = 11, Y1 = 2, Y2 = Y1 + BAND + 4, TOP = Y2 + BAND + 8

function elevRange(series: Series) {
  let lo = 0, hi = 0
  for (let i = 0; i < series.n; i++) {
    const a = series.sunEl[i], b = series.earthEl[i]
    if (isFinite(a)) { lo = Math.min(lo, a); hi = Math.max(hi, a) }
    if (isFinite(b)) { lo = Math.min(lo, b); hi = Math.max(hi, b) }
  }
  const pad = Math.max(1, (hi - lo) * 0.08)
  return { lo: lo - pad, hi: Math.min(90, hi + pad) }
}

const Plot = memo(function Plot({ series, w, h, lo, hi }: { series: Series; w: number; h: number; lo: number; hi: number }) {
  const iw = w - L - R
  const X = (i: number) => L + (i / (series.n - 1)) * iw
  const band = BAND, y1 = Y1, y2 = Y2, top = TOP, bot = h - 16
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

/** Everything about one instant of the stay, for the hover card. */
function HoverCard({ ms, startMs, sky, horizon, margin, x, w }: { ms: number; startMs: number; sky: Sky; horizon?: Horizon; margin: number; x: number; w: number }) {
  if (!sky.ok) return null
  const hills = (az: number) => (horizon?.kind === 'terrain' ? horizonAt(horizon, az) : 0)
  const deg = (v: number, p = 1) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(p)}°`
  const sunUp = sky.sunFrac > 0, earthUp = sky.earthUp
  const sunState = sky.sunFrac >= 0.999 ? 'in full view' : sunUp ? `${Math.round(sky.sunFrac * 100)}% of the disc in view` : sky.sunEl > 0 ? 'hidden behind the hills' : 'below the horizon'
  const earthState = earthUp ? 'in view' : sky.earthClear > 0 ? `only ${deg(sky.earthClear)} above the hills (antenna needs ${margin}°)` : sky.earthEl > 0 ? 'hidden behind the hills' : 'below the horizon'
  const panel = sunOnPanel(sky.sunFrac, sky.sunR), ground = sunOnGround(sky.sunFrac, sky.sunEl, sky.sunR)
  const both = sunUp && earthUp ? 'Power and radio both available' : sunUp ? 'Power only, no direct link to Earth' : earthUp ? 'Radio only, running on batteries' : 'No power and no direct link'
  const d = new Date(ms)
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const CARD = 300
  const left = Math.min(Math.max(x - CARD / 2, 0), Math.max(0, w - CARD))
  return (
    <div className="tl-card" style={{ left, width: CARD }} role="tooltip">
      <header><b>{day}, {fmtUtc(ms).slice(11, 16)} UTC</b><span>T+{fmtDuration(ms - startMs)}</span></header>
      <dl>
        <div className={'sun' + (sunUp ? ' up' : '')}><dt>Sun</dt><dd><b>{sunState}</b><small>elevation {deg(sky.sunEl, 2)}, azimuth {sky.sunAz.toFixed(0)}°{horizon?.kind === 'terrain' ? `, hills there ${deg(hills(sky.sunAz))}` : ''}</small></dd></div>
        <div className={'earth' + (earthUp ? ' up' : '')}><dt>Earth</dt><dd><b>{earthState}</b><small>elevation {deg(sky.earthEl, 2)}, azimuth {sky.earthAz.toFixed(0)}°{horizon?.kind === 'terrain' ? `, hills there ${deg(hills(sky.earthAz))}` : ''}</small></dd></div>
        <div><dt>Sunlight</dt><dd><b>{Math.round(panel).toLocaleString('en-GB')} W/m²</b> <small>on a Sun-facing panel, {ground.toFixed(0)} W/m² on level ground</small></dd></div>
        <div><dt>Ground</dt><dd><b>{ground > 0 ? `about ${fmtC(equilibriumK(ground))}` : 'below −170 °C'}</b> <small>{ground > 0 ? 'estimate, bare level regolith' : 'in shadow (LRO Diviner)'}</small></dd></div>
      </dl>
      <p className={'tl-both' + (sunUp && earthUp ? ' ok' : !sunUp && !earthUp ? ' bad' : '')}>{both}</p>
    </div>
  )
}

/**
 * Mission-window timeline: sunlight and Earth-visibility bands above elevation curves, with a draggable playhead.
 * With `probe`, hovering anywhere shows that instant in full (Sun, Earth, hills, sunlight, ground temperature).
 */
export function Timeline({ series, cursorMs, onScrub, probe, horizon, margin = 0 }: { series: Series; cursorMs: number; onScrub: (ms: number) => void; probe?: (ms: number) => Sky; horizon?: Horizon; margin?: number }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const drag = useRef(false)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const span = (series.n - 1) * series.stepMs
  const x = L + ((cursorMs - series.startMs) / span) * (w - L - R)
  const { lo, hi } = useMemo(() => elevRange(series), [series])
  const msAt = (px: number) => series.startMs + Math.min(1, Math.max(0, (px - L) / (w - L - R))) * span
  const at = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    onScrub(msAt(e.clientX - r.left))
  }
  const hov = useMemo(() => {
    if (hoverX === null || !probe || w <= 0) return null
    const px = Math.min(Math.max(hoverX, L), w - R), ms = msAt(px)
    // snap to the nearest sample so the dots sit exactly on the drawn curves
    const i = Math.round((ms - series.startMs) / series.stepMs)
    const sx = L + (i / (series.n - 1)) * (w - L - R), sms = series.startMs + i * series.stepMs
    return { x: sx, i, ms: sms, sky: probe(sms) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverX, probe, series, w])
  const Y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (h - 16 - TOP)
  return (
    <div className="timeline" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h}
          role="slider" tabIndex={0} aria-label="Mission time" aria-valuemin={0} aria-valuemax={Math.round(span / HOUR)} aria-valuenow={Math.round((cursorMs - series.startMs) / HOUR)}
          aria-valuetext={`${Math.round((cursorMs - series.startMs) / HOUR)} hours after landing`}
          onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e) }}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.pointerType === 'mouse' || drag.current) setHoverX(e.clientX - r.left); if (drag.current) at(e) }}
          onPointerUp={() => { drag.current = false }}
          onPointerLeave={() => { if (!drag.current) setHoverX(null) }}
          onKeyDown={(e) => {
            const k = e.shiftKey ? 6 * HOUR : HOUR
            if (e.key === 'ArrowRight') { onScrub(cursorMs + k); e.preventDefault() }
            if (e.key === 'ArrowLeft') { onScrub(cursorMs - k); e.preventDefault() }
          }}>
          <Plot series={series} w={w} h={h} lo={lo} hi={hi} />
          {hov && (
            <g className="tl-hover" pointerEvents="none">
              <line x1={hov.x} x2={hov.x} y1={0} y2={h - 14} />
              {isFinite(series.earthEl[hov.i]) && <circle cx={hov.x} cy={Y(series.earthEl[hov.i])} r={4} className="earth" />}
              {isFinite(series.sunEl[hov.i]) && <circle cx={hov.x} cy={Y(series.sunEl[hov.i])} r={4} className="sun" />}
            </g>
          )}
          <line x1={x} x2={x} y1={0} y2={h - 14} className="playhead" />
          <path d={`M${x - 5} 0h10l-5 7z`} className="playhead-cap" />
        </svg>
      )}
      {hov && <HoverCard ms={hov.ms} startMs={series.startMs} sky={hov.sky} horizon={horizon} margin={margin} x={hov.x} w={w} />}
    </div>
  )
}
