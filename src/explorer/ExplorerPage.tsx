import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CarFront, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Compass, Crosshair, Globe2, Keyboard, Layers, Link2, Map as MapIcon, MapPin, Maximize2, Minimize2, Moon, Mountain, Plane, RotateCcw, Ruler, Sun, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Astronaut, Satellite } from '../components/Art'
import { SiteList } from '../components/SiteList'
import { SitePanel } from '../components/SitePanel'
import { SkyChart } from '../components/SkyChart'
import { TimeBar } from '../components/TimeBar'
import { SITES, fmtLat, fmtLon } from '../data/sites'
import { DAY } from '../engine/time'
import { useEvents, useHorizon, useSeries, useSkyAt } from '../hooks'
import { useSite, useStore } from '../store'
import { ExplorerEngine, type EngineStatus, type HoverInfo, type Lighting, type MapKind, type MeasureResult, type ViewMode } from './engine/ExplorerEngine'
import type { LayerId } from './engine/glsl'
import { LAYERS, gradient, isTerrainView } from './legend'
import { Controls, RoverHud } from './Controls'
import type { RoverTelemetry } from './engine/Rover'
import { HoverHud, MeasurePanel, ScaleBar, Tour, type TourStep } from './Overlays'
import { signal } from './signal'

type ViewDef = { id: ViewMode; label: string; hint: string; icon: typeof Globe2 }
/** Views ordered by scale, in three groups: the whole Moon, the polar terrain, and on the ground. Keys 1–5 select them. */
const VIEW_GROUPS: ViewDef[][] = [
  [
    { id: 'globe', label: 'Globe', hint: 'The whole Moon in 3D', icon: Globe2 },
    { id: 'map', label: 'Map', hint: 'The Moon unrolled, or the pole from above', icon: MapIcon },
  ],
  [
    { id: 'pole', label: 'Pole', hint: 'The South Pole in 3D: 600 km of LOLA terrain', icon: Mountain },
    { id: 'drone', label: 'Drone', hint: 'Fly low over the selected site', icon: Plane },
  ],
  [
    { id: 'rover', label: 'Rover', hint: 'Drive a rover across the real terrain', icon: CarFront },
  ],
]
const VIEWS = VIEW_GROUPS.flat()
const MODES = VIEWS.map((v) => v.id)

function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, set] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init } catch { return init } })
  return [v, (x: T) => { set(x); try { localStorage.setItem(key, JSON.stringify(x)) } catch { /* storage unavailable */ } }]
}

