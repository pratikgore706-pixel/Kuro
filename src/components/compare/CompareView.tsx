import { memo, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, ChevronDown, Clapperboard, Globe2, Info, Maximize2, Minimize2, Minus, Plus, RotateCcw, RotateCw, Sun } from 'lucide-react'
import { runs, sunState } from '../Timeline'
import type { Series } from '../../engine/sky'
import { ExplorerEngine, type CinePhase, type EngineStatus } from '../../explorer/engine/ExplorerEngine'
import { buildKuroRover } from '../../explorer/engine/KuroRover'
import { isLite } from '../../perf'
import type { MoonData } from '../../explorer/moonData'
import type { RankedSite } from '../../services/api'

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
const dir = (az: number) => DIRS[Math.round((((az % 360) + 360) % 360) / 45) % 8]

/** What the Sun and Earth are doing at one instant, in words. */
function sky(s: Series, i: number) {
  if (i < 0 || i >= s.n || isNaN(s.sunEl[i])) return null
  const f = s.sunFrac[i], se = s.sunEl[i], ee = s.earthEl[i]
  const sun = f >= 0.999 ? { on: 2, txt: 'Sun fully up' } : f > 0 ? { on: 1, txt: `${Math.round(f * 100)}% of the Sun visible` } : { on: 0, txt: se > 0 ? 'Sun behind the hills' : 'Sun below the horizon' }
  const earth = s.earthUp[i] ? { on: 2, txt: 'Earth in view' } : { on: 0, txt: ee > 0 ? 'Earth behind the hills' : 'Earth below the horizon' }
  const where = (el: number, az: number) => `${Math.abs(el).toFixed(1)}° ${el >= 0 ? 'up' : 'below'} · ${dir(az)}`
  return { sun, earth, sunWhere: where(se, s.sunAz[i]), earthWhere: where(ee, s.earthAz[i]) }
}

/** The stay's Sun and Earth bands: drawn once per series, not once per frame. */
const Bands = memo(function Bands({ s }: { s: Series }) {
  const W = 1000, x = (i: number) => (i / (s.n - 1)) * W
  return (
    <>
      <rect x="0" y="0" width={W} height="5" className="bg" /><rect x="0" y="9" width={W} height="5" className="bg" />
      {runs(s.n, sunState(s)).map(([a, b, st]) => st > 0 && <rect key={'s' + a} x={x(a)} y="0" width={Math.max(1, x(Math.min(b, s.n - 1)) - x(a))} height="5" className={st === 2 ? 'sun' : 'sun part'} />)}
      {runs(s.n, (i) => s.earthUp[i]).map(([a, b, st]) => st > 0 && <rect key={'e' + a} x={x(a)} y="9" width={Math.max(1, x(Math.min(b, s.n - 1)) - x(a))} height="5" className="earth" />)}
    </>
  )
})
function Strip({ s, cursor }: { s: Series; cursor: number }) {
  const W = 1000, cx = (cursor / (s.n - 1)) * W
  return (
    <svg className="cv-strip" viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" aria-hidden="true">
      <Bands s={s} />
      <rect x={Math.max(0, Math.min(W - 3, cx))} y="0" width="3" height="14" className="cur" />
    </svg>
  )
}

/**
 * Sky map: a compass seen from above the rover. North is up, the dashed ring is the flat horizon and the centre
 * is straight overhead; low objects sit near the ring (the scale is stretched so polar Sun and Earth, a few degrees
 * up, are easy to tell apart). Lines are their paths across the whole stay; dots are where they are now.
 */
