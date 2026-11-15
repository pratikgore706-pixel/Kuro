import { useMemo } from 'react'
import { librationStay, librationWords, subEarthPoint } from '../engine/libration'
import type { Horizon, Series, SiteFrame } from '../engine/sky'

const W = 132, H = 112, M = 9 // ±9° shown each way

/**
 * Earth's wobble in the lunar sky (libration) over the stay, and what the site's Earth link would be without it.
 * Sampled exactly like the stay summary, so its "with the wobble" figure is the panel's "Earth in view".
 */
export function LibrationCard({ frame, horizon, series, margin, days, cursorMs }: { frame: SiteFrame; horizon: Horizon; series: Series; margin: number; days: number; cursorMs: number }) {
  const L = useMemo(() => librationStay(frame, horizon, series.startMs, series.stepMs, series.n, margin), [frame, horizon, series, margin])
  const now = subEarthPoint(cursorMs)
  const X = (lon: number) => W / 2 + (lon / M) * (W / 2 - 6), Y = (lat: number) => H / 2 - (lat / M) * (H / 2 - 6)
  const path = useMemo(() => {
    let d = ''
    const every = Math.max(1, Math.floor(L.n / 400))
    for (let i = 0; i < L.n; i += every) if (!isNaN(L.lat[i])) d += (d ? 'L' : 'M') + X(L.lon[i]).toFixed(1) + ' ' + Y(L.lat[i]).toFixed(1)
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L])
  if (!L.ok) return null
  const fmt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`
  return (
    <section className="sp-sec lib" aria-label="Earth's wobble (libration)">
      <h3>Earth’s wobble <span>libration</span></h3>
      <p className="sp-sub">The Moon rocks a little as it orbits, so Earth wanders around its average place in the sky. Every Earth number in KURO includes it.</p>
      <div className="lib-body">
        <svg className="lib-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wobble during the stay: ${L.lonRange[0].toFixed(1)}° to ${L.lonRange[1].toFixed(1)}° east–west, ${L.latRange[0].toFixed(1)}° to ${L.latRange[1].toFixed(1)}° north–south`}>
          <line x1={W / 2} x2={W / 2} y1={4} y2={H - 4} className="lib-ax" />
          <line x1={4} x2={W - 4} y1={H / 2} y2={H / 2} className="lib-ax" />
          <text x={W - 5} y={H / 2 - 4} className="lib-t" textAnchor="end">E</text>
          <text x={W / 2 + 4} y={11} className="lib-t">N</text>
          <path d={path} className="lib-path" />
          <circle cx={W / 2} cy={H / 2} r="2.5" className="lib-mean" />
          {now && <circle cx={X(now.lon)} cy={Y(now.lat)} r="4.5" className="lib-now" />}
        </svg>
        <dl className="lib-stats">
          <div><dt>Wobble this stay</dt><dd>{fmt(L.lonRange[0])} to {fmt(L.lonRange[1])} <small>east–west</small><br />{fmt(L.latRange[0])} to {fmt(L.latRange[1])} <small>north–south</small></dd></div>
          <div><dt>Earth above the hills</dt><dd>{fmt(L.realClearRange[0])} to {fmt(L.realClearRange[1])}<br /><small>without the wobble: {fmt((L.fixedClear[0] + L.fixedClear[1]) / 2)}</small></dd></div>
        </dl>
      </div>
      <div className="lib-cmp" role="group" aria-label="Earth in view with and without libration">
        <div><span>With the wobble (real)</span><i><b style={{ width: `${L.realPct}%` }} /></i><em>{L.realPct.toFixed(0)}%</em></div>
        <div className="off"><span>If Earth sat still</span><i><b style={{ width: `${L.fixedPct}%` }} /></i><em>{L.fixedPct.toFixed(0)}%</em></div>
      </div>
      <p className="lib-say">{librationWords(L, days)}</p>
    </section>
  )
}
