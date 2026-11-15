import { useMemo, useState } from 'react'
import { dateSensitivity, dateWords } from '../engine/explain'
import type { Horizon, SiteFrame, Summary } from '../engine/sky'
import { DAY, fmtDayShort } from '../engine/time'
import { useStore } from '../store'

const W = 300, H = 92, L = 30, R = 6, T = 8, B = 18

/**
 * "Why a few days matter": the same stay started up to 15 days earlier or later, as two small curves (sunlight,
 * Earth in view), with sentences generated from them. Clicking a day moves the landing there.
 */
export function DateMatters({ frame, horizon, landingMs, days, margin, summary }: { frame: SiteFrame; horizon: Horizon; landingMs: number; days: number; margin: number; summary: Summary }) {
  const setLanding = useStore((s) => s.setLanding)
  const range = useStore((s) => s.range)
  const [hover, setHover] = useState<number | null>(null)
  const ds = useMemo(() => dateSensitivity(frame, horizon, landingMs, days, margin), [frame, horizon, landingMs, days, margin])
  const maxHill = useMemo(() => { const m = horizon.mask; if (!m) return null; let v = -90; for (let i = 0; i < m.length; i++) v = Math.max(v, m[i]); return v }, [horizon])
  // the chosen date uses the panel's own figures so the words and the "This stay" grid agree
  const sun = ds.sun.map((v, i) => (ds.offsets[i] === 0 ? summary.sunPct : v)), earth = ds.earth.map((v, i) => (ds.offsets[i] === 0 ? summary.earthPct : v))
  const words = dateWords({ ...ds, sun, earth }, summary.sunPct, summary.earthPct, summary.peakSunEl, maxHill)
  const span = ds.offsets.length - 1, d0 = ds.offsets[0]
  const X = (d: number) => L + ((d - d0) / span) * (W - L - R), Y = (p: number) => T + (1 - p / 100) * (H - T - B)
  const line = (a: number[]) => { let s = ''; a.forEach((v, i) => { if (isFinite(v)) s += (s ? 'L' : 'M') + X(ds.offsets[i]).toFixed(1) + ' ' + Y(v).toFixed(1) }); return s }
  const can = (d: number) => { const t = landingMs + d * DAY; return t > range[0] && t + days * DAY < range[1] }
  const h = hover !== null ? ds.offsets.indexOf(hover) : -1
  return (
    <section className="sp-sec dm" aria-label="Why a few days matter">
      <h3>Why a few days matter</h3>
      <p className="sp-sub">The same {days}-day stay, started up to 15 days earlier or later. Click a day to land then.</p>
      <svg className="dm-plot" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Sunlight and Earth in view by landing date" onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((p) => <g key={p}><line x1={L} x2={W - R} y1={Y(p)} y2={Y(p)} className="dm-grid" /><text x={L - 5} y={Y(p) + 3.5} className="dm-t" textAnchor="end">{p}%</text></g>)}
        <line x1={X(0)} x2={X(0)} y1={T - 4} y2={H - B} className="dm-now" />
        <path d={line(earth)} className="dm-earth" />
        <path d={line(sun)} className="dm-sun" />
        {h >= 0 && isFinite(sun[h]) && <><circle cx={X(hover!)} cy={Y(sun[h])} r="3" className="dm-dot sun" /><circle cx={X(hover!)} cy={Y(earth[h])} r="3" className="dm-dot earth" /></>}
        <text x={X(d0)} y={H - 4} className="dm-t">{fmtDayShort(landingMs + d0 * DAY)}</text>
        <text x={X(0)} y={H - 4} className="dm-t" textAnchor="middle">landing</text>
        <text x={W - R} y={H - 4} className="dm-t" textAnchor="end">{fmtDayShort(landingMs - d0 * DAY)}</text>
        {ds.offsets.map((d) => can(d) && d !== 0 && (
          <rect key={d} x={X(d) - (W - L - R) / span / 2} y={0} width={(W - L - R) / span} height={H - B} className="dm-hit"
            role="button" tabIndex={-1} aria-label={`Land ${Math.abs(d)} days ${d < 0 ? 'earlier' : 'later'}, ${fmtDayShort(landingMs + d * DAY)}`}
            onMouseEnter={() => setHover(d)} onClick={() => setLanding(landingMs + d * DAY)} />
        ))}
      </svg>
      <div className="dm-key">
        <span className="sun">Sunlight</span><span className="earth">Earth in view</span>
        {h >= 0 && isFinite(sun[h]) && <span className="dm-read">{hover! > 0 ? '+' : '−'}{Math.abs(hover!)} d ({fmtDayShort(landingMs + hover! * DAY)}): {sun[h].toFixed(0)}%, {earth[h].toFixed(0)}%</span>}
      </div>
      {words.map((t, i) => <p key={i} className={'dm-say' + (t.startsWith('Why:') ? ' why' : '')}>{t}</p>)}
    </section>
  )
}
