import { memo, useMemo } from 'react'
import { horizonAt, type Horizon, type Sky } from '../engine/sky'
import { useSize } from '../hooks'

const PAD = { l: 6, r: 6, t: 16, b: 16 }
const COMPASS: [number, string][] = [[180, 'S'], [270, 'W'], [0, 'N'], [90, 'E'], [180, 'S']]

interface Scale { x: (az: number) => number; y: (el: number) => number; lo: number; hi: number; w: number; h: number }

/** Azimuth across with north in the middle (like the sky chart), elevation up, scaled to the skyline. */
function useScale(horizon: Horizon, sky: Sky, w: number, h: number): Scale {
  return useMemo(() => {
    let mn = 0, mx = 0
    const m = horizon.mask
    if (m) for (let i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i] }
    // keep the Sun and Earth in frame when they are near the skyline; far above it they are pinned to the top edge
    const bodies = sky.ok ? [sky.sunEl, sky.earthEl].filter((e) => e > mn - 3 && e < mx + 6) : []
    const lo = Math.min(mn, ...bodies) - 0.6
    const hi = Math.max(mx, 1.5, ...bodies) + 1.2
    const iw = Math.max(10, w - PAD.l - PAD.r), ih = Math.max(10, h - PAD.t - PAD.b)
    return {
      lo, hi, w, h,
      x: (az) => PAD.l + ((((az + 180) % 360) + 360) % 360) / 360 * iw,
      y: (el) => PAD.t + (1 - (Math.min(hi, Math.max(lo, el)) - lo) / (hi - lo)) * ih,
    }
  }, [horizon, sky.ok, sky.sunEl, sky.earthEl, w, h])
}

const Ground = memo(function Ground({ horizon, s }: { horizon: Horizon; s: Scale }) {
  const yb = s.h - PAD.b
  // walk left to right by step, not by wrapped azimuth: the last step (south again, +180°) must land on the
  // right edge, where s.x() would wrap it back to the left
  const x = (i: number) => PAD.l + (i / 360) * (s.w - PAD.l - PAD.r)
  let d = `M${PAD.l} ${yb}`, line = ''
  for (let i = 0; i <= 360; i++) {
    const px = x(i).toFixed(1), py = s.y(horizonAt(horizon, i - 180)).toFixed(1)
    d += `L${px} ${py}`
    line += `${i ? 'L' : 'M'}${px} ${py}`
  }
  d += `L${s.w - PAD.r} ${yb}Z`
  return (
    <g>
      <defs>
        <linearGradient id="hs-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--hs-g1, #1b1f24)' }} /><stop offset="1" style={{ stopColor: 'var(--hs-g2, #0b0d10)' }} />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#hs-ground)" />
      <path d={line} className="hs-skyline" />
    </g>
  )
})

/**
 * The site's own skyline — the terrain horizon traced from LOLA — with the Sun and Earth where they are right
 * now. Bodies are drawn behind the terrain, so a Sun half-hidden by a ridge looks exactly that way.
 */
export function HorizonStrip({ horizon, sky }: { horizon: Horizon; sky: Sky }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const s = useScale(horizon, sky, w, h)
  const off = (el: number) => (el > s.hi ? ' ↑' : el < s.lo ? ' ↓' : '')
  const sx = s.x(sky.sunAz), ex = s.x(sky.earthAz)
  // labels sit along the top; when the two bodies are close, push the labels apart around their midpoint
  const near = Math.abs(sx - ex) < 96
  const mid = Math.min(w - 92, Math.max(92, (sx + ex) / 2))
  const sunLeft = sx <= ex
  const edge = (x: number): 'start' | 'middle' | 'end' => (x < 44 ? 'start' : x > w - 44 ? 'end' : 'middle')
  const sunAt: [number, 'start' | 'middle' | 'end'] = near ? [sunLeft ? mid - 5 : mid + 5, sunLeft ? 'end' : 'start'] : [sx, edge(sx)]
  const earthAt: [number, 'start' | 'middle' | 'end'] = near ? [sunLeft ? mid + 5 : mid - 5, sunLeft ? 'start' : 'end'] : [ex, edge(ex)]
  return (
    <div className="hstrip" ref={ref}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Skyline around the site. Sun ${sky.sunEl.toFixed(1)}° up at azimuth ${sky.sunAz.toFixed(0)}°, ${sky.sunFrac > 0 ? 'visible' : 'hidden'}. Earth ${sky.earthEl.toFixed(1)}° up at azimuth ${sky.earthAz.toFixed(0)}°, ${sky.earthUp ? 'in view' : 'hidden'}.`}>
          <line x1={PAD.l} x2={w - PAD.r} y1={s.y(0)} y2={s.y(0)} className="hs-zero" />
          {sky.ok && (
            <>
              <g transform={`translate(${ex},${s.y(sky.earthEl)})`}>
                <circle r={4.5} className="hs-earth" />
              </g>
              <g transform={`translate(${sx},${s.y(sky.sunEl)})`}>
                <circle r={9} className="hs-sunglow" />
                <circle r={5} className="hs-sun" />
              </g>
            </>
          )}
          <Ground horizon={horizon} s={s} />
          {sky.ok && (
            <>
              <text x={sunAt[0]} y={10} className={'hs-lbl sun' + (sky.sunFrac > 0 ? '' : ' off')} textAnchor={sunAt[1]}>Sun {sky.sunEl.toFixed(1)}°{off(sky.sunEl)}</text>
              <text x={earthAt[0]} y={10} className={'hs-lbl earth' + (sky.earthUp ? '' : ' off')} textAnchor={earthAt[1]}>Earth {sky.earthEl.toFixed(1)}°{off(sky.earthEl)}</text>
            </>
          )}
          {COMPASS.map(([az, c], i) => (
            <text key={i} x={i === 0 ? PAD.l : i === COMPASS.length - 1 ? w - PAD.r : s.x(az)} y={h - 4} className="hs-cmp" textAnchor={i === 0 ? 'start' : i === COMPASS.length - 1 ? 'end' : 'middle'}>{c}</text>
          ))}
        </svg>
      )}
    </div>
  )
}
