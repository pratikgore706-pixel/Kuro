import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Camera, Gamepad2, Lightbulb, RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import type { ExplorerEngine, ViewMode } from './engine/ExplorerEngine'
import { ROVER_SPEEDS, type RoverSpeed, type RoverTelemetry } from './engine/Rover'
import { fmtLat, fmtLon } from '../data/sites'
import { useSignal, type Signal } from './signal'

/** Virtual joystick: drag the knob; releases to centre. Writes x/y (−1…1) to the engine. */
function Stick({ onMove, label }: { onMove: (x: number, y: number) => void; label: string }) {
  const base = useRef<HTMLDivElement>(null)
  const [p, setP] = useState<[number, number]>([0, 0])
  const id = useRef<number | null>(null)
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l }
    setP([x, y]); onMove(x, y)
  }
  const end = () => { id.current = null; setP([0, 0]); onMove(0, 0) }
  return (
    <div ref={base} className="pad-stick" role="slider" aria-label={label} aria-valuetext={`x ${p[0].toFixed(2)}, y ${p[1].toFixed(2)}`} tabIndex={-1}
      onPointerDown={(e) => { e.preventDefault(); id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); set(e) }}
      onPointerMove={(e) => id.current === e.pointerId && set(e)} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <i className="ring" /><i className="knob" style={{ transform: `translate(${p[0] * 34}px, ${p[1] * 34}px)` }} />
      <span>{label}</span>
    </div>
  )
}

/** Press-and-hold button that sets one engine axis while held. */
function Hold({ onHold, children, label }: { onHold: (on: boolean) => void; children: React.ReactNode; label: string }) {
  return (
    <button className="pad-btn" aria-label={label} title={label}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onHold(true) }} onPointerUp={() => onHold(false)} onPointerCancel={() => onHold(false)} onLostPointerCapture={() => onHold(false)} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  )
}

export function Controls({ engine, mode }: { engine: ExplorerEngine | null; mode: ViewMode }) {
  const [pad, setPad] = useState<string | null>(null)
  useEffect(() => { const t = setInterval(() => setPad(engine?.gamepad ?? null), 1000); return () => clearInterval(t) }, [engine])
  if (!engine || !(mode === 'drone' || mode === 'rover' || mode === 'surface')) return null
  const v = (x: Partial<Parameters<ExplorerEngine['setVirtual']>[0]>) => engine.setVirtual(x)
  return (
    <div className="pad glass" data-occlude aria-label="On-screen controls">
      <Stick label={mode === 'rover' ? 'Drive' : mode === 'surface' ? 'Walk' : 'Fly'} onMove={(x, y) => v({ x, y })} />
      <div className="pad-col">
        {mode === 'drone' && (
          <>
            <Hold label="Climb" onHold={(on) => v({ lift: on ? 1 : 0 })}><ArrowUp size={16} /></Hold>
            <Hold label="Descend" onHold={(on) => v({ lift: on ? -1 : 0 })}><ArrowDown size={16} /></Hold>
          </>
        )}
        <div className="pad-row">
          <Hold label={mode === 'surface' ? 'Look left' : 'Turn left'} onHold={(on) => v({ turn: on ? -1 : 0 })}><RotateCcw size={16} /></Hold>
          <Hold label={mode === 'surface' ? 'Look right' : 'Turn right'} onHold={(on) => v({ turn: on ? 1 : 0 })}><RotateCw size={16} /></Hold>
        </div>
        {mode === 'drone' && <Hold label="Hold for speed boost" onHold={(on) => v({ boost: on })}>×3</Hold>}
      </div>
      <p className="pad-hint">{pad ? <><Gamepad2 size={13} aria-hidden="true" /> {pad.slice(0, 28)}</> : mode === 'rover' ? 'W S drive · A D steer · Space brake · C camera · L lights' : mode === 'drone' ? 'W A S D fly · E/Space up · Q down · ← → turn' : 'W A S D walk · arrows or drag to look'}</p>
    </div>
  )
}

export function RoverHud({ engine, telemetry }: { engine: ExplorerEngine | null; telemetry: Signal<RoverTelemetry | null> }) {
  const t = useSignal(telemetry)
  if (!engine || !t) return null
  const kmh = t.speedMps * 3.6
  return (
    <section className="rover-hud glass" data-occlude aria-label="Rover telemetry">
      <header>
        <b>Rover</b>
        <span className="mono dim">{fmtLat(t.lat, 3)} {fmtLon(t.lon, 3)}</span>
      </header>
      <div className="rh-grid">
        <div><span>Speed</span><b className="mono">{t.speedMps < 1 ? `${t.speedMps.toFixed(2)} m/s` : `${kmh.toFixed(1)} km/h`}</b>{t.timeScale > 1 && <small>time-lapse ×{t.timeScale}</small>}</div>
        <div><span>Heading</span><b className="mono">{t.headingDeg.toFixed(0)}°</b></div>
        <div><span>Slope here</span><b className={'mono' + (t.slopeDeg > 15 ? ' warn' : '')}>{t.slopeDeg.toFixed(1)}°</b></div>
        <div><span>Elevation</span><b className="mono">{t.elevM >= 0 ? '+' : ''}{Math.round(t.elevM)} m</b></div>
        <div><span>Driven</span><b className="mono">{t.distM < 1000 ? `${t.distM.toFixed(0)} m` : `${(t.distM / 1000).toFixed(2)} km`}</b></div>
        <div className={t.sunFrac > 0 ? 'sun on' : 'sun'}><span>Sun</span><b className="mono">{t.sunFrac >= 0.999 ? 'full' : t.sunFrac > 0 ? `${(t.sunFrac * 100).toFixed(0)}%` : 'shadow'}</b><small>{t.sunEl.toFixed(1)}° up</small></div>
        <div className={t.earthUp ? 'earth on' : 'earth'}><span>Earth link</span><b className="mono">{t.earthUp ? 'in view' : 'blocked'}</b><small>{t.earthEl.toFixed(1)}° up</small></div>
        <div><span>Battery <small>(illustrative)</small></span><b className={'mono' + (t.battery < 20 ? ' warn' : '')}>{t.battery.toFixed(0)}%</b><i className="bat"><i style={{ width: `${t.battery}%` }} /></i></div>
      </div>
      {t.blocked && <p className="rh-warn" role="alert">{t.blocked}</p>}
      <div className="rh-actions">
        <select value={ROVER_SPEEDS.find((s) => s.scale === t.timeScale)?.id} onChange={(e) => engine.roverAction('speed', e.target.value as RoverSpeed)} aria-label="Rover speed">
          {ROVER_SPEEDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button className="btn" onClick={() => engine.roverAction('cam')}><Camera size={14} aria-hidden="true" /> {t.cam === 'chase' ? 'Mast camera' : 'Chase camera'}</button>
        <button className={'btn' + (t.lights ? ' primary' : '')} onClick={() => engine.roverAction('lights')} aria-pressed={t.lights}><Lightbulb size={14} aria-hidden="true" /> Lights</button>
        <button className="btn" onClick={() => engine.roverAction('reset')}><Undo2 size={14} aria-hidden="true" /> Back to site</button>
      </div>
    </section>
  )
}