export function ExplorerPage() {
  const root = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<ExplorerEngine | null>(null)
  const site = useSite()
  const { landingMs, days, cursorMs, custom, moon } = useStore()
  const { selectSite, addCustom, setLanding, setDays, setCursor } = useStore()
  const [params] = useSearchParams()
  const [storedMode, setMode] = useLocal<ViewMode>('kuro.view', 'globe')
  // views that no longer exist (the old standing view) fall back to the globe
  const mode: ViewMode = MODES.includes(storedMode) ? storedMode : 'globe'
  const [mapKind, setMapKind] = useLocal<MapKind>('kuro.mapKind', 'global')
  const [layers, setLayers] = useLocal<Record<'space' | 'terrain' | 'ground', LayerId>>('kuro.layers4', { space: 'imagery', terrain: 'imagery', ground: 'imagery' })
  const [lighting, setLighting] = useLocal<Lighting>('kuro.light', 'sun')
  const [exag, setExag] = useLocal('kuro.exag2', { globe: 4, terrain: 1.5 })
  const [opts, setOpts] = useLocal('kuro.opts4', { grid: false, labels: true, contours: false, autoRotate: false, fill: true, paths: true, orbiter: true, micro: true })
  const [panels, setPanels] = useLocal('kuro.panels2', { sites: false, info: true, layers: true, sky: false })
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [help, setHelp] = useState(false)
  const [webgl, setWebgl] = useState(true)
  const [measuring, setMeasuring] = useState(false)
  const [measure, setMeasure] = useState<MeasureResult | null>(null)
  const [tour, setTour] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [, force] = useState(0)
  // fast-changing values go through signals so the page (and its charts) does not re-render on every pointer move
  const hoverSig = useMemo(() => signal<HoverInfo | null>(null), [])
  const roverSig = useMemo(() => signal<RoverTelemetry | null>(null), [])

  const horizon = useHorizon(site)
  const { series, summary } = useSeries(site, landingMs, days)
  const sky = useSkyAt(site, cursorMs)
  const events = useEvents(site, cursorMs)
  const marks = useMemo(() => [...SITES, ...custom].map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })), [custom])
  const terrainView = isTerrainView(mode, mapKind)
  const family = mode === 'rover' || mode === 'surface' ? 'ground' : terrainView ? 'terrain' : 'space'
  const setLayer = (l: LayerId) => setLayers({ ...layers, [family]: l })
  const offered = LAYERS.filter((l) => !l.terrainOnly || terrainView)
  // anything no longer on the menu (or a stay layer outside the terrain views) falls back to the real Moon
  const effLayer: LayerId = offered.some((l) => l.id === layers[family]) ? layers[family] : 'imagery'

  // a shared link (#/explorer?site=…&view=…) opens exactly that view
  useEffect(() => {
    const g = (k: string) => params.get(k)
    const sid = g('site'); if (sid && [...SITES, ...custom].some((s) => s.id === sid)) selectSite(sid)
    const v = g('view') as ViewMode | null; if (v && MODES.includes(v)) setMode(v)
    const mk = g('map'); if (mk === 'global' || mk === 'pole') setMapKind(mk)
    const lt = g('light'); if (lt === 'sun' || lt === 'full') setLighting(lt)
    const ld = g('land'); if (ld && !isNaN(Date.parse(ld))) setLanding(Date.parse(ld))
    const dd = Number(g('days')); if (dd > 0 && dd <= 60) setDays(dd)
    const at = g('at'); if (at && !isNaN(Date.parse(at))) setCursor(Date.parse(at))
    const ly = g('layer') as LayerId | null
    if (ly && LAYERS.some((l) => l.id === ly)) { const fam = v === 'rover' || v === 'surface' ? 'ground' : v === 'globe' || (v === 'map' && mk !== 'pole') ? 'space' : 'terrain'; setLayers({ ...layers, [fam]: ly }) }
    if (g('tour') !== null) setTour(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!host.current) return
    try {
      engine.current = new ExplorerEngine(host.current, {
        onSelect: selectSite,
        onPick: (lat, lon) => addCustom(lat, lon),
        onHover: hoverSig.set,
        onStatus: setStatus,
        onRover: roverSig.set,
        onMeasure: setMeasure,
        onMeasureMode: setMeasuring,
      })
      force((x) => x + 1)
    } catch { setWebgl(false) }
    return () => { engine.current?.dispose(); engine.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const e = engine.current
  useEffect(() => { if (moon) engine.current?.setData(moon) }, [moon])
  useEffect(() => { engine.current?.setSites(marks, site.id) }, [marks, site.id])
  useEffect(() => { engine.current?.setMapKind(mapKind) }, [mapKind])
  useEffect(() => { engine.current?.setMode(mode) }, [mode])
  useEffect(() => { engine.current?.setLayer(effLayer) }, [effLayer])
  useEffect(() => { engine.current?.setExaggeration(exag.globe, exag.terrain) }, [exag])
  useEffect(() => { engine.current?.setOptions(opts) }, [opts])
  useEffect(() => { engine.current?.setLighting(lighting) }, [lighting])
  useEffect(() => { engine.current?.setTime(cursorMs) }, [cursorMs])
  useEffect(() => { engine.current?.setStay(landingMs, days) }, [landingMs, days])
  // fly to a newly chosen site; a change of view starts from that view's own overview
  useEffect(() => { engine.current?.focusSelected() }, [site.id])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (panels.sites) setPanels({ ...panels, sites: false }) }, [site.id])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t) }, [toast])
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])

  // keys 1–5 switch views, T starts the tour (ignored while typing)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      if (ev.metaKey || ev.ctrlKey || ev.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))) return
      const i = Number(ev.key) - 1
      if (i >= 0 && i < VIEWS.length) setMode(VIEWS[i].id)
      if (ev.key === '?') setHelp((h) => !h)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const def = LAYERS.find((l) => l.id === effLayer)!
  const elevRange = moon?.global ? [moon.global.minM, moon.global.maxM] : null
  const missing = moon && moon.missing.length ? moon.missing : null

  const shot = () => {
    const url = e?.screenshot()
    if (!url) return
    const a = document.createElement('a')
    a.href = url; a.download = `kuro-${mode}-${site.name.replace(/\W+/g, '-').toLowerCase()}.png`; a.click()
  }
  const share = async () => {
    const q = new URLSearchParams({ site: site.id, view: mode, layer: effLayer, light: lighting, land: new Date(landingMs).toISOString(), days: String(days), at: new Date(cursorMs).toISOString() })
    if (mode === 'map') q.set('map', mapKind)
    const url = `${location.origin}${location.pathname}#/explorer?${q.toString()}`
    try { await navigator.clipboard.writeText(url); setToast('Link to this view copied') } catch { window.prompt('Copy this link', url) }
  }
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void root.current?.requestFullscreen?.() }

  const tourSteps: TourStep[] = [
    { title: 'The Moon, all of it', text: 'Every crater here is real: NASA’s LRO camera mosaic draped over LOLA laser-altimeter heights. Drag to turn it, scroll to zoom; the picture sharpens as you get closer.', apply: () => { selectSite('a11'); setMode('globe'); setLighting('full'); setLayers({ ...layers, space: 'imagery' }) } },
    { title: 'Colour shows height', text: 'Violet is low, gold is high. The South Pole–Aitken basin, one of the largest impact basins in the Solar System, is the great violet scar across the southern far side.', apply: () => { selectSite('ce4'); setMode('globe'); setLighting('full'); setLayers({ ...layers, space: 'colour' }) } },
    { title: 'Sunlight from the side', text: 'At the South Pole the Sun never rises more than about 1.5° above a flat horizon. Crater floors can stay dark for billions of years while nearby ridges are lit for most of the year.', apply: () => { selectSite('shackleton'); setMode('pole'); setLighting('sun'); setLayers({ ...layers, terrain: 'sun' }) } },
    { title: 'Light across a whole stay', text: 'This layer traces terrain shadows through the chosen stay. Bright ridges keep a lander’s solar panels powered; dark floors mean batteries and heaters.', apply: () => { selectSite('shackleton'); setMode('pole'); setLighting('sun'); setLayers({ ...layers, terrain: 'sunStay' }) } },
    { title: 'Fly over Mons Mouton', text: 'IM-2 Athena touched down here on 6 March 2025. Fly with W A S D, climb with E or Space, descend with Q, turn with the arrow keys. Zoom in and the terrain sharpens.', apply: () => { selectSite('im2'); setMode('drone'); setLighting('sun'); setLayers({ ...layers, terrain: 'imagery' }) } },
    { title: 'Drive a rover', text: 'W and S drive, A and D steer, Space brakes. The amber and blue arcs in the sky are the Sun’s and Earth’s paths across your stay; the rover reports sunlight and Earth contact where it stands, traced from LOLA terrain out to 300 km.', apply: () => { selectSite('im2'); setMode('rover'); setLighting('sun'); setLayers({ ...layers, ground: 'imagery' }) } },
  ]

  const toggles = ([
    ['labels', 'Labels', true], ['grid', 'Grid', true], ['contours', 'Contours', terrainView],
    ['autoRotate', 'Auto-orbit', mode === 'globe' || mode === 'pole' || mode === 'drone'],
    ['orbiter', 'Orbiter', mode === 'globe'], ['paths', 'Sun & Earth paths', mode === 'rover'],
    ['micro', 'Micro-relief', mode === 'rover' || mode === 'drone'],
  ] as const).filter((t) => t[2])

  return (
    <main ref={root} className={`xp mode-${mode}${panels.info ? '' : ' info-closed'}`}>
      <div ref={host} className="xp-stage" />
      {!webgl && <div className="xp-block"><Astronaut size={140} /><h2>3D needs WebGL</h2><p>This device could not start WebGL. The sky chart, site conditions and comparison still work.</p></div>}
      {status?.blocked && (
        <div className="xp-block" role="status">
          <Astronaut size={150} />
          <h2>{status.blocked.startsWith('Pick') ? 'Choose a site' : 'Elevation data needed'}</h2>
          <p>{status.blocked}</p>
          {!status.blocked.startsWith('Pick') && <pre>npm run fetch:moon</pre>}
          <button className="btn" onClick={() => setMode('globe')}>Back to the globe</button>
        </div>
      )}
      {status?.busy && <div className="xp-busy" role="status"><Satellite size={26} />{status.busy}</div>}

      {/* docked toolbar: views, then tools */}
      <nav className="xp-rail" aria-label="Explorer" data-occlude>
        {VIEW_GROUPS.map((g, gi) => (
          <div className="xp-rgrp" key={gi}>
            {g.map((v) => {
              const Icon = v.icon, n = VIEWS.indexOf(v) + 1, on = mode === v.id
              return (
                <div key={v.id} className="xp-ritem">
                  <button className={'xp-rbtn' + (on ? ' on' : '')} onClick={() => setMode(v.id)} aria-pressed={on} aria-keyshortcuts={String(n)} data-tip={`${v.hint} · ${n}`}>
                    <Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{v.label}</span>
                  </button>
                  {v.id === 'map' && on && (
                    <div className="xp-rsub" role="radiogroup" aria-label="Map extent">
                      <button role="radio" aria-checked={mapKind === 'global'} className={mapKind === 'global' ? 'on' : ''} onClick={() => setMapKind('global')}>Moon</button>
                      <button role="radio" aria-checked={mapKind === 'pole'} className={mapKind === 'pole' ? 'on' : ''} onClick={() => setMapKind('pole')}>Pole</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div className="xp-rgrp tools">
          <button className={'xp-rbtn sm' + (measuring || measure ? ' on' : '')} onClick={() => e?.setMeasuring(!measuring)} aria-pressed={measuring} data-tip="Measure distance and elevation profile · M"><Ruler size={17} strokeWidth={1.7} aria-hidden="true" /><span>Measure</span></button>
          <button className={'xp-rbtn sm' + (tour !== null ? ' on' : '')} onClick={() => { if (tour === null) { e?.setMeasuring(false); e?.clearMeasure() } setTour(tour === null ? 0 : null) }} data-tip="Guided tour of the explorer"><Compass size={17} strokeWidth={1.7} aria-hidden="true" /><span>Tour</span></button>
        </div>
        <div className="xp-rgrp tools end">
          <button className="xp-ricon" onClick={() => e?.focusSelected()} data-tip="Go to the selected site · F" aria-label="Go to the selected site"><Crosshair size={16} /></button>
          <button className="xp-ricon" onClick={() => e?.resetView()} data-tip="Reset view · R" aria-label="Reset view"><RotateCcw size={16} /></button>
          <button className="xp-ricon" onClick={shot} data-tip="Save a picture of this view" aria-label="Save a picture of this view"><Camera size={16} /></button>
          <button className="xp-ricon" onClick={share} data-tip="Copy a link to this exact view" aria-label="Copy a link to this view"><Link2 size={16} /></button>
          <button className="xp-ricon" onClick={fullscreen} data-tip={full ? 'Exit full screen' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button className={'xp-ricon' + (help ? ' on' : '')} onClick={() => setHelp(!help)} data-tip="Controls · ?" aria-label="Show controls" aria-expanded={help}><Keyboard size={16} /></button>
        </div>
      </nav>

      {/* left column: sites, then layers */}
      <div className="xp-colL">
        <div className="xp-picker" data-occlude>
          <button className="xp-pick glass" onClick={() => setPanels({ ...panels, sites: !panels.sites })} aria-expanded={panels.sites} aria-haspopup="dialog">
            <MapPin size={16} aria-hidden="true" />
            <span><b>{site.name}</b><small className="mono">{fmtLat(site.lat, 2)} {fmtLon(site.lon, 2)}</small></span>
            {panels.sites ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
          {panels.sites && <div className="xp-panel glass xp-pop" role="dialog" aria-label="Choose a site"><SiteList /></div>}
        </div>
        <section className={'xp-layers glass' + (panels.layers ? '' : ' min')} aria-label="Map layers" data-occlude>
          <header>
            <button className="xp-h" onClick={() => setPanels({ ...panels, layers: !panels.layers })} aria-expanded={panels.layers}><Layers size={15} aria-hidden="true" /> Layers</button>
            <span className="xp-cur">{def.label}</span>
          </header>
          {panels.layers && (
            <>
              {(['surface', 'mission'] as const).map((g) => (
                <div className="xp-lgroup" key={g}>
                  <p className="xp-lgh">{g === 'surface' ? 'Surface' : 'Sun and Earth'}</p>
                  <div className="xp-chips" role="radiogroup" aria-label={g === 'surface' ? 'Surface layers' : 'Sun and Earth layers'}>
                    {offered.filter((l) => l.group === g).map((l) => (
                      <button key={l.id} role="radio" aria-checked={effLayer === l.id} className={'chip-l' + (effLayer === l.id ? ' on' : '')} onClick={() => setLayer(l.id)} title={l.hint}>
                        <i style={{ background: l.ramp ? gradient(l.ramp) : l.swatch }} />
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="xp-light" role="radiogroup" aria-label="Lighting">
                <button role="radio" aria-checked={lighting === 'sun'} className={lighting === 'sun' ? 'on' : ''} onClick={() => setLighting('sun')} title="Lit by the real Sun at the chosen time, with night side and shadows"><Sun size={14} aria-hidden="true" /> Real Sun</button>
                <button role="radio" aria-checked={lighting === 'full'} className={lighting === 'full' ? 'on' : ''} onClick={() => setLighting('full')} title="Evenly lit everywhere, like a full Moon. Data layers and the sky stay real."><Moon size={14} aria-hidden="true" /> Full Moon</button>
              </div>
              <div className="xp-legend">
                {def.ramp && <div className="bar" style={{ background: gradient(def.ramp) }} />}
                {def.ramp && (
                  <div className="ends mono">
                    {def.id === 'colour' ? <><span>{elevRange ? `${(elevRange[0] / 1000).toFixed(1)} km` : '—'}</span><span>{elevRange ? `+${(elevRange[1] / 1000).toFixed(1)} km` : '—'}</span></> : def.legend ? <><span>{def.legend[0]}</span><span>{def.legend[1]}</span></> : null}
                  </div>
                )}
                <p>{def.hint}{lighting === 'full' && (def.id === 'imagery' || def.id === 'colour') ? ' Full Moon lighting: the whole surface is lit evenly.' : ''}{(effLayer === 'sunStay' || effLayer === 'earthStay') && status?.stay && status.stay.done < status.stay.total ? ` Computing ${status.stay.done} of ${status.stay.total} instants…` : ''}</p>
              </div>
              <div className="xp-ctl">
                {family !== 'ground' && (
                  <label>
                    <span>Vertical exaggeration <b className="mono">×{terrainView ? exag.terrain : exag.globe}</b></span>
                    <input type="range" min={1} max={terrainView ? 6 : 20} step={terrainView ? 0.5 : 1} value={terrainView ? exag.terrain : exag.globe}
                      onChange={(ev) => setExag(terrainView ? { ...exag, terrain: Number(ev.target.value) } : { ...exag, globe: Number(ev.target.value) })} />
                  </label>
                )}
                <div className="xp-toggles">
                  {toggles.map(([k, l]) => (
                    <button key={k} className={opts[k] ? 'on' : ''} aria-pressed={opts[k]} onClick={() => setOpts({ ...opts, [k]: !opts[k] })}>{l}</button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* site conditions */}
      <div className={'xp-right' + (panels.info ? '' : ' closed')}>
        {panels.info ? (
          <div className="xp-panel glass" data-occlude>
            <button className="xp-collapse" onClick={() => setPanels({ ...panels, info: false })} aria-label="Hide site conditions" title="Hide"><ChevronRight size={16} /></button>
            <SitePanel site={site} sky={sky} events={events} summary={summary} horizon={horizon} />
          </div>
        ) : (
          <button data-occlude className="xp-edge" onClick={() => setPanels({ ...panels, info: true })} aria-label="Show site conditions">
            <ChevronLeft size={15} aria-hidden="true" /><span>{site.name}</span>
          </button>
        )}
      </div>

      {help && (
        <div className="xp-help glass" role="dialog" aria-label="Controls" data-occlude>
          <button className="btn icon ghost" onClick={() => setHelp(false)} aria-label="Close"><X size={14} /></button>
          <h3>Controls</h3>
          <div className="xp-help-cols">
            <dl>
              <dt className="grp">Everywhere</dt>
              <div><dt>1 – 5</dt><dd>Switch view</dd></div>
              <div><dt>Drag · Scroll</dt><dd>{mode === 'map' ? 'Pan · zoom' : 'Rotate · zoom'}</dd></div>
              <div><dt>F / R</dt><dd>Go to site / reset view</dd></div>
              <div><dt>M · Esc</dt><dd>Measure · stop</dd></div>
              <div><dt>Double-click</dt><dd>Add a site there</dd></div>
              <div><dt>?</dt><dd>This panel</dd></div>
            </dl>
            <dl>
              <dt className="grp">Drone</dt>
              <div><dt>W A S D · ↑ ↓</dt><dd>Fly</dd></div>
              <div><dt>← →</dt><dd>Turn</dd></div>
              <div><dt>E / Space · Q</dt><dd>Climb · descend</dd></div>
              <dt className="grp">Rover</dt>
              <div><dt>W S · A D</dt><dd>Drive · steer</dd></div>
              <div><dt>Space</dt><dd>Brake</dd></div>
              <div><dt>C · L</dt><dd>Camera · lights</dd></div>
            </dl>
          </div>
          <p className="dim small">A gamepad works too: left stick moves, right stick turns, triggers change height.</p>
        </div>
      )}

      <HoverHud hover={hoverSig} source={status?.resolution ?? ''} />
      <ScaleBar engine={e} />

      {missing && (
        <div className="xp-missing glass">
          <b>Running without {missing.join(', ')}.</b> Run <code>npm run fetch:moon</code> once to install NASA’s LOLA elevation and LRO colour maps.
        </div>
      )}

      <Controls engine={e} mode={mode} />
      {mode === 'rover' && <RoverHud engine={e} telemetry={roverSig} />}
      <MeasurePanel engine={e} m={measure} on={measuring} />
      {tour !== null && <Tour steps={tourSteps} i={tour} onStep={setTour} onClose={() => setTour(null)} />}
      {toast && <div className="xp-toast" role="status">{toast}</div>}

      {/* time */}
      <div className="xp-dock" data-occlude>
        {panels.sky && (
          <section className="xp-sky glass" aria-label="Sky from the site">
            <header><b>Sky from {site.name}</b><span className="dim">{horizon.kind === 'terrain' ? 'Terrain horizon from LOLA' : 'Smooth-sphere horizon'} · north centred</span>
              <button className="btn icon ghost" onClick={() => setPanels({ ...panels, sky: false })} aria-label="Hide sky chart"><X size={14} /></button></header>
            <SkyChart series={series} horizon={horizon} sky={sky} />
          </section>
        )}
        <div className="xp-time glass">
          <button className={'xp-skybtn' + (panels.sky ? ' on' : '')} onClick={() => setPanels({ ...panels, sky: !panels.sky })} aria-pressed={panels.sky}>
            <Sun size={14} aria-hidden="true" /> Sky chart
          </button>
          <TimeBar series={series} />
        </div>
      </div>
      <span className="sr-only">{`${site.name}, ${fmtLat(site.lat)} ${fmtLon(site.lon)}. Stay from ${new Date(landingMs).toUTCString()} for ${days} days, ending ${new Date(landingMs + days * DAY).toUTCString()}.`}</span>
    </main>
  )
}