const SKY_R = 44
const skyXY = (el: number, az: number) => {
  const r = SKY_R * Math.max(0, Math.min(1.12, 1 - el / 30)) * 0.86
  const a = (az * Math.PI) / 180
  return [r * Math.sin(a), -r * Math.cos(a)] as const
}
const SkyPaths = memo(function SkyPaths({ s }: { s: Series }) {
  const step = Math.max(1, Math.round(s.n / 240))
  const path = (el: Float32Array, az: Float32Array) => {
    let d = '', pen = false
    for (let i = 0; i < s.n; i += step) {
      if (isNaN(el[i])) { pen = false; continue }
      const [x, y] = skyXY(el[i], az[i])
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); pen = true
    }
    return d
  }
  return (<><path d={path(s.sunEl, s.sunAz)} className="sun" /><path d={path(s.earthEl, s.earthAz)} className="earth" /></>)
})
function SkyDial({ s, i }: { s: Series; i: number }) {
  if (i < 0 || i >= s.n || isNaN(s.sunEl[i])) return null
  const [sx, sy] = skyXY(s.sunEl[i], s.sunAz[i]), [ex, ey] = skyXY(s.earthEl[i], s.earthAz[i])
  const hz = SKY_R * 0.86
  return (
    <svg className="cv-dial" viewBox={`${-SKY_R - 8} ${-SKY_R - 8} ${2 * SKY_R + 16} ${2 * SKY_R + 16}`} role="img"
      aria-label={`Sky map: Sun ${s.sunEl[i].toFixed(1)} degrees up, Earth ${s.earthEl[i].toFixed(1)} degrees up`}>
      <title>Sky map — north up, the dashed ring is the horizon, the centre is straight up. Lines: paths across the stay. Dots: now.</title>
      <circle r={SKY_R + 6} className="bg" />
      <circle r={hz} className="hz" />
      <circle r={hz * 0.5} className="ring" />
      {(['N', 'E', 'S', 'W'] as const).map((l, k) => { const a = (k * Math.PI) / 2; return <text key={l} x={Math.sin(a) * (SKY_R + 1)} y={-Math.cos(a) * (SKY_R + 1) + 3} className="lbl">{l}</text> })}
      <SkyPaths s={s} />
      <circle cx={ex} cy={ey} r={4.2} className={'now earth' + (s.earthUp[i] ? '' : ' off')} />
      <circle cx={sx} cy={sy} r={5} className={'now sun' + (s.sunFrac[i] > 0 ? '' : ' off')} />
      <path d="M0 -3.5 L2.6 3 L0 1.6 L-2.6 3 Z" className="me" />
    </svg>
  )
}

/** A button that acts for as long as it is held (pointer, touch or keyboard). */
function Hold({ label, onStart, onStop, children, className = '' }: { label: string; onStart: () => void; onStop: () => void; children: React.ReactNode; className?: string }) {
  const on = useRef(false)
  const start = () => { if (!on.current) { on.current = true; onStart() } }
  const stop = () => { if (on.current) { on.current = false; onStop() } }
  return (
    <button type="button" className={'cv-padb ' + className} aria-label={label} title={label}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); start() }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start() } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop() }} onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}>{children}</button>
  )
}

export interface CompareViewProps {
  r: RankedSite
  rank: number
  options: RankedSite[]
  series: Series | null
  moon: MoonData | null
  landingMs: number
  days: number
  cursorMs: number
  /** Delay before this view starts its engine, so the views do not load their terrain at the same moment. */
  delay: number
  expanded: boolean
  /** Another view is expanded, or a dialog covers the page: stop drawing. */
  paused: boolean
  /** Bumped by the page to play the cinematic introduction. */
  introRun: number
  introDelay: number
  onSwap: (id: string) => void
  onDetails: () => void
  onExpand: () => void
}

