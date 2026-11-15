import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Camera, ChevronLeft, ChevronRight, Crosshair, Flag, Gamepad2, Lightbulb, Navigation, Pause, Play, RotateCcw, RotateCw, Search, Square, Undo2 } from 'lucide-react'
import type { ExplorerEngine, ViewMode } from './engine/ExplorerEngine'
import { ROVER_SPEEDS, type RoverSpeed, type RoverTelemetry } from './engine/Rover'
import { SITES, fmtLat, fmtLon } from '../data/sites'
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
      <p className="pad-hint">{pad ? <><Gamepad2 size={13} aria-hidden="true" /> {pad.slice(0, 28)}</> : mode === 'rover' ? 'W S drive, A D steer, Space brake, C camera, L lights' : mode === 'drone' ? 'W A S D fly, E or Space up, Q down, ← → turn' : 'W A S D walk, arrows or drag to look'}</p>
    </div>
  )
}

/** "-85.3, 30.1", "85.3S 30.1E", "85.3 S, 30.1 E" → [lat, lon]; null if it is not a coordinate. */
export function parseLatLon(q: string): [number, number] | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/)
  if (!m) return null
  let lat = Number(m[1]), lon = Number(m[3])
  if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat)
  if (m[4] && /w/i.test(m[4])) lon = -Math.abs(lon)
  if (Math.abs(lat) > 90 || Math.abs(lon) > 360) return null
  return [lat, lon > 180 ? lon - 360 : lon]
}

const fmtDist = (m: number) => (m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`)
const fmtEta = (s: number) => (s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(0)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`)

/** Destination mode: search known places or type coordinates, or click the ground; the rover drives itself there. */
function GoTo({ engine, t }: { engine: ExplorerEngine; t: RoverTelemetry }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const places = SITES
  const coord = parseLatLon(q)
  const hits = q.trim() && !coord ? places.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : []
  const go = (lat: number, lon: number, name: string) => { engine.roverGoto(lat, lon, name); setQ(''); setErr(null) }
  const submit = () => {
    if (coord) return go(coord[0], coord[1], `${fmtLat(coord[0], 3)} ${fmtLon(coord[1], 3)}`)
    if (hits[0]) return go(hits[0].lat, hits[0].lon, hits[0].name)
    setErr('Type a place name, or coordinates such as -85.3, 30.1')
  }
  const d = t.dest
  return (
    <div className="rh-goto">
      <form className="rh-search" onSubmit={(e) => { e.preventDefault(); submit() }} role="search">
        <Search size={14} aria-hidden="true" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setErr(null) }} placeholder="Search a site, or type lat, lon" aria-label="Destination" />
        <button type="submit" className="btn primary" disabled={!q.trim()}><Navigation size={13} aria-hidden="true" /> Go</button>
      </form>
      {hits.length > 0 && (
        <ul className="rh-hits" role="listbox" aria-label="Matching places">
          {hits.map((p) => <li key={p.id}><button type="button" onClick={() => go(p.lat, p.lon, p.name)}><b>{p.name}</b><span className="mono">{fmtLat(p.lat, 2)} {fmtLon(p.lon, 2)}</span></button></li>)}
        </ul>
      )}
      {coord && <p className="rh-note mono">Drive to {fmtLat(coord[0], 3)} {fmtLon(coord[1], 3)} — press Go</p>}
      {err && <p className="rh-note warn">{err}</p>}
      <button className={'btn rh-pick' + (t.picking ? ' primary' : '')} onClick={() => engine.roverPick(!t.picking)} aria-pressed={t.picking}>
        <Crosshair size={13} aria-hidden="true" /> {t.picking ? 'Click the ground to set the destination…' : 'Pick a point on the ground'}
      </button>
      {d && (
        <div className={'rh-dest ' + d.status}>
          <div className="rh-dest-h"><Flag size={14} aria-hidden="true" /><b>{d.name}</b></div>
          <div className="rh-dest-g mono">
            <span>{fmtDist(d.distM)}<small>to go</small></span>
            <span>{d.bearingDeg.toFixed(0)}°<small>bearing</small></span>
            <span>{d.status === 'arrived' ? '—' : fmtEta(d.etaS)}<small>{t.timeScale > 1 ? `at ×${t.timeScale}` : 'at 0.2 m/s'}</small></span>
          </div>
          <p className="rh-note">{d.status === 'arrived' ? 'Arrived.' : d.status === 'blocked' ? 'Stopped: every way ahead is steeper than the rover can climb. Drive around it by hand, then resume.' : d.status === 'paused' ? 'Paused.' : 'Driving on autopilot, steering around slopes over 22°. Any drive key takes over.'}</p>
          <div className="rh-dest-a">
            {d.status === 'driving' ? <button className="btn" onClick={() => engine.roverPause(true)}><Pause size={13} aria-hidden="true" /> Pause</button>
              : d.status !== 'arrived' ? <button className="btn" onClick={() => engine.roverPause(false)}><Play size={13} aria-hidden="true" /> Resume</button> : null}
            <button className="btn" onClick={() => engine.roverStop()}><Square size={13} aria-hidden="true" /> Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RoverHud({ engine, telemetry, open = true, onOpen }: { engine: ExplorerEngine | null; telemetry: Signal<RoverTelemetry | null>; open?: boolean; onOpen?: (open: boolean) => void }) {
  const t = useSignal(telemetry)
  const [tab, setTab] = useState<'free' | 'goto'>('free')
  if (!engine || !t) return null
  const kmh = t.speedMps * 3.6
  // tucked away: a slim tab on the right edge that still shows Sun and Earth at a glance
  if (!open) return (
    <button className="rh-edge" data-occlude onClick={() => onOpen?.(true)} aria-label="Show the rover dashboard" title="Show the rover dashboard">
      <ChevronLeft size={15} aria-hidden="true" />
      <i className={'dot sun' + (t.sunFrac > 0 ? ' on' : '')} title={t.sunFrac > 0 ? 'Sun up' : 'In shadow'} />
      <i className={'dot earth' + (t.earthUp ? ' on' : '')} title={t.earthUp ? 'Earth in view' : 'Earth blocked'} />
      <span className="lbl">Rover</span>
    </button>
  )
  return (
    <section className="rover-hud glass" data-occlude aria-label="Rover telemetry">
      <header>
        <b>Rover</b>
        <span className="mono dim">{fmtLat(t.lat, 3)} {fmtLon(t.lon, 3)}</span>
        {onOpen && <button className="rh-hide" onClick={() => onOpen(false)} aria-label="Hide the rover dashboard" title="Hide this panel to see more of the ground"><ChevronRight size={15} /></button>}
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
      <div className="rh-tabs" role="tablist" aria-label="Driving mode">
        <button role="tab" aria-selected={tab === 'free'} className={tab === 'free' ? 'on' : ''} onClick={() => { setTab('free'); engine.roverPick(false) }}><Gamepad2 size={13} aria-hidden="true" /> Free drive</button>
        <button role="tab" aria-selected={tab === 'goto'} className={tab === 'goto' ? 'on' : ''} onClick={() => setTab('goto')}><Navigation size={13} aria-hidden="true" /> Destination</button>
      </div>
      {tab === 'goto' && <GoTo engine={engine} t={t} />}
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
