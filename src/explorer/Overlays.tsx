import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Ruler, Trash2, X } from 'lucide-react'
import { fmtLat, fmtLon } from '../data/sites'
import type { ExplorerEngine, HoverInfo, MeasureResult } from './engine/ExplorerEngine'
import { useSignal, type Signal } from './signal'

const km = (m: number) => (Math.abs(m) >= 10000 ? `${(m / 1000).toFixed(0)} km` : Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/** Coordinates, height and slope under the pointer. Re-renders on its own, not the page. */
export function HoverHud({ hover, source }: { hover: Signal<HoverInfo | null>; source: string }) {
  const h = useSignal(hover)
  return (
    <div className="xp-hud mono" aria-live="off" data-occlude>
      {h ? (
        <>
          <span>{fmtLat(h.lat, 3)} {fmtLon(h.lon, 3)}</span>
          {h.heightM !== null && <span>elev {h.heightM >= 0 ? '+' : ''}{Math.round(h.heightM)} m</span>}
          {h.slopeDeg !== null && <span>slope {h.slopeDeg.toFixed(1)}°</span>}
        </>
      ) : <span className="dim">Point at the surface for coordinates, elevation and slope</span>}
      {source && <span className="src">{source}</span>}
    </div>
  )
}

/** Live scale bar: a round distance and its length on screen. */
export function ScaleBar({ engine }: { engine: ExplorerEngine | null }) {
  const [mpp, setMpp] = useState<number | null>(null)
  useEffect(() => { const t = setInterval(() => setMpp(engine?.metresPerPixel() ?? null), 250); return () => clearInterval(t) }, [engine])
  if (!mpp || !isFinite(mpp)) return null
  const target = mpp * 110
  const p = Math.pow(10, Math.floor(Math.log10(target)))
  const nice = [1, 2, 5, 10].map((k) => k * p).filter((v) => v <= target).pop() ?? p
  return (
    <div className="xp-scale" aria-label={`Scale: ${km(nice)}`} data-occlude>
      <i style={{ width: `${nice / mpp}px` }} /><span className="mono">{km(nice)}</span>
    </div>
  )
}

/** Distance between two clicked points and the elevation profile along the great circle. */
export function MeasurePanel({ engine, m, on }: { engine: ExplorerEngine | null; m: MeasureResult | null; on: boolean }) {
  if (!on && !m) return null
  const W = 300, H = 86
  let path = ''
  if (m) {
    const lo = m.minH, hi = Math.max(m.maxH, lo + 1)
    path = m.profile.map((h, i) => `${i ? 'L' : 'M'}${((i / (m.profile.length - 1)) * W).toFixed(1)},${(H - 6 - ((h - lo) / (hi - lo)) * (H - 14)).toFixed(1)}`).join(' ')
  }
  return (
    <section className="xp-measure glass" aria-label="Measure" data-occlude>
      <header>
        <b><Ruler size={15} aria-hidden="true" /> Measure</b>
        {m && <button className="btn icon ghost" onClick={() => engine?.clearMeasure()} title="Clear" aria-label="Clear measurement"><Trash2 size={14} /></button>}
        <button className="btn icon ghost" onClick={() => { engine?.setMeasuring(false); engine?.clearMeasure() }} aria-label="Close"><X size={14} /></button>
      </header>
      {!m ? <p className="dim small">{on ? 'Click two points on the Moon. Press Esc to stop.' : ''}</p> : (
        <>
          <dl className="xp-mgrid">
            <div><dt>Distance</dt><dd className="mono">{km(m.distM)}</dd></div>
            <div><dt>Height change</dt><dd className="mono">{m.dh >= 0 ? '+' : '−'}{km(Math.abs(m.dh))}</dd></div>
            <div><dt>Climb / descent</dt><dd className="mono">↑{km(m.gain)} ↓{km(m.loss)}</dd></div>
            <div><dt>Steepest</dt><dd className={'mono' + (m.maxSlope > 15 ? ' warn' : '')}>{m.maxSlope.toFixed(1)}°</dd></div>
          </dl>
          <svg className="xp-prof" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Elevation profile from ${km(m.minH)} to ${km(m.maxH)}`}>
            <path d={`${path} L${W},${H} L0,${H} Z`} fill="rgba(244,162,89,0.14)" />
            <path d={path} fill="none" stroke="#ffb867" strokeWidth="1.6" />
            <text x="2" y="10" className="mono">A</text><text x={W - 9} y="10" className="mono">B</text>
          </svg>
          <p className="dim small mono">{fmtLat(m.a[0], 2)} {fmtLon(m.a[1], 2)} → {fmtLat(m.b[0], 2)} {fmtLon(m.b[1], 2)}</p>
          <p className="dim small">Heights: {m.source}. Slope between profile samples ({km(m.distM / (m.profile.length - 1))} apart).</p>
        </>
      )}
    </section>
  )
}

export interface TourStep { title: string; text: string; apply: () => void }

/** Guided tour: one card, Back / Next. */
export function Tour({ steps, i, onStep, onClose }: { steps: TourStep[]; i: number; onStep: (i: number) => void; onClose: () => void }) {
  const s = steps[i]
  useEffect(() => { s.apply() }, [i]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="xp-tour glass" role="dialog" aria-label="Guided tour" data-occlude>
      <div className="xp-tour-top">
        <span className="mono dim">{i + 1} / {steps.length}</span>
        <button className="btn icon ghost" onClick={onClose} aria-label="End tour"><X size={14} /></button>
      </div>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      <div className="xp-tour-nav">
        <button className="btn" onClick={() => onStep(i - 1)} disabled={i === 0}><ArrowLeft size={14} aria-hidden="true" /> Back</button>
        {i < steps.length - 1 ? <button className="btn primary" onClick={() => onStep(i + 1)}>Next <ArrowRight size={14} aria-hidden="true" /></button> : <button className="btn primary" onClick={onClose}>Start exploring</button>}
      </div>
      <div className="xp-tour-dots" aria-hidden="true">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
    </section>
  )
}
