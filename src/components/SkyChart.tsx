import { memo, useMemo } from 'react'
import { horizonAt, type Horizon, type Series, type Sky } from '../engine/sky'
import { DAY } from '../engine/time'
import { useSize } from '../hooks'

const M = { l: 38, r: 12, t: 12, b: 24 }
const COMPASS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE', 'S']

interface Scale { x: (az: number) => number; y: (el: number) => number; lo: number; hi: number; w: number; h: number }

function useScale(series: Series, w: number, h: number): Scale {
  return useMemo(() => {
    let max = -90, min = 90
    for (let i = 0; i < series.n; i++) {
      const a = series.sunEl[i], b = series.earthEl[i]
      if (a > max) max = a; if (b > max) max = b; if (a < min) min = a; if (b < min) min = b
    }
    const hi = Math.min(90, Math.max(6, Math.ceil(max + 1.5)))
    const lo = Math.max(Math.floor(min - 1), -Math.max(6, hi * 0.3))
    const iw = Math.max(10, w - M.l - M.r), ih = Math.max(10, h - M.t - M.b)
    return {
      lo, hi, w, h,
      x: (az) => M.l + ((((az + 180) % 360) + 360) % 360) / 360 * iw, // north in the centre
      y: (el) => M.t + (1 - (el - lo) / (hi - lo)) * ih,
    }
  }, [series, w, h])
}

function trackPath(az: Float32Array, el: Float32Array, s: Scale, keep?: (i: number) => boolean): string {
  let d = '', px = NaN
  const jump = (s.w - M.l - M.r) / 3
  for (let i = 0; i < az.length; i++) {
    if (isNaN(el[i]) || (keep && !keep(i))) { px = NaN; continue }
    const x = s.x(az[i]), y = s.y(el[i])
    d += (isNaN(px) || Math.abs(x - px) > jump ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
    px = x
  }
  return d
}

const Static = memo(function Static({ series, horizon, s }: { series: Series; horizon: Horizon; s: Scale }) {
  const range = s.hi - s.lo
  const step = range <= 20 ? 2 : range <= 50 ? 5 : 15
  const lines: number[] = []
  for (let v = Math.ceil(s.lo / step) * step; v <= s.hi; v += step) lines.push(v)
  const x0 = M.l, x1 = s.w - M.r, yb = s.h - M.b

  let ground = `M${x0} ${yb}`
  for (let i = 0; i <= 180; i++) { const az = -180 + i * 2; ground += `L${(x0 + (i / 180) * (x1 - x0)).toFixed(1)} ${s.y(horizonAt(horizon, az)).toFixed(1)}` }
  ground += `L${x1} ${yb}Z`

  const dayEvery = Math.max(1, Math.ceil((series.n * series.stepMs) / DAY / 8))
  const ticks: { x: number; y: number; d: number }[] = []
  for (let d = 0; d * DAY <= (series.n - 1) * series.stepMs; d += dayEvery) {
    const i = Math.round((d * DAY) / series.stepMs)
    if (!isNaN(series.sunEl[i]) && series.sunEl[i] > s.lo && series.sunEl[i] < s.hi) ticks.push({ x: s.x(series.sunAz[i]), y: s.y(series.sunEl[i]), d })
  }

  return (
    <g>
      <defs>
        <clipPath id="sky-clip"><rect x={x0} y={M.t} width={x1 - x0} height={yb - M.t} /></clipPath>
        <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b0c18" /><stop offset="1" stopColor="#12132a" /></linearGradient>
      </defs>
      <rect x={x0} y={M.t} width={x1 - x0} height={yb - M.t} fill="url(#sky-grad)" />
      {lines.map((v) => (
        <g key={v}>
          <line x1={x0} x2={x1} y1={s.y(v)} y2={s.y(v)} className={v === 0 ? 'grid zero' : 'grid'} />
          <text x={x0 - 6} y={s.y(v) + 3.5} className="axis" textAnchor="end">{v}°</text>
        </g>
      ))}
      {COMPASS.map((c, i) => {
        const x = x0 + (i / 8) * (x1 - x0)
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={M.t} y2={yb} className="grid" />
            <text x={x} y={s.h - 7} className={'axis' + (c.length === 1 ? ' strong' : '')} textAnchor={i === 0 ? 'start' : i === 8 ? 'end' : 'middle'}>{c}</text>
          </g>
        )
      })}
      <g clipPath="url(#sky-clip)">
        <path d={trackPath(series.earthAz, series.earthEl, s)} className="trk earth" />
        <path d={trackPath(series.sunAz, series.sunEl, s)} className="trk sun dimmed" />
        <path d={trackPath(series.sunAz, series.sunEl, s, (i) => series.sunFrac[i] > 0)} className="trk sun" />
        <path d={ground} className="ground" />
        <path d={trackPath(series.sunAz, series.sunEl, s, (i) => series.sunFrac[i] === 0)} className="trk sun below" />
        <path d={trackPath(series.earthAz, series.earthEl, s, (i) => !series.earthUp[i])} className="trk earth below" />
        {ticks.map((t) => (
          <g key={t.d}>
            <circle cx={t.x} cy={t.y} r={2.2} className="daydot" />
            <text x={t.x} y={t.y + 14} className="daylbl" textAnchor="middle">{t.d === 0 ? 'landing' : `+${t.d}d`}</text>
          </g>
        ))}
      </g>
      <rect x={x0} y={M.t} width={x1 - x0} height={yb - M.t} className="frame" />
    </g>
  )
})

/** Panorama of the local sky: azimuth across (north centred), elevation up. Tracks cover the mission window. */
export function SkyChart({ series, horizon, sky }: { series: Series; horizon: Horizon; sky: Sky }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const s = useScale(series, w, h)
  const inY = (el: number) => Math.min(s.h - M.b - 4, Math.max(M.t + 4, s.y(el)))
  const sunOff = sky.sunEl < s.lo || sky.sunEl > s.hi, earthOff = sky.earthEl < s.lo || sky.earthEl > s.hi
  return (
    <div className="skychart" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Sky panorama. Sun at ${sky.sunEl.toFixed(1)} degrees elevation, azimuth ${sky.sunAz.toFixed(0)}. Earth at ${sky.earthEl.toFixed(1)} degrees elevation, azimuth ${sky.earthAz.toFixed(0)}.`}>
          <Static series={series} horizon={horizon} s={s} />
          {sky.ok && (
            <>
              <g transform={`translate(${s.x(sky.earthAz)},${inY(sky.earthEl)})`} opacity={sky.earthUp ? 1 : 0.55}>
                <circle r={8} className="earthdot" />
                <path d="M-8 0A8 8 0 0 1 0 -8A11 11 0 0 0 -8 0Z" fill="#dfeaff" opacity=".5" />
                <text x={12} y={-9} className="lbl earth">Earth {sky.earthEl.toFixed(1)}°{earthOff ? (sky.earthEl > s.hi ? ' ↑' : ' ↓') : ''}</text>
              </g>
              <g transform={`translate(${s.x(sky.sunAz)},${inY(sky.sunEl)})`} opacity={sky.sunFrac > 0 ? 1 : 0.55}>
                <circle r={13} className="sunglow" />
                <circle r={6} className="sundot" />
                <text x={12} y={-11} className="lbl sun">Sun {sky.sunEl.toFixed(1)}°{sunOff ? (sky.sunEl > s.hi ? ' ↑' : ' ↓') : ''}</text>
              </g>
            </>
          )}
        </svg>
      )}
    </div>
  )
}