/** One window of the split screen: a live rover view of one ranked site, with what the sky is doing right now. */
export function CompareView({ r, rank, options, series, moon, landingMs, days, cursorMs, delay, expanded, paused, introRun, introDelay, onSwap, onDetails, onExpand }: CompareViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const eng = useRef<ExplorerEngine | null>(null)
  const [ready, setReady] = useState(0)
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [hover, setHover] = useState(false)
  const [phase, setPhase] = useState<CinePhase | null>(null)
  const [cam, setCam] = useState<'chase' | 'mast'>('chase')
  const drive = useRef({ f: 0, b: 0, l: 0, r: 0 })
  const repeat = useRef(0)

  useEffect(() => {
    let e: ExplorerEngine | null = null
    const t = setTimeout(() => {
      if (!host.current) return
      try {
        e = new ExplorerEngine(host.current, { onSelect: () => {}, onPick: () => {}, onHover: () => {}, onStatus: setStatus })
        e.keysEnabled = false
        // four engines share one GPU: lighter mesh, capped pixel ratio, only the rover square pre-built, slower shadow refresh
        // several engines share one GPU and one main thread: draw only when something changes (else 1 fps),
        // one terrain worker (no pre-building), lighter mesh, pixel ratio 1, slower shadow refresh
        e.setPerformance({ pixelRatio: 1, roverMesh: 640, prefetch: [], maxFps: 20, visMs: 400, idleFps: 1, skyScale: 3 })
        e.setOptions({ orbiter: false })
        e.setRoverModel(buildKuroRover())
        e.roverAction('lights')
        eng.current = e
        ;(host.current as unknown as { __kuro?: ExplorerEngine }).__kuro = e // for debugging in the console
        setReady((x) => x + 1)
      } catch { setWebgl(false) }
    }, delay)
    return () => { clearTimeout(t); clearInterval(repeat.current); e?.dispose(); eng.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (moon) eng.current?.setData(moon) }, [moon, ready])
  useEffect(() => {
    const e = eng.current
    if (!e) return
    // the terrain grid has no east or north at exactly ±90°, so a site on the pole is drawn ~450 m from it
    // (0.015°); every number on the page still comes from the site's own coordinates
    const lat = Math.max(-89.985, Math.min(89.985, r.site.lat))
    e.setSites([{ id: r.siteId, name: r.site.name, lat, lon: r.site.lon }], r.siteId)
    e.setMode('rover')
    e.focusSelected(true)
  }, [r.siteId, r.site.lat, r.site.lon, r.site.name, ready])
  useEffect(() => { eng.current?.setStay(landingMs, days) }, [landingMs, days, ready])
  useEffect(() => { eng.current?.setTime(cursorMs) }, [cursorMs, ready])
  useEffect(() => { eng.current?.setPaused(paused) }, [paused, ready])
  // the window being looked at (or the expanded one) draws at full rate; the others at a calm 24 fps
  useEffect(() => {
    const e = eng.current
    if (!e) return
    const focus = hover || expanded
    e.setPerformance({ maxFps: focus ? (isLite() ? 30 : 60) : 20, ...(expanded && !isLite() ? { pixelRatio: Math.min(window.devicePixelRatio, 1.5) } : {}) })
    if (!expanded) e.setPerformance({ pixelRatio: 1 })
    e.keysEnabled = focus
    if (!focus) (e as unknown as { input?: { keys: Set<string> } }).input?.keys.clear()
  }, [hover, expanded, ready])
  useEffect(() => {
    if (!introRun || !ready) return
    const t = setTimeout(() => { setCam('chase'); eng.current?.roverIntro((p) => setPhase(p === 'done' ? null : p)) }, introDelay)
    return () => clearTimeout(t)
  }, [introRun, ready, introDelay])

  const i = series ? Math.round((cursorMs - series.startMs) / series.stepMs) : -1
  const now = series ? sky(series, i) : null
  const applyDrive = () => { const d = drive.current; eng.current?.setVirtualDrive(d.f - d.b, d.r - d.l) }
  const held = (k: keyof typeof drive.current, v: number) => () => { drive.current[k] = v; applyDrive(); if (v) eng.current?.stopIntro() }
  const repeatFn = (fn: () => void) => () => { eng.current?.stopIntro(); fn(); clearInterval(repeat.current); repeat.current = window.setInterval(fn, 16) }
  const stopRepeat = () => clearInterval(repeat.current)

  const busy = status?.busy ?? (status?.blocked && status.blocked !== 'Pick a site first.' ? status.blocked : null)
  const score = r.score === null ? '—' : Math.round(r.score)
  const caption = phase === 'arrive' ? { k: `Rank ${String(rank).padStart(2, '0')} · ${score} / 100`, t: r.site.name }
    : phase === 'orbit' ? { k: 'The landing spot', t: r.slopeDeg === null ? 'Ground slope unknown here' : `Ground slope ${r.slopeDeg.toFixed(1)}° — ${r.slopeDeg <= 5 ? 'gentle' : r.slopeDeg < 15 ? 'moderate' : 'steep'}` }
    : phase === 'sun' && now ? { k: 'Where is the Sun?', t: `${now.sun.txt} · ${now.sunWhere}` }
    : phase === 'earth' && now ? { k: 'Where is Earth?', t: `${now.earth.txt} · ${now.earthWhere}` }
    : null

  return (
    <section className={'cv' + (rank === 1 ? ' first' : '') + (expanded ? ' expanded' : '') + (phase ? ' touring' : '')} aria-label={`Rank ${rank}: ${r.site.name}`}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <div className="cv-3d" ref={host} onDoubleClick={onExpand}>
        {!webgl && <p className="cv-msg">This browser cannot draw 3D (WebGL is off).</p>}
        {webgl && (!ready || busy) && <p className="cv-msg mono">{busy ?? 'Starting the rover view…'}</p>}
      </div>

      {caption && <div className="cv-cap" key={phase} aria-live="polite"><span className="mono">{caption.k}</span><b>{caption.t}</b></div>}

      <header className="cv-top">
        <span className="cv-rank mono" title="Rank among all scored South Pole sites">{String(rank).padStart(2, '0')}</span>
        <label className="cv-pick">
          <span className="cv-name" aria-hidden="true">{r.site.name}<ChevronDown size={15} /></span>
          <select value={r.siteId} onChange={(e) => onSwap(e.target.value)} aria-label={`Site shown in this window: ${r.site.name}. Choose another ranked site`}>
            {options.map((o, k) => <option key={o.siteId} value={o.siteId}>{k + 1}. {o.site.name}{o.score === null ? '' : ` — ${Math.round(o.score)}`}</option>)}
          </select>
        </label>
        <button type="button" className={'cv-expand' + (expanded ? ' on' : '')} onClick={onExpand} title={expanded ? 'Back to all four (Esc)' : 'Show this site full size'}>
          {expanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}<span>{expanded ? 'All sites' : 'Full size'}</span>
        </button>
        <span className="cv-score"><b>{score}</b><small className="mono">/100</small></span>
      </header>
      {series && <div className="cv-dialwrap"><SkyDial s={series} i={i} /><span className="mono"><i className="k sun" />Sun <i className="k earth" />Earth</span></div>}

      <div className="cv-tools">
        <button type="button" className="cv-tool" onClick={() => { setCam('chase'); eng.current?.roverIntro((p) => setPhase(p === 'done' ? null : p)) }} title="Replay the camera tour" aria-label="Replay the camera tour"><Clapperboard size={15} /></button>
        <button type="button" className={'cv-tool' + (cam === 'mast' ? ' on' : '')} onClick={() => { const e = eng.current; if (!e) return; e.stopIntro(); e.roverAction('cam'); setCam(e.roverCam()) }} title={cam === 'mast' ? 'Back to the chase camera' : 'See through the rover’s mast camera'} aria-label="Switch camera" aria-pressed={cam === 'mast'}><Camera size={15} /></button>
      </div>

      <div className="cv-pad" aria-label="Rover controls">
        <div className="cv-padgrid">
          <Hold label="Turn camera left" onStart={repeatFn(() => eng.current?.roverOrbit(-0.035))} onStop={stopRepeat}><RotateCcw size={14} /></Hold>
          <Hold label="Drive forward" onStart={held('f', 1)} onStop={held('f', 0)} className="drv"><ArrowUp size={15} /></Hold>
          <Hold label="Turn camera right" onStart={repeatFn(() => eng.current?.roverOrbit(0.035))} onStop={stopRepeat}><RotateCw size={14} /></Hold>
          <Hold label="Steer left" onStart={held('l', 1)} onStop={held('l', 0)} className="drv"><ArrowLeft size={15} /></Hold>
          <Hold label="Drive backward" onStart={held('b', 1)} onStop={held('b', 0)} className="drv"><ArrowDown size={15} /></Hold>
          <Hold label="Steer right" onStart={held('r', 1)} onStop={held('r', 0)} className="drv"><ArrowRight size={15} /></Hold>
        </div>
        <div className="cv-zoom">
          <Hold label="Zoom out" onStart={repeatFn(() => eng.current?.roverZoom(1.025))} onStop={stopRepeat}><Minus size={14} /></Hold>
          <span className="mono">zoom</span>
          <Hold label="Zoom in" onStart={repeatFn(() => eng.current?.roverZoom(0.975))} onStop={stopRepeat}><Plus size={14} /></Hold>
        </div>
      </div>

      <div className="cv-bottom">
        {now && (
          <div className="cv-sky">
            <span className={'cv-chip sun s' + now.sun.on} title={now.sunWhere}><Sun size={13} aria-hidden="true" />{now.sun.txt}<small className="mono">{now.sunWhere}</small></span>
            <span className={'cv-chip earth s' + now.earth.on} title={now.earthWhere}><Globe2 size={13} aria-hidden="true" />{now.earth.txt}<small className="mono">{now.earthWhere}</small></span>
          </div>
        )}
        <div className="cv-foot">
          <div className="cv-stay">
            <div className="cv-stats mono">
              <span><i className="k sun" />Sun {r.summary.sunPct.toFixed(0)}%</span>
              <span><i className="k earth" />Earth {r.summary.earthPct.toFixed(0)}%</span>
              <span>Slope {r.slopeDeg === null ? '—' : r.slopeDeg.toFixed(1) + '°'}</span>
            </div>
            {series && <Strip s={series} cursor={i} />}
          </div>
          <button className="cmpx-btn solid cv-det" onClick={onDetails}><Info size={14} aria-hidden="true" /> Details</button>
        </div>
      </div>
    </section>
  )
}
