import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { sampleEphemeris } from '../../engine/ephemeris'
import { getMoonData, horizonAngle, makeSampler, type MoonData } from '../moonData'
import { FlatMap, mapXY } from './FlatMap'
import { Globe, heightTexture } from './Globe'
import { layerIndex, type LayerId } from './glsl'
import type { PatchRequest, PatchResult } from './patchWorker'
import { SkyBodies, StarSky } from './Sky'
import { icrfToMoon } from '../../engine/lunarFrame'
import { Terrain } from './Terrain'
import { DetailImagery, MAX_ZOOM } from './DetailImagery'
import { buildAstronaut, buildOrbiter } from './Figures'
import { Input, type Virtual } from './Input'
import { buildRoverModel, MAX_CLIMB_DEG, ROVER_SPEEDS, type RoverSpeed, type RoverTelemetry } from './Rover'
import { computeSky, makeFrame, newSky, SPHERE_HORIZON } from '../../engine/sky'

export type Lighting = 'sun' | 'full'
export type ViewMode = 'globe' | 'pole' | 'drone' | 'rover' | 'surface' | 'map'
export type MapKind = 'global' | 'pole'
export interface SiteMark { id: string; name: string; lat: number; lon: number }
export interface HoverInfo { lat: number; lon: number; heightM: number | null; slopeDeg: number | null; source: string }
export interface EngineStatus {
  mode: ViewMode
  busy: string | null
  /** Grid spacing of the elevation behind the current view, in words. */
  resolution: string
  stay: { done: number; total: number } | null
  /** Why a view cannot be shown, in words, or null. */
  blocked: string | null
}
export interface EngineCallbacks {
  onSelect: (id: string) => void
  onPick: (lat: number, lon: number) => void
  onHover: (h: HoverInfo | null) => void
  onStatus: (s: EngineStatus) => void
  onRover?: (t: RoverTelemetry) => void
  onMeasure?: (m: MeasureResult | null) => void
  onMeasureMode?: (on: boolean) => void
}
/** A two-point measurement along the surface: great-circle path, with an elevation profile from LOLA. */
export interface MeasureResult {
  a: [number, number]; b: [number, number]
  distM: number; dh: number; minH: number; maxH: number; gain: number; loss: number; maxSlope: number
  profile: number[]
  source: string
}

const R_KM = 1737.4
const R_M = 1737400
const DEG = Math.PI / 180
const AU_KM = 149597870.7
const SUN_R = 695700
const EARTH_R = 6378.137
const toScene = (v: number[]) => new THREE.Vector3(v[1], v[2], v[0])
const clampAxis = (v: number) => Math.max(-1, Math.min(1, v))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

/** Local frame (metres) at a point on the reference sphere. */
interface Frame { lat: number; lon: number; o: number[]; e: number[]; n: number[]; u: number[] }
function frameAt(lat: number, lon: number): Frame {
  const la = lat * DEG, lo = lon * DEG
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  return { lat, lon, u, o: u.map((x) => x * R_M), e: [-Math.sin(lo), Math.cos(lo), 0], n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)] }
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const PATCH = { pole: { span: 600000, n: 1536 }, drone: { span: 160000, n: 1536 }, rover: { span: 60000, n: 2048 } }

export class ExplorerEngine {
  private renderer: THREE.WebGLRenderer
  private globeScene = new THREE.Scene()
  private terrScene = new THREE.Scene()
  private mapScene = new THREE.Scene()
  private globeCam = new THREE.PerspectiveCamera(34, 1, 0.0002, 2000)
  private terrCam = new THREE.PerspectiveCamera(55, 1, 0.0005, 2e5)
  private terrTop = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000)
  private mapCam = new THREE.OrthographicCamera(-2, 2, 1, -1, -10, 10)
  private globeCtl: OrbitControls
  private terrCtl: OrbitControls
  private mapCtl: OrbitControls
  private poleTopCtl: OrbitControls
  private globe = new Globe()
  private flat = new FlatMap()
  private terrain = new Terrain(768)
  /** Finer square drawn over the base terrain where the camera is looking closely. */
  private detail = new Terrain(768)
  private detailReq = 0
  private detailWant: { ce: number; cn: number; span: number } | null = null
  private lodAt = 0
  /** The rest of the Moon around the terrain square, so the square never floats in space. */
  private ctxGlobe = new Globe(384)
  // measuring
  measuring = false
  private mpts: [number, number][] = []
  private measure: MeasureResult | null = null
  private mGroups = { globe: new THREE.Group(), map: new THREE.Group(), terr: new THREE.Group() }
  private mEnds: { globe: THREE.Vector3[]; map: THREE.Vector3[]; terr: (THREE.Vector3 | null)[] } = { globe: [], map: [], terr: [] }
  // Sun and Earth tracks across the stay, drawn on the sky in the Surface view
  private paths = new THREE.Group()
  private pathKey = ''
  // figures
  private astro = buildAstronaut()
  private astroAt: { e: number; n: number; yaw: number } | null = null
  private astroSky = 0
  private orbiter = buildOrbiter()
  private orbitRing: THREE.LineLoop
  private globeSun = new THREE.DirectionalLight(0xfff1dd, 2.2)
  private imagery: DetailImagery | null = null
  private sky = new SkyBodies(5000)
  private globeStars = new StarSky(400)
  private terrStars = new StarSky(50000)
  private icrf: number[] | null = null
  private lighting: Lighting = 'sun'
  private globeMarks = new THREE.Group()
  private mapMarks = new THREE.Group()
  private terrMarks = new THREE.Group()
  private sunGlow: THREE.Sprite
  private worker: Worker | null = null
  private reqId = 0
  private patchKey = ''
  private frame: Frame | null = null
  private mode: ViewMode = 'globe'
  private mapKind: MapKind = 'global'
  private layer: LayerId = 'imagery'
  private sites: SiteMark[] = []
  private selected: SiteMark | null = null
  private timeMs = Date.now()
  private visDirty = true
  private lastVisAt = 0
  private stay: { start: number; days: number } | null = null
  private stayKey = ''
  private exag = { globe: 4, terrain: 1.5 }
  private opts = { grid: true, labels: true, contours: false, autoRotate: false, fill: true, paths: true, orbiter: true, micro: true }
  private raf = 0
  private ro: ResizeObserver
  private disposed = false
  private status: EngineStatus = { mode: 'globe', busy: null, resolution: '', stay: null, blocked: null }
  private fly: { cam: THREE.Camera; ctl: OrbitControls | null; p0: THREE.Vector3; p1: THREE.Vector3; t0v: THREE.Vector3; t1v: THREE.Vector3; start: number; dur: number; arc?: boolean } | null = null
  private input = new Input()
  private rover = { lat: 0, lon: 0, e: 0, n: 0, heading: 0, v: 0, dist: 0, battery: 82, cam: 'chase' as 'chase' | 'mast', lights: false, speed: 'x50' as RoverSpeed, camYaw: 0, camDist: 0.011, placed: false, blocked: null as string | null, sunFrac: 0, sunEl: 0, earthUp: false, earthEl: 0, lastSky: 0, lastSent: 0, trail: [] as THREE.Vector3[] }
  private roverModel = buildRoverModel()
  private roverGroup = new THREE.Group()
  private trailLine: THREE.Line
  private sunLight = new THREE.DirectionalLight(0xfff1dd, 2.6)
  private ambient = new THREE.HemisphereLight(0xb8c6ff, 0x3a3226, 0.9) // artistic fill so the rover stays readable in shadow
  private look = { yaw: 0, pitch: 0.05, drag: null as [number, number] | null }
  /** Where the Surface-view observer stands, frame metres (east, north). */
  private walk = { e: 0, n: 0 }
  private down: [number, number] | null = null
  private labelLayer: HTMLDivElement
  private labelEls = new Map<string, HTMLDivElement>()
  private hoverAt = 0
  private colorTex: THREE.Texture | null = null
  private trekTex: THREE.Texture | null = null
  private sunDirScene = new THREE.Vector3()
  private earthDirScene = new THREE.Vector3()
  private sunR = 0.00465
  private earthR = 0.0165
  private clock = new THREE.Timer()

  constructor(private host: HTMLElement, private cb: EngineCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x020208)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const el = this.renderer.domElement
    el.className = 'xp-canvas'
    el.tabIndex = 0
    el.setAttribute('role', 'application')
    el.setAttribute('aria-label', '3D Moon explorer. Drag to rotate, scroll to zoom, double-click to add a site.')
    host.appendChild(el)
    this.labelLayer = document.createElement('div')
    this.labelLayer.className = 'xp-labels'
    host.appendChild(this.labelLayer)

    // ---- globe scene
    this.globeScene.add(this.globe.mesh, this.globeMarks, this.globeStars.group)
    void this.globeStars.load(import.meta.env.BASE_URL)
    void this.terrStars.load(import.meta.env.BASE_URL)
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    this.sunGlow.scale.setScalar(60)
    this.globeScene.add(this.sunGlow)
    this.globeCam.position.set(0, 0, 4.2)
    this.globeCtl = this.controls(this.globeCam, { min: 1.012, max: 14, pan: false })
    this.globeCtl.rotateSpeed = 0.5

    // ---- terrain scene (kilometres, local frame)
    this.terrScene.add(this.terrain.group, this.detail.group, this.ctxGlobe.mesh, this.terrMarks, this.sky.group, this.terrStars.group)
    this.ctxGlobe.mesh.matrixAutoUpdate = false
    this.ctxGlobe.mesh.visible = false
    this.ctxGlobe.uniforms.uGrid.value = 0
    this.detail.group.visible = false
    this.detail.setBase(this.terrain)
    // the detail square shares the base square's look: same layer, colours, lights and markers
    for (const k of ['uSelR', 'uLayer', 'uMinH', 'uMaxH', 'uContours', 'uFill', 'uGrid', 'uSunScene', 'uEarthScene', 'uSel', 'uLamp', 'uLampPos', 'uLampDir', 'uGrain', 'uFull', 'uLightScene', 'uSpanKm'] as const)
      (this.detail.uniforms as Record<string, unknown>)[k] = this.terrain.uniforms[k]
    this.imagery = new DetailImagery(this.renderer.capabilities.getMaxAnisotropy(), () => this.applyDetailImagery())
    this.globeScene.add(this.mGroups.globe); this.mapScene.add(this.mGroups.map); this.terrScene.add(this.mGroups.terr, this.paths)
    this.astro.group.scale.setScalar(0.001)
    this.astro.group.visible = false
    this.terrScene.add(this.astro.group)
    this.orbiter.scale.setScalar(0.011)
    const ring = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => new THREE.Vector3(Math.cos((i / 256) * Math.PI * 2), Math.sin((i / 256) * Math.PI * 2), 0).multiplyScalar(1.0576)))
    this.orbitRing = new THREE.LineLoop(ring, new THREE.LineBasicMaterial({ color: 0x9cc6ff, transparent: true, opacity: 0.22 }))
    this.globeScene.add(this.orbiter, this.orbitRing, this.globeSun, this.globeSun.target, new THREE.AmbientLight(0x8890b0, 0.6))
    this.roverGroup.add(this.roverModel.group)
    this.roverModel.group.scale.setScalar(0.001) // model metres → scene kilometres
    this.roverGroup.visible = false
    this.trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf4a259, transparent: true, opacity: 0.85 }))
    this.trailLine.frustumCulled = false
    this.terrScene.add(this.roverGroup, this.trailLine, this.sunLight, this.sunLight.target, this.ambient)
    this.terrCtl = this.controls(this.terrCam, { min: 0.05, max: 3000, pan: true })
    this.terrCtl.maxPolarAngle = Math.PI * 0.497
    this.terrCtl.screenSpacePanning = false
    this.poleTopCtl = this.controls(this.terrTop, { min: 0, max: 0, pan: true })
    this.poleTopCtl.enableRotate = false
    this.poleTopCtl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.poleTopCtl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    this.poleTopCtl.minZoom = 0.8; this.poleTopCtl.maxZoom = 60

    // ---- flat map scene
    this.mapScene.add(this.flat.mesh, this.mapMarks)
    this.mapCam.position.set(0, 0, 5)
    this.mapCtl = this.controls(this.mapCam, { min: 0, max: 0, pan: true })
    this.mapCtl.enableRotate = false
    this.mapCtl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.mapCtl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    this.mapCtl.minZoom = 0.9; this.mapCtl.maxZoom = 600
    this.mapCtl.screenSpacePanning = true

    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerleave', () => cb.onHover(null))
    el.addEventListener('dblclick', this.onDbl)
    el.addEventListener('wheel', (e) => { if (this.mode === 'rover' && this.rover.cam === 'chase') { this.rover.camDist = Math.max(0.006, Math.min(0.4, this.rover.camDist * (e.deltaY > 0 ? 1.12 : 0.89))); e.preventDefault() } }, { passive: false })
    // keys work wherever focus is (after pressing an on-screen button too), except while typing in a field
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.applyMode()
    this.loop()
  }

  // ------------------------------------------------------------------ setup helpers
  private controls(cam: THREE.Camera, o: { min: number; max: number; pan: boolean }) {
    const c = new OrbitControls(cam, this.renderer.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.075
    c.enablePan = o.pan
    if (o.max) { c.minDistance = o.min; c.maxDistance = o.max }
    c.enabled = false
    return c
  }
  private glow(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = 256
    const g = c.getContext('2d')!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    gr.addColorStop(0, 'rgba(255,248,230,1)'); gr.addColorStop(0.06, 'rgba(255,220,160,0.9)'); gr.addColorStop(0.2, 'rgba(255,170,90,0.25)'); gr.addColorStop(1, 'rgba(255,140,60,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  // ------------------------------------------------------------------ public API
  private smp: ReturnType<typeof makeSampler> | null = null
  private sampler() { if (!this.smp) { const d = getMoonData(); this.smp = d ? makeSampler(d) : null } return this.smp }

  setData(d: MoonData) {
    this.smp = null
    if (d.global) {
      const t = heightTexture(d.global.data, d.global.width, d.global.height, this.renderer)
      this.globe.setHeight(t, d.global.minM, d.global.maxM)
      this.ctxGlobe.setHeight(t, d.global.minM, d.global.maxM)
      this.flat.uniforms.uHeight.value = t; this.flat.uniforms.uHasHeight.value = 1
      this.flat.uniforms.uMinH.value = d.global.minM; this.flat.uniforms.uMaxH.value = d.global.maxM
    }
    if (d.colorUrl) {
      new THREE.TextureLoader().load(d.colorUrl, (t) => {
        t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true
        this.colorTex = t
        this.applyImagery()
      })
    } else this.loadMoonTrek()
    this.patchKey = ''
    this.applyMode()
  }

  /** NASA Moon Trek WAC mosaic tiles (online). Used when no local colour map exists, or on request. */
  loadMoonTrek() {
    if (this.trekTex) { this.applyImagery(); return }
    const TREK = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm'
    const Z = 3, cols = 2 ** (Z + 1), rows = 2 ** Z
    const canvas = document.createElement('canvas'); canvas.width = cols * 256; canvas.height = rows * 256
    const ctx = canvas.getContext('2d')!
    const jobs: Promise<void>[] = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) jobs.push(new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, c * 256, r * 256, 256, 256); res() }
      img.onerror = () => rej(new Error('tile'))
      img.src = `${TREK}/${Z}/${r}/${c}.jpg`
    }))
    Promise.all(jobs).then(() => {
      ctx.getImageData(0, 0, 1, 1)
      if (this.disposed) return
      const t = new THREE.CanvasTexture(canvas)
      t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping
      this.trekTex = t
      if (!this.colorTex) this.applyImagery()
    }).catch(() => { /* offline or blocked: the plain shaded sphere stays */ })
  }
  private applyImagery() {
    const t = this.colorTex ?? this.trekTex
    this.globe.setColor(t)
    this.flat.uniforms.uColor.value = t; this.flat.uniforms.uHasColor.value = t ? 1 : 0
  }

  setMode(m: ViewMode) { if (m !== this.mode) { this.mode = m; this.applyMode() } }
  setMapKind(k: MapKind) { if (k !== this.mapKind) { this.mapKind = k; if (this.mode === 'map') this.applyMode() } }

  setLayer(l: LayerId) {
    this.layer = l
    const i = layerIndex(l)
    // stay layers (6, 7) exist only in the terrain views; the page never sends them to the globe or map
    this.globe.uniforms.uLayer.value = i
    this.flat.uniforms.uLayer.value = i
    this.terrain.uniforms.uLayer.value = i
    // around the terrain the Moon shows the same layer; real-Moon and stay layers use plain regolith shading
    this.ctxGlobe.uniforms.uLayer.value = l === 'imagery' || l === 'sunStay' || l === 'earthStay' ? 1 : i
    if (this.detail.patch && (l === 'sunStay' || l === 'earthStay')) this.queueStay()
    if ((l === 'sunStay' || l === 'earthStay')) this.queueStay()
  }

  /** Ground distance (metres) covered by one screen pixel at the centre of the view, or null where it varies too much. */
  metresPerPixel(): number | null {
    const h = Math.max(1, this.host.clientHeight)
    if (this.mode === 'globe') { const c = this.globeCam; return ((c.position.length() - 1) * R_M * 2 * Math.tan((c.fov * DEG) / 2)) / h }
    if (this.mode === 'map' && this.mapKind === 'global') return (((this.mapCam.top - this.mapCam.bottom) / this.mapCam.zoom) * (Math.PI / 2) * R_M) / h
    if (this.mode === 'map') return (((this.terrTop.top - this.terrTop.bottom) / this.terrTop.zoom) * 1000) / h
    if (this.mode === 'pole' || this.mode === 'drone') { const c = this.terrCam; return (c.position.distanceTo(this.terrCtl.target) * 1000 * 2 * Math.tan((c.fov * DEG) / 2)) / h }
    return null
  }

  setExaggeration(globe: number, terrain: number) {
    this.exag = { globe, terrain }
    this.globe.uniforms.uExag.value = globe
    this.terrain.setExaggeration(this.mode === 'surface' || this.mode === 'rover' ? 1 : terrain)
    this.detail.setExaggeration(this.mode === 'surface' || this.mode === 'rover' || this.mode === 'map' ? 1 : terrain)
    this.ctxGlobe.uniforms.uExag.value = this.mode === 'surface' || this.mode === 'rover' || this.mode === 'map' ? 1 : terrain
    this.buildMarks()
    this.rebuildMeasure()
  }

  setOptions(o: Partial<typeof this.opts>) {
    this.opts = { ...this.opts, ...o }
    this.globe.uniforms.uGrid.value = this.opts.grid ? 1 : 0
    this.flat.uniforms.uGrid.value = this.opts.grid ? 1 : 0
    this.terrain.uniforms.uGrid.value = this.opts.grid ? 1 : 0
    this.terrain.uniforms.uContours.value = this.opts.contours ? 1 : 0
    this.terrain.uniforms.uFill.value = this.opts.fill ? 1 : 0
    this.terrain.uniforms.uGrain.value = this.opts.micro && (this.mode === 'rover' || this.mode === 'surface' || this.mode === 'drone') ? 1 : 0
    this.globeCtl.autoRotate = this.opts.autoRotate
    this.globeCtl.autoRotateSpeed = 0.35
    this.terrCtl.autoRotate = this.opts.autoRotate && (this.mode === 'drone' || this.mode === 'pole')
    this.terrCtl.autoRotateSpeed = 0.5
    this.labelLayer.style.display = this.opts.labels ? '' : 'none'
  }

  setTime(ms: number) {
    this.timeMs = ms
    const buf = new Float64Array(6)
    if (!sampleEphemeris(ms, buf)) return
    const sunKm = [buf[0] * AU_KM, buf[1] * AU_KM, buf[2] * AU_KM]
    const sl = Math.hypot(...sunKm)
    const sun = sunKm.map((x) => x / sl)
    const earth = [buf[3], buf[4], buf[5]]
    this.globe.uniforms.uSun.value.copy(toScene(sun))
    if (this.lighting === 'sun') this.globe.uniforms.uLight.value.copy(toScene(sun))
    // real star sky: ICRF → Moon body-fixed (IAU model) → globe scene axes
    const m = this.icrf = icrfToMoon(ms)
    this.globeStars.orient([m[3], m[4], m[5], m[6], m[7], m[8], m[0], m[1], m[2]])
    this.globe.uniforms.uEarthPos.value.copy(toScene(earth.map((x) => x / R_KM)))
    this.sunGlow.position.copy(toScene(sun).multiplyScalar(300))
    this.globeSun.position.copy(toScene(sun).multiplyScalar(10))
    this.flat.uniforms.uSunME.value.set(sun[0], sun[1], sun[2])
    this.flat.uniforms.uEarthME.value.set(earth[0] / R_KM, earth[1] / R_KM, earth[2] / R_KM)
    this.sunR = Math.asin(SUN_R / sl)
    this.earthR = Math.asin(EARTH_R / Math.hypot(...earth))
    if (this.frame) {
      const [s, e] = this.localVectors(ms)!
      this.terrain.uniforms.uSunScene.value.set(s.x, s.z, -s.y)
      const ed = e.clone().normalize()
      this.terrain.uniforms.uEarthScene.value.set(ed.x, ed.z, -ed.y)
      this.sunDirScene.set(s.x, s.z, -s.y)
      this.earthDirScene.set(ed.x, ed.z, -ed.y)
      this.visDirty = true
    }
  }

  /** 'sun': lit by the true Sun at the chosen time. 'full': evenly lit, as a full Moon, with no night side or cast shadows. */
  setLighting(l: Lighting) {
    this.lighting = l
    const full = l === 'full' ? 1 : 0
    this.flat.uniforms.uFull.value = full
    this.terrain.uniforms.uFull.value = full
    if (!full) this.globe.uniforms.uLight.value.copy(this.globe.uniforms.uSun.value)
  }

  setStay(startMs: number, days: number) {
    this.stay = { start: startMs, days }
    this.pathKey = ''
    if (this.layer === 'sunStay' || this.layer === 'earthStay') this.queueStay()
  }

  setSites(list: SiteMark[], selectedId: string) {
    this.sites = list
    this.selected = list.find((s) => s.id === selectedId) ?? null
    this.buildMarks()
    if ((this.mode === 'drone' || this.mode === 'surface') && this.selected) this.ensurePatch()
  }

  /** Move the camera to the selected site in the current view. */
  focusSelected(instant = false) {
    const s = this.selected
    if (!s) return
    if (this.mode === 'globe') {
      // look from no more than 35° off the equator, so polar sites sit near the limb with the familiar face in view
      const to = toScene(this.me(Math.max(-35, Math.min(35, s.lat)), s.lon)).normalize()
      const d = Math.min(Math.max(this.globeCam.position.length(), 2.6), 3.8)
      this.flyTo(this.globeCam, this.globeCtl, to.multiplyScalar(d), new THREE.Vector3(), instant, true)
    } else if (this.mode === 'map' && this.mapKind === 'global') {
      const [x, y] = mapXY(s.lat, s.lon)
      this.mapCam.zoom = Math.max(this.mapCam.zoom, 3); this.mapCam.updateProjectionMatrix()
      this.flyTo(this.mapCam, this.mapCtl, new THREE.Vector3(x, Math.max(-0.68, Math.min(0.68, y)), 5), new THREE.Vector3(x, Math.max(-0.68, Math.min(0.68, y)), 0), instant)
    } else if (this.mode === 'pole' && this.terrain.patch && this.frame) {
      const p = this.siteLocal(s)
      if (p && Math.abs(p.x) < 300 && Math.abs(p.z) < 300) this.flyTo(this.terrCam, this.terrCtl, new THREE.Vector3(p.x + 18, p.y + 26, p.z + 34), p, instant)
    } else if (this.mode === 'drone') this.droneHome(instant)
    else if (this.mode === 'rover') { this.rover.placed = false; this.rover.trail = []; this.ensurePatch() }
  }

  resetView() {
    if (this.mode === 'globe') this.flyTo(this.globeCam, this.globeCtl, new THREE.Vector3(0, -1.2, 4.0), new THREE.Vector3(), false, true)
    else if (this.mode === 'map') this.applyMode()
    else if (this.mode === 'pole') this.poleHome(false)
    else if (this.mode === 'drone') this.droneHome(false)
    else if (this.mode === 'surface') { this.walk = { e: 0, n: 0 }; this.look.yaw = this.sunYaw(); this.look.pitch = 0.04 }
  }

  /** Point the surface camera at the Sun or Earth. */
  lookAtBody(b: 'sun' | 'earth') {
    const v = b === 'sun' ? this.sunDirScene : this.earthDirScene
    if (this.mode !== 'surface') return
    this.look.yaw = Math.atan2(-v.x, -v.z)
    this.look.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, v.y)))
  }

  screenshot(): string { this.render(); return this.renderer.domElement.toDataURL('image/png') }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.worker?.terminate()
    for (const c of [this.globeCtl, this.terrCtl, this.mapCtl, this.poleTopCtl]) c.dispose()
    this.globe.dispose(); this.flat.dispose(); this.terrain.dispose(); this.sky.dispose(); this.globeStars.dispose(); this.terrStars.dispose()
    for (const s of [this.globeScene, this.terrScene, this.mapScene]) s.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | undefined
      if (mat && !Array.isArray(mat)) mat.dispose()
    })
    this.colorTex?.dispose(); this.trekTex?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelLayer.remove()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.imagery?.dispose(); this.ctxGlobe.dispose(); this.detail.dispose()
  }

  // ------------------------------------------------------------------ modes
  private needsTerrain() { return this.mode === 'pole' || this.mode === 'drone' || this.mode === 'rover' || this.mode === 'surface' || (this.mode === 'map' && this.mapKind === 'pole') }

  private applyMode() {
    for (const c of [this.globeCtl, this.terrCtl, this.mapCtl, this.poleTopCtl]) c.enabled = false
    const d = getMoonData()
    let blocked: string | null = null
    if (this.needsTerrain()) {
      if (!d || (!d.global && !d.pole)) blocked = 'This view is built from NASA LOLA elevation data, which is not installed yet. Run “npm run fetch:moon” once, then reload.'
      else if ((this.mode === 'drone' || this.mode === 'surface' || this.mode === 'rover') && !this.selected) blocked = 'Pick a site first.'
    }
    this.setStatus({ mode: this.mode, blocked })
    this.labelLayer.style.visibility = blocked ? 'hidden' : ''
    if (blocked) return
    if (this.mode === 'globe') { this.globeCtl.enabled = true; this.setStatus({ resolution: d?.global ? `LOLA global elevation, ~${((d.global.pixelDeg * DEG * R_KM)).toFixed(1)} km grid, ×${this.exag.globe} vertical` : 'No elevation installed: smooth sphere' }) }
    else if (this.mode === 'map' && this.mapKind === 'global') { this.mapCtl.enabled = true; this.mapCam.position.set(0, 0, 5); this.mapCtl.target.set(0, 0, 0); this.mapCam.zoom = 1; this.mapCam.updateProjectionMatrix(); this.setStatus({ resolution: 'Equirectangular map' }) }
    else this.ensurePatch()
    this.setOptions({})
    this.terrain.setExaggeration(this.mode === 'surface' || this.mode === 'map' || this.mode === 'rover' ? 1 : this.exag.terrain)
  }

  private wantPatch(): { lat: number; lon: number; span: number; n: number; key: string } | null {
    if (this.mode === 'pole' || (this.mode === 'map' && this.mapKind === 'pole')) return { lat: -90, lon: 0, ...PATCH.pole, span: PATCH.pole.span, key: 'pole' }
    if (this.mode === 'rover' && this.selected) {
      const r = this.rover, lat = r.placed ? r.lat : this.selected.lat, lon = r.placed ? r.lon : this.selected.lon
      return { lat, lon, span: PATCH.rover.span, n: PATCH.rover.n, key: `rover:${lat.toFixed(4)},${lon.toFixed(4)}` }
    }
    if ((this.mode === 'drone' || this.mode === 'surface') && this.selected) return { lat: this.selected.lat, lon: this.selected.lon, span: PATCH.drone.span, n: PATCH.drone.n, key: `site:${this.selected.lat.toFixed(4)},${this.selected.lon.toFixed(4)}` }
    return null
  }

  private ensurePatch() {
    const want = this.wantPatch()
    if (!want) return
    if (want.key === this.patchKey && this.terrain.patch) { this.enterTerrainView(false); return }
    this.patchKey = want.key
    this.setStatus({ busy: 'Building terrain from LOLA elevation…' })
    if (!this.worker) {
      this.worker = new Worker(new URL('./patchWorker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (ev: MessageEvent<PatchResult>) => (ev.data.tag === 'detail' ? this.onDetail(ev.data) : this.onPatch(ev.data))
    }
    const req: PatchRequest = { id: ++this.reqId, base: new URL(import.meta.env.BASE_URL, location.href).href, lat: want.lat, lon: want.lon, spanM: want.span, n: want.n }
    this.worker.postMessage(req)
  }

  private onPatch(p: PatchResult) {
    if (this.disposed || p.id !== this.reqId) return
    if (!p.ok) { this.setStatus({ busy: null, blocked: `Terrain could not be built: ${p.error}` }); return }
    this.frame = frameAt(p.lat, p.lon)
    this.terrain.setPatch(p, this.renderer)
    this.dropDetail()
    this.placeContextGlobe()
    this.pathKey = ''
    this.setTime(this.timeMs)
    this.visDirty = true
    this.stayKey = ''
    if (this.layer === 'sunStay' || this.layer === 'earthStay') this.queueStay()
    this.placeTerrainMarks()
    this.setStatus({ busy: null, resolution: `${p.source}, mesh ${(p.spanM / 1000).toFixed(0)} km wide` })
    this.enterTerrainView(true)
  }

  private enterTerrainView(fresh: boolean) {
    const ex = this.mode === 'surface' || this.mode === 'map' || this.mode === 'rover' ? 1 : this.exag.terrain
    this.terrain.setExaggeration(ex); this.detail.setExaggeration(ex); this.ctxGlobe.uniforms.uExag.value = ex
    this.dropDetail()
    this.terrain.setMeshResolution(this.mode === 'rover' ? 1024 : 768)
    this.placeTerrainMarks()
    this.terrain.uniforms.uGrain.value = this.opts.micro && (this.mode === 'rover' || this.mode === 'surface' || this.mode === 'drone') ? 1 : 0
    this.placeAstronaut()
    this.rebuildMeasure()
    if (this.mode === 'rover') { this.rover.trail = []; this.placeRover(); this.terrCam.near = 0.0002; this.terrCam.updateProjectionMatrix() } else if (this.terrCam.near !== 0.0005) { this.terrCam.near = 0.0005; this.terrCam.updateProjectionMatrix() }
    if (this.mode === 'pole') { this.terrCtl.enabled = true; this.poleHome(!fresh) }
    else if (this.mode === 'drone') { this.terrCtl.enabled = true; this.droneHome(!fresh) }
    else if (this.mode === 'surface') { this.walk = { e: 0, n: 0 }; this.look.yaw = this.sunYaw(); this.look.pitch = 0.04; this.terrain.uniforms.uSel.value.y = 0 }
    else if (this.mode === 'map') {
      this.poleTopCtl.enabled = true
      const h = (this.terrain.patch!.spanM / 2000)
      this.terrTop.position.set(0, 2000, 0); this.terrTop.up.set(0, 0, -1); this.terrTop.lookAt(0, 0, 0)
      this.poleTopCtl.target.set(0, 0, 0)
      this.terrTop.zoom = 1
      this.fitTop(h)
    }
  }

  // ------------------------------------------------------------------ measuring
  setMeasuring(on: boolean) {
    this.measuring = on
    this.renderer.domElement.style.cursor = on ? 'crosshair' : ''
    this.cb.onMeasureMode?.(on)
  }
  clearMeasure() { this.mpts = []; this.measure = null; this.rebuildMeasure(); this.cb.onMeasure?.(null) }

  private addMeasurePoint(lat: number, lon: number) {
    if (this.mpts.length >= 2) this.mpts = []
    this.mpts.push([lat, lon])
    this.measure = this.mpts.length === 2 ? this.computeMeasure(this.mpts[0], this.mpts[1]) : null
    this.rebuildMeasure()
    this.cb.onMeasure?.(this.measure)
  }

  /** Great-circle path between two points, heights from the finest LOLA grid available at each sample. */
  private computeMeasure(a: [number, number], b: [number, number]): MeasureResult {
    const pa = this.me(a[0], a[1]), pb = this.me(b[0], b[1])
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(pa, pb))))
    const N = 240, smp = this.sampler()
    const prof: number[] = [], ll: [number, number][] = []
    for (let i = 0; i <= N; i++) {
      const t = i / N, s0 = ang > 1e-9 ? Math.sin((1 - t) * ang) / Math.sin(ang) : 1 - t, s1 = ang > 1e-9 ? Math.sin(t * ang) / Math.sin(ang) : t
      const v = [0, 1, 2].map((k) => pa[k] * s0 + pb[k] * s1), l = Math.hypot(v[0], v[1], v[2])
      const lat = Math.asin(v[2] / l) / DEG, lon = Math.atan2(v[1], v[0]) / DEG
      const h = smp ? smp.height(lat, lon) : 0
      prof.push(isNaN(h) ? 0 : h); ll.push([lat, lon])
    }
    const seg = (ang * R_M) / N
    let gain = 0, loss = 0, maxSlope = 0
    for (let i = 1; i <= N; i++) {
      const d = prof[i] - prof[i - 1]
      if (d > 0) gain += d; else loss -= d
      maxSlope = Math.max(maxSlope, Math.atan(Math.abs(d) / Math.max(seg, 1)) / DEG)
    }
    this.mPath = ll
    return { a, b, distM: ang * R_M, dh: prof[N] - prof[0], minH: Math.min(...prof), maxH: Math.max(...prof), gain, loss, maxSlope, profile: prof, source: smp ? smp.describe((a[0] + b[0]) / 2) : 'no elevation data' }
  }
  private mPath: [number, number][] = []

  /** Draw the measured path in every scene (cheap; the line is a few hundred points). */
  private rebuildMeasure() {
    for (const g of Object.values(this.mGroups)) { g.children.forEach((c) => { (c as THREE.Line).geometry.dispose() }); g.clear() }
    this.mEnds = { globe: [], map: [], terr: [] }
    const pts = this.mpts
    if (!pts.length) return
    const mat = new THREE.LineBasicMaterial({ color: 0xffb867, transparent: true, opacity: 0.95, depthTest: true })
    const dotMat = new THREE.PointsMaterial({ color: 0xffd9a8, size: 9, sizeAttenuation: false })
    const path = this.measure ? this.mPath : [pts[0]]
    const smp = this.sampler()
    const hAt = (la: number, lo: number) => { const h = smp ? smp.height(la, lo) : 0; return isNaN(h) ? 0 : h }
    // globe
    const gp = path.map(([la, lo]) => toScene(this.me(la, lo)).multiplyScalar(1 + (hAt(la, lo) * this.exag.globe) / R_M + 0.0015))
    if (gp.length > 1) this.mGroups.globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(gp), mat))
    this.mEnds.globe = [gp[0], gp[gp.length - 1]].slice(0, pts.length)
    this.mGroups.globe.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(this.mEnds.globe), dotMat))
    // whole-Moon map, split where the path crosses the date line
    let run: THREE.Vector3[] = []
    const flush = () => { if (run.length > 1) this.mGroups.map.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), mat)); run = [] }
    let prevLon = path[0][1]
    for (const [la, lo] of path) { if (Math.abs(lo - prevLon) > 180) flush(); const [x, y] = mapXY(la, lo); run.push(new THREE.Vector3(x, y, 0.02)); prevLon = lo }
    flush()
    this.mEnds.map = pts.map(([la, lo]) => { const [x, y] = mapXY(la, lo); return new THREE.Vector3(x, y, 0.02) })
    this.mGroups.map.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(this.mEnds.map), dotMat))
    // terrain views
    const f = this.frame, p = this.terrain.patch
    if (f && p) {
      const lift = Math.max(0.004, (p.spanM / 1000) * 0.0006)
      const local = (la: number, lo: number) => {
        const d = this.me(la, lo)
        if (dot(d, f.u) < 0.9) return null
        const q = [d[0] * R_M - f.o[0], d[1] * R_M - f.o[1], d[2] * R_M - f.o[2]]
        const e = dot(q, f.e), n = dot(q, f.n)
        if (!this.terrain.contains(e, n)) return null
        return new THREE.Vector3(e / 1000, this.groundY(e, n) + lift, -n / 1000)
      }
      let tr: THREE.Vector3[] = []
      const tflush = () => { if (tr.length > 1) this.mGroups.terr.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tr), mat)); tr = [] }
      for (const [la, lo] of path) { const v = local(la, lo); if (v) tr.push(v); else tflush() }
      tflush()
      this.mEnds.terr = pts.map(([la, lo]) => local(la, lo))
      const ok = this.mEnds.terr.filter((v): v is THREE.Vector3 => !!v)
      if (ok.length) this.mGroups.terr.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(ok), dotMat))
    }
  }

  // ------------------------------------------------------------------ Sun and Earth paths, figures
  private buildPaths() {
    this.paths.children.forEach((c) => (c as THREE.Line).geometry.dispose())
    this.paths.clear()
    if (!this.stay || !this.frame) return
    const R = 3500, n = Math.min(24 * 45, Math.round(this.stay.days * 24))
    const sun: THREE.Vector3[] = [], earth: THREE.Vector3[] = [], sunDays: THREE.Vector3[] = [], earthDays: THREE.Vector3[] = []
    for (let i = 0; i <= n; i++) {
      const ms = this.stay.start + (i / n) * this.stay.days * 86400000
      const v = this.localVectors(ms)
      if (!v) continue
      const s = new THREE.Vector3(v[0].x, v[0].z, -v[0].y).normalize().multiplyScalar(R)
      const e = new THREE.Vector3(v[1].x, v[1].z, -v[1].y).normalize().multiplyScalar(R)
      sun.push(s); earth.push(e)
      if (i % 24 === 0) { sunDays.push(s); earthDays.push(e) }
    }
    const line = (pts: THREE.Vector3[], color: number) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }))
    const dots = (pts: THREE.Vector3[], color: number) => new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color, size: 6, sizeAttenuation: false }))
    this.paths.add(line(sun, 0xffb35c), line(earth, 0x7fb2ff), dots(sunDays, 0xffd9a8), dots(earthDays, 0xbcd6ff))
    this.pathKey = `${this.patchKey}|${this.stay.start}|${this.stay.days}`
  }

  /** Stand the astronaut beside the site: a few metres from the rover's start, or in front of the Surface observer. */
  private placeAstronaut() {
    const s = this.selected
    this.astroAt = null
    if (!s || !this.terrain.patch || (this.mode !== 'rover' && this.mode !== 'surface')) { this.astro.group.visible = false; return }
    if (this.mode === 'surface') {
      const yaw = this.sunYaw() - 0.22, d = 12
      this.astroAt = { e: -Math.sin(yaw) * d, n: Math.cos(yaw) * d, yaw: yaw + Math.PI }
    } else {
      const p = this.siteLocal(s)
      if (!p) { this.astro.group.visible = false; return }
      this.astroAt = { e: p.x * 1000 + 4, n: -p.z * 1000 + 3.5, yaw: -0.6 }
    }
    this.astroSky = 0
  }
  private updateAstronaut(t: number) {
    const a = this.astroAt, g = this.astro.group
    g.visible = !!a && (this.mode === 'rover' || this.mode === 'surface')
    if (!a || !g.visible) return
    g.position.set(a.e / 1000, this.groundY(a.e, a.n), -a.n / 1000)
    g.rotation.y = a.yaw
    this.astro.arm.rotation.z = 2.5 + 0.35 * Math.sin(t * 3.2)
    if (this.mode === 'surface') {
      // light the figure like the ground it stands on: traced Sun visibility, refreshed once a second
      const now = performance.now()
      if (now - this.astroSky > 1000) {
        this.astroSky = now
        const smp = this.sampler(), [lat, lon] = this.localToLatLon(a.e, a.n)
        const k = computeSky(makeFrame(lat, lon), SPHERE_HORIZON, this.timeMs, newSky())
        if (smp && k.ok) { const x = (k.sunEl - horizonAngle(smp, lat, lon, k.sunAz, 1.8)) / k.sunR; this.astroSun = x >= 1 ? 1 : x <= -1 ? 0 : 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI }
      }
      this.sunLight.position.copy(g.position).add(this.lighting === 'full' ? this.terrain.uniforms.uLightScene.value : this.sunDirScene)
      this.sunLight.target.position.copy(g.position)
      this.sunLight.intensity = this.lighting === 'full' ? 1.6 : 0.15 + 2.6 * this.astroSun
    }
  }
  private astroSun = 1

  // ------------------------------------------------------------------ level of detail
  /** Ground height (scene km) at frame (east, north) metres, from the finest square that covers it. */
  private groundY(east: number, north: number) {
    const t = this.detail.patch && this.detail.group.visible && this.detail.contains(east, north) ? this.detail : this.terrain
    return t.surfaceY(east, north)
  }
  private sampleAt(k: 'h' | 'slope', east: number, north: number) {
    const t = this.detail.patch && this.detail.group.visible && this.detail.contains(east, north) ? this.detail : this.terrain
    return t.sample(t.patch![k], east, north)
  }

  /** Position the context Moon so its surface meets the terrain square: centre 1737.4 km below the frame origin. */
  private placeContextGlobe() {
    const f = this.frame
    if (!f) return
    // globe axes (x = ME y, y = ME z, z = ME x) → local (east, up, −north)
    const col = (k: number) => [f.e[k], f.u[k], -f.n[k]]
    const cx = col(1), cy = col(2), cz = col(0)
    const m = new THREE.Matrix4().set(cx[0], cy[0], cz[0], 0, cx[1], cy[1], cz[1], -R_KM, cx[2], cy[2], cz[2], 0, 0, 0, 0, 1)
    m.multiply(new THREE.Matrix4().makeScale(R_KM, R_KM, R_KM))
    this.ctxGlobe.mesh.matrix.copy(m)
    this.ctxGlobe.mesh.matrixWorldNeedsUpdate = true
    const p = this.terrain.patch!
    const cell = p.spanM / p.n
    this.ctxGlobe.uniforms.uClip.value.set(p.ce / 1000, -p.cn / 1000, (p.spanM / 2 - cell) / 1000, 1)
  }

  /** Per-frame state of the context Moon: same Sun, Earth and lighting as everything else, camera in its own axes. */
  private updateContextGlobe() {
    const g = this.ctxGlobe, u = g.uniforms, m = g.mesh
    u.uSun.value.copy(this.globe.uniforms.uSun.value)
    u.uEarthPos.value.copy(this.globe.uniforms.uEarthPos.value)
    const inv = new THREE.Matrix4().copy(m.matrix).invert()
    u.uCamObj.value.copy(this.activeCam().position).applyMatrix4(inv)
    if (this.lighting === 'full') u.uLight.value.copy(this.terrain.uniforms.uLightScene.value).transformDirection(inv)
    else u.uLight.value.copy(u.uSun.value)
  }

  private dropDetail() {
    this.detailReq++
    this.detail.patch = null
    this.detail.group.visible = false
    this.detailWant = null
    this.terrain.setHole(null)
  }

  /** Request a finer square where the camera looks closely; called a few times a second in the terrain views. */
  private updateLod() {
    const base = this.terrain.patch
    if (!base || !this.frame || this.mode === 'rover') { if (this.detail.group.visible) this.dropDetail(); return }
    let fe: number, fn: number, span: number
    if (this.mode === 'surface') { fe = this.walk.e; fn = this.walk.n; span = 24000 }
    else if (this.mode === 'map') {
      const t = this.poleTopCtl.target, w = (this.terrTop.right - this.terrTop.left) / this.terrTop.zoom
      fe = t.x * 1000; fn = -t.z * 1000; span = w * 1000 * 1.4
    } else {
      const t = this.terrCtl.target, d = this.terrCam.position.distanceTo(t)
      fe = t.x * 1000; fn = -t.z * 1000; span = d * 1000 * 4.5
    }
    // only when zoomed in well past the base grid: the square must be clearly finer than the base cells
    const n = 1024
    if (span > base.spanM / 3) { if (this.detail.group.visible || this.detailWant) this.dropDetail(); return }
    span = Math.max(14000, span)
    if (span / n > (base.spanM / base.n) * 0.6) { if (this.detail.group.visible || this.detailWant) this.dropDetail(); return }
    const lim = base.spanM / 2 - span / 2
    fe = Math.max(-lim, Math.min(lim, fe)); fn = Math.max(-lim, Math.min(lim, fn))
    const cur = this.detailWant
    if (cur && Math.hypot(fe - cur.ce, fn - cur.cn) < cur.span * 0.22 && span / cur.span > 0.55 && span / cur.span < 1.8) return
    this.detailWant = { ce: fe, cn: fn, span }
    const req: PatchRequest = { id: ++this.detailReq, base: new URL(import.meta.env.BASE_URL, location.href).href, lat: this.frame.lat, lon: this.frame.lon, spanM: span, n, ce: fe, cn: fn, tag: 'detail' }
    this.worker?.postMessage(req)
  }

  private onDetail(p: PatchResult) {
    if (this.disposed || p.id !== this.detailReq || !p.ok || !this.terrain.patch) return
    this.detail.setPatch(p, this.renderer)
    this.detail.setBase(this.terrain)
    this.detail.setExaggeration(this.mode === 'surface' || this.mode === 'map' ? 1 : this.exag.terrain)
    this.detail.group.visible = true
    this.terrain.setHole({ ce: p.ce, cn: p.cn, span: p.spanM })
    this.visDirty = true
    if (this.layer === 'sunStay' || this.layer === 'earthStay') { this.stayKey = ''; this.queueStay() }
  }

  /** Sharper LRO imagery on the globe and the whole-Moon map: Moon Trek tiles at the zoom that matches the screen. */
  private updateImagery() {
    const im = this.imagery
    if (!im) return
    let lat = 0, lon = 0
    if (this.mode === 'globe') {
      // the point under the middle of the view, found by casting a ray through the screen centre
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(0, 0), this.globeCam)
      const o = ray.ray.origin, d = ray.ray.direction, bq = o.dot(d), disc = bq * bq - (o.lengthSq() - 1)
      const p = disc > 0 ? o.clone().addScaledVector(d, -bq - Math.sqrt(disc)).normalize() : o.clone().normalize()
      lat = Math.asin(p.y) / DEG; lon = Math.atan2(p.x, p.z) / DEG
    } else if (this.mode === 'map' && this.mapKind === 'global') {
      const t = this.mapCtl.target; lat = t.y * 90; lon = t.x * 90
    } else return
    const mpp = (this.metresPerPixel() ?? 1e9) / Math.min(window.devicePixelRatio || 1, 2)
    // tile pixel at zoom z covers π·R / (256·2^z) metres in latitude; pick the first z at least as fine as a screen pixel
    let z = Math.ceil(Math.log2((Math.PI * R_M) / (256 * mpp)))
    // near the poles, the window must also span enough longitude for the visible ground
    const needDeg = ((mpp * this.host.clientWidth) / (R_M * Math.max(Math.cos(lat * DEG), 0.02))) / DEG
    z = Math.min(z, Math.floor(Math.log2((12 * 360) / (2 * Math.max(needDeg, 1e-6)))))
    z = Math.max(0, Math.min(MAX_ZOOM, z))
    im.request(lat, lon, z >= 4 ? z : 0)
    // never let the camera sink into the (exaggerated) terrain under it
    if (this.mode === 'globe') {
      const smp = this.sampler(), c = this.globeCam.position.clone().normalize()
      const h = smp ? smp.height(Math.asin(c.y) / DEG, Math.atan2(c.x, c.z) / DEG) : 0
      // and stop where the sharpest global photo (WAC, ~83 m per pixel at zoom 8) would be stretched more than ~2× on screen
      const H = Math.max(1, this.host.clientHeight) * Math.min(window.devicePixelRatio || 1, 2)
      const sharpAlt = (45 * H) / (2 * Math.tan((this.globeCam.fov * DEG) / 2)) / R_M
      this.globeCtl.minDistance = 1 + Math.max(sharpAlt, Math.max(-0.004, ((isNaN(h) ? 0 : h) * this.exag.globe) / R_M) + 0.006)
    } else {
      const H = Math.max(1, this.host.clientHeight) * Math.min(window.devicePixelRatio || 1, 2)
      this.mapCtl.maxZoom = Math.max(4, ((this.mapCam.top - this.mapCam.bottom) * (Math.PI / 2) * R_M) / (H * 45))
    }
  }
  private applyDetailImagery() {
    const L = this.imagery!.levels
    for (const u of [this.globe.uniforms, this.flat.uniforms]) {
      u.uDet0.value = L[0].texture; u.uDet1.value = L[1].texture; u.uDet2.value = L[2].texture
      u.uBox0.value.copy(L[0].box); u.uBox1.value.copy(L[1].box); u.uBox2.value.copy(L[2].box)
      u.uHasDet.value.set(L[0].ready ? 1 : 0, L[1].ready ? 1 : 0, L[2].ready ? 1 : 0)
    }
  }

  private fitTop(h: number) {
    const a = this.host.clientWidth / Math.max(1, this.host.clientHeight)
    this.terrTop.left = -h * Math.max(1, a); this.terrTop.right = h * Math.max(1, a)
    this.terrTop.top = h / Math.min(1, a); this.terrTop.bottom = -h / Math.min(1, a)
    this.terrTop.updateProjectionMatrix()
  }

  private poleHome(instant: boolean) {
    this.flyTo(this.terrCam, this.terrCtl, new THREE.Vector3(170, 260, 330), new THREE.Vector3(0, -6, 0), instant)
  }
  private droneHome(instant: boolean) {
    const y = this.groundY(0, 0)
    // start behind the site, looking towards the Sun, about 6 km up
    const s = this.sunDirScene.clone().setY(0)
    if (s.lengthSq() < 1e-6) s.set(0, 0, -1)
    s.normalize()
    const p = new THREE.Vector3(-s.x * 14, y + 6, -s.z * 14)
    this.flyTo(this.terrCam, this.terrCtl, p, new THREE.Vector3(0, y, 0), instant)
  }
  private sunYaw() { const v = this.sunDirScene; return Math.atan2(-v.x, -v.z) }

  private flyTo(cam: THREE.Camera, ctl: OrbitControls | null, pos: THREE.Vector3, target: THREE.Vector3, instant: boolean, arc = false) {
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cam.position.copy(pos); if (ctl) { ctl.target.copy(target); ctl.update() }
      this.fly = null
      return
    }
    this.fly = { cam, ctl, p0: cam.position.clone(), p1: pos.clone(), t0v: ctl ? ctl.target.clone() : new THREE.Vector3(), t1v: target.clone(), start: performance.now(), dur: 1500, arc }
  }

  // ------------------------------------------------------------------ geometry helpers
  private me(lat: number, lon: number) { const la = lat * DEG, lo = lon * DEG; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] }

  /** Sun unit vector and Earth position (metres) in the patch frame (east, north, up). */
  private localVectors(ms: number): [THREE.Vector3, THREE.Vector3] | null {
    const f = this.frame
    const buf = new Float64Array(6)
    if (!f || !sampleEphemeris(ms, buf)) return null
    const sl = Math.hypot(buf[0], buf[1], buf[2])
    const s = [buf[0] / sl, buf[1] / sl, buf[2] / sl]
    const e = [buf[3] * 1000 - f.o[0], buf[4] * 1000 - f.o[1], buf[5] * 1000 - f.o[2]]
    return [new THREE.Vector3(dot(s, f.e), dot(s, f.n), dot(s, f.u)), new THREE.Vector3(dot(e, f.e), dot(e, f.n), dot(e, f.u))]
  }

  /** Scene position (km) of a site inside the current patch, on the displayed surface; null if outside. */
  private siteLocal(s: SiteMark): THREE.Vector3 | null {
    const f = this.frame, p = this.terrain.patch
    if (!f || !p) return null
    const d = this.me(s.lat, s.lon)
    if (dot(d, f.u) < 0.9) return null
    const q = [d[0] * R_M - f.o[0], d[1] * R_M - f.o[1], d[2] * R_M - f.o[2]]
    const east = dot(q, f.e), north = dot(q, f.n)
    if (Math.abs(east) > p.spanM / 2 || Math.abs(north) > p.spanM / 2) return null
    return new THREE.Vector3(east / 1000, this.groundY(east, north), -north / 1000)
  }

  /** Patch-local (east, north) metres → lat/lon. */
  private localToLatLon(east: number, north: number): [number, number] {
    const f = this.frame!
    const q = [0, 1, 2].map((k) => f.u[k] * R_M + f.e[k] * east + f.n[k] * north)
    const l = Math.hypot(q[0], q[1], q[2])
    return [Math.asin(q[2] / l) / DEG, Math.atan2(q[1], q[0]) / DEG]
  }

  // ------------------------------------------------------------------ markers and labels
  private buildMarks() {
    for (const g of [this.globeMarks, this.mapMarks]) {
      g.children.forEach((c) => { const m = c as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      g.clear()
    }
    for (const s of this.sites) {
      const sel = s.id === this.selected?.id
      const col = sel ? 0xf4a259 : 0xeae6ff
      const smp = this.sampler(), hh = smp ? smp.height(s.lat, s.lon) : 0
      const pos = toScene(this.me(s.lat, s.lon)).multiplyScalar(1 + ((isNaN(hh) ? 0 : hh) * this.exag.globe) / R_M + 0.0015)
      const dotm = new THREE.Mesh(new THREE.SphereGeometry(sel ? 0.011 : 0.0065, 16, 12), new THREE.MeshBasicMaterial({ color: col }))
      dotm.position.copy(pos); dotm.userData = { id: s.id, pick: true }
      this.globeMarks.add(dotm)
      if (sel) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.029, 48), new THREE.MeshBasicMaterial({ color: 0xf4a259, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))
        ring.position.copy(pos); ring.lookAt(pos.clone().multiplyScalar(2)); ring.userData = { pulse: true, pick: false }
        this.globeMarks.add(ring)
      }
      const [x, y] = mapXY(s.lat, s.lon)
      const m2 = new THREE.Mesh(new THREE.CircleGeometry(sel ? 0.022 : 0.013, 20), new THREE.MeshBasicMaterial({ color: col }))
      m2.position.set(x, y, 0.01); m2.userData = { id: s.id, pick: true }
      this.mapMarks.add(m2)
    }
    this.placeTerrainMarks()
    // label elements
    const keep = new Set<string>()
    for (const s of this.sites) {
      keep.add('site:' + s.id)
      this.label('site:' + s.id, s.name, s.id === this.selected?.id ? 'xp-lbl xs sel' : 'xp-lbl xs')
    }
    for (const k of ['sun', 'earth', 'N', 'E', 'S', 'W', 'orbiter']) keep.add('b:' + k)
    keep.add('m:a'); keep.add('m:b')
    this.label('m:a', 'A', 'xp-lbl mpin'); this.label('m:b', 'B', 'xp-lbl mpin')
    this.label('b:orbiter', 'Orbiter · illustrative', 'xp-lbl body orb')
    this.label('b:sun', 'Sun', 'xp-lbl body sun'); this.label('b:earth', 'Earth', 'xp-lbl body earth')
    for (const k of ['N', 'E', 'S', 'W']) this.label('b:' + k, k, 'xp-lbl compass')
    for (const [k, el] of this.labelEls) if (!keep.has(k)) { el.remove(); this.labelEls.delete(k) }
  }
  private label(key: string, text: string, cls: string) {
    let el = this.labelEls.get(key)
    if (!el) { el = document.createElement('div'); this.labelLayer.appendChild(el); this.labelEls.set(key, el) }
    el.textContent = text; el.className = cls
    return el
  }

  private placeTerrainMarks() {
    this.terrMarks.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } })
    this.terrMarks.clear()
    if (!this.terrain.patch) return
    const k = this.markScale()
    for (const s of this.sites) {
      const p = this.siteLocal(s)
      if (!p) continue
      const sel = s.id === this.selected?.id
      const hgt = k * (sel ? 1.6 : 1)
      // each pin is a group standing at the site, scaled every frame so it stays readable at any zoom
      const pin = new THREE.Group()
      pin.position.copy(p); pin.userData = { site: s.id, h: hgt }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(k * 0.03, k * 0.03, hgt, 6), new THREE.MeshBasicMaterial({ color: sel ? 0xf4a259 : 0xeae6ff, transparent: true, opacity: 0.85 }))
      stem.position.y = hgt / 2
      const head = new THREE.Mesh(new THREE.SphereGeometry(k * (sel ? 0.16 : 0.11), 14, 10), new THREE.MeshBasicMaterial({ color: sel ? 0xf4a259 : 0xeae6ff }))
      head.position.y = hgt; head.userData = { id: s.id, pick: true }
      pin.add(stem, head)
      this.terrMarks.add(pin)
      if (sel) this.terrain.uniforms.uSel.value.set(p.x, this.mode === 'surface' || this.mode === 'rover' ? 0 : 1, p.z)
    }
    if (!this.sites.some((s) => s.id === this.selected?.id && this.siteLocal(s))) this.terrain.uniforms.uSel.value.set(0, 0, 0)
    this.terrMarks.visible = this.mode !== 'surface'
  }
  /** Scale pins and the site ring with the camera distance (pins never taller than ~4% of the view). */
  private scaleMarks() {
    const cam = this.activeCam()
    const ortho = (cam as THREE.OrthographicCamera).isOrthographicCamera
    const viewKm = ortho ? (this.terrTop.top - this.terrTop.bottom) / this.terrTop.zoom : 0
    let selDist = Infinity
    for (const pin of this.terrMarks.children) {
      const d = ortho ? viewKm : cam.position.distanceTo(pin.position)
      const s = Math.min(1, Math.max(0.004, (d * 0.045) / pin.userData.h))
      pin.scale.setScalar(s); pin.userData.s = s
      if (pin.userData.site === this.selected?.id) selDist = d
    }
    const span = this.terrain.patch ? this.terrain.patch.spanM / 1000 : 100
    this.terrain.uniforms.uSelR.value = Math.max(0.02, Math.min(span * 0.012, (isFinite(selDist) ? selDist : span) * 0.03))
  }
  private pinTop(id: string): number {
    const pin = this.terrMarks.children.find((c) => c.userData.site === id)
    return pin ? pin.userData.h * (pin.userData.s ?? 1) : 0
  }

  /** Pin height in km: big enough to find in the 600 km polar view, small enough not to block the drone. */
  private markScale() { return this.terrain.patch && this.terrain.patch.spanM > 300000 ? 9 : 0.9 }

  /** Screen rectangles of the floating panels, refreshed a few times a second; labels never draw under them. */
  private uiRects: DOMRect[] = []
  private uiRectsAt = 0
  private blockers(): DOMRect[] {
    const now = performance.now()
    if (now - this.uiRectsAt > 300) {
      this.uiRectsAt = now
      const root = this.host.parentElement
      this.uiRects = root ? [...root.querySelectorAll<HTMLElement>('[data-occlude]')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0) : []
    }
    return this.uiRects
  }

  private updateLabels(cam: THREE.Camera) {
    if (!this.opts.labels) return
    const w = this.host.clientWidth, h = this.host.clientHeight
    const hostRect = this.host.getBoundingClientRect()
    const blocks = this.blockers()
    // gather candidates with a priority, then place greedily so labels never pile up on each other
    const cand: { el: HTMLDivElement; x: number; y: number; pri: number }[] = []
    const put = (key: string, v: THREE.Vector3 | null, pri: number, occl?: () => boolean) => {
      const el = this.labelEls.get(key)
      if (!el) return
      if (!v || (occl && occl())) { el.style.opacity = '0'; return }
      const p = v.clone().project(cam)
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02) { el.style.opacity = '0'; return }
      cand.push({ el, x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, pri })
    }
    const showSites = this.mode !== 'surface' && this.mode !== 'rover'
    for (const s of this.sites) {
      const key = 'site:' + s.id
      const sel = s.id === this.selected?.id
      if (!showSites) { put(key, null, 0); continue }
      let v: THREE.Vector3 | null = null, occl: (() => boolean) | undefined
      if (this.mode === 'globe') {
        v = toScene(this.me(s.lat, s.lon)).multiplyScalar(1.01)
        const c = cam.position, d = v.clone().sub(c), t = -c.dot(d) / d.lengthSq()
        occl = () => t > 0 && t < 1 && c.clone().addScaledVector(d, t).length() < 0.995
      } else if (this.mode === 'map' && this.mapKind === 'global') { const [x, y] = mapXY(s.lat, s.lon); v = new THREE.Vector3(x, y, 0) }
      else { v = this.siteLocal(s); if (v) v.y += this.pinTop(s.id) }
      put(key, v, sel ? 100 : s.id.match(/^(im2|a11|cy3|ce6|shackleton)$/) ? 10 : 1, occl)
    }
    const terr = this.mode === 'drone' || this.mode === 'surface' || this.mode === 'rover'
    put('b:sun', terr ? cam.position.clone().addScaledVector(this.sunDirScene, 4000) : this.mode === 'globe' ? this.sunGlow.position.clone() : null, 50)
    put('b:earth', terr ? cam.position.clone().addScaledVector(this.earthDirScene, 4000) : null, 50)
    const comp: Record<string, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
    for (const k of Object.keys(comp)) put('b:' + k, this.mode === 'surface' ? cam.position.clone().add(new THREE.Vector3(comp[k][0] * 3000, 0, comp[k][1] * 3000)) : null, 60)
    const ends = this.mode === 'globe' ? this.mEnds.globe : this.mode === 'map' && this.mapKind === 'global' ? this.mEnds.map : this.mEnds.terr
    put('m:a', ends[0] ?? null, 95); put('m:b', ends[1] ?? null, 95)
    put('b:orbiter', this.mode === 'globe' && this.opts.orbiter ? this.orbiter.position : null, 20, () => {
      const c = cam.position, v = this.orbiter.position, d = v.clone().sub(c), t = -c.dot(d) / d.lengthSq()
      return t > 0 && t < 1 && c.clone().addScaledVector(d, t).length() < 0.999
    })

    cand.sort((a, b) => b.pri - a.pri)
    const placed: [number, number, number, number][] = []
    for (const c of cand) {
      const lw = c.el.offsetWidth || 60, lh = 22
      // site labels sit up and to the right of their pin (see .xp-lbl.xs margins)
      const box: [number, number, number, number] = c.el.classList.contains('xs') ? [c.x + 10, c.y - 24, c.x + 10 + lw, c.y - 24 + lh] : [c.x - lw / 2, c.y - lh / 2, c.x + lw / 2, c.y + lh / 2]
      const ax = hostRect.left, ay = hostRect.top
      const under = blocks.some((r) => box[2] + ax > r.left && box[0] + ax < r.right && box[3] + ay > r.top && box[1] + ay < r.bottom)
      const clash = placed.some((q) => box[2] > q[0] - 4 && box[0] < q[2] + 4 && box[3] > q[1] - 2 && box[1] < q[3] + 2)
      if (under || (clash && c.pri < 100)) { c.el.style.opacity = '0'; continue }
      placed.push(box)
      c.el.style.opacity = '1'
      c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`
    }
  }

  // ------------------------------------------------------------------ stay accumulation
  private queueStay() {
    if (!this.stay || !this.terrain.patch) return
    const key = `${this.patchKey}|${this.detail.patch ? this.detailReq : 0}|${this.stay.start}|${this.stay.days}`
    if (key === this.stayKey) return
    this.stayKey = key
    const n = Math.min(240, Math.max(24, Math.round(this.stay.days * 8)))
    const times = Array.from({ length: n }, (_, i) => this.stay!.start + ((i + 0.5) / n) * this.stay!.days * 86400000)
    this.terrain.startStay(times, this.renderer)
    if (this.detail.patch) this.detail.startStay(times, this.renderer)
    this.setStatus({ stay: { done: 0, total: n } })
  }

  // ------------------------------------------------------------------ input
  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }
  private activeCam(): THREE.Camera {
    if (this.mode === 'globe') return this.globeCam
    if (this.mode === 'map') return this.mapKind === 'global' ? this.mapCam : this.terrTop
    return this.terrCam
  }
  private pickLatLon(e: { clientX: number; clientY: number }): [number, number, number | null, number | null] | null {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(this.ndc(e), this.activeCam())
    const o = ray.ray.origin, d = ray.ray.direction
    if (this.mode === 'globe') {
      const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c
      if (disc < 0) return null
      const p = o.clone().addScaledVector(d, -b - Math.sqrt(disc)).normalize()
      return [Math.asin(p.y) / DEG, Math.atan2(p.x, p.z) / DEG, null, null]
    }
    if (this.mode === 'map' && this.mapKind === 'global') {
      const t = -o.z / d.z, x = o.x + d.x * t, y = o.y + d.y * t
      if (Math.abs(x) > 2 || Math.abs(y) > 1) return null
      return [y * 90, x * 90, null, null]
    }
    const p = this.terrain.patch
    if (!p || !this.frame) return null
    // march the ray against the displayed height field
    const half = p.spanM / 2000
    let t = 0, prev = 0
    const maxT = 6000
    for (let i = 0; i < 3000 && t < maxT; i++) {
      const q = o.clone().addScaledVector(d, t)
      const inside = Math.abs(q.x) <= half && Math.abs(q.z) <= half
      if (inside && q.y <= this.groundY(q.x * 1000, -q.z * 1000)) {
        let lo = prev, hi = t
        for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, qm = o.clone().addScaledVector(d, m); if (qm.y <= this.groundY(qm.x * 1000, -qm.z * 1000)) hi = m; else lo = m }
        const hit = o.clone().addScaledVector(d, hi)
        const east = hit.x * 1000, north = -hit.z * 1000
        const [la, lo2] = this.localToLatLon(east, north)
        return [la, lo2, this.sampleAt('h', east, north), this.sampleAt('slope', east, north)]
      }
      prev = t
      const step = Math.max((p.spanM / p.n) / 2000, (inside ? Math.abs(q.y - this.groundY(q.x * 1000, -q.z * 1000)) * 0.4 : t * 0.02 + 0.05))
      t += step
    }
    return null
  }

  private onDown = (e: PointerEvent) => {
    this.down = [e.clientX, e.clientY]
    this.fly = null
    if (this.mode === 'surface' || this.mode === 'rover') { this.look.drag = [e.clientX, e.clientY]; this.renderer.domElement.setPointerCapture(e.pointerId) }
  }
  private onUp = (e: PointerEvent) => {
    this.look.drag = null
    if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5) return
    if (this.measuring) { const r = this.pickLatLon(e); if (r) this.addMeasurePoint(r[0], r[1]); return }
    const ray = new THREE.Raycaster()
    ray.setFromCamera(this.ndc(e), this.activeCam())
    const group = this.mode === 'globe' ? this.globeMarks : this.mode === 'map' && this.mapKind === 'global' ? this.mapMarks : this.terrMarks
    ray.params.Points = { threshold: 0.02 }
    const hits = ray.intersectObjects(group.children).filter((h) => h.object.userData.pick)
    if (hits.length) { this.cb.onSelect(hits[0].object.userData.id); return }
    // tolerant pick: nearest site within 14 px
    const cam = this.activeCam(), w = this.host.clientWidth, h = this.host.clientHeight, r = this.renderer.domElement.getBoundingClientRect()
    let best: string | null = null, bd = 14
    for (const s of this.sites) {
      const el = this.labelEls.get('site:' + s.id)
      if (!el || el.style.opacity === '0') continue
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform)
      if (!m) continue
      const dd = Math.hypot(Number(m[1]) - (e.clientX - r.left), Number(m[2]) - (e.clientY - r.top))
      if (dd < bd) { bd = dd; best = s.id }
    }
    void cam; void w; void h
    if (best) this.cb.onSelect(best)
  }
  private onMove = (e: PointerEvent) => {
    if ((this.mode === 'surface' || (this.mode === 'rover' && this.rover.cam === 'mast')) && this.look.drag) {
      const [x, y] = this.look.drag
      this.look.yaw += (e.clientX - x) * 0.0032
      this.look.pitch = Math.max(-1.2, Math.min(1.45, this.look.pitch + (e.clientY - y) * 0.0032))
      this.look.drag = [e.clientX, e.clientY]
    } else if (this.mode === 'rover' && this.look.drag) {
      const [x] = this.look.drag
      this.rover.camYaw -= (e.clientX - x) * 0.006
      this.look.drag = [e.clientX, e.clientY]
    }
    const now = performance.now()
    if (now - this.hoverAt < 60) return
    this.hoverAt = now
    const r = this.pickLatLon(e)
    if (!r) { this.cb.onHover(null); return }
    const d = getMoonData()
    let [lat, lon, hM, sl] = r
    let source = this.status.resolution
    if (hM === null && d?.global && (this.mode === 'globe' || this.mode === 'map')) {
      const g = d.global
      const fx = Math.floor(((lon + 180) / 360) * g.width) % g.width, fy = Math.min(g.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.height)))
      hM = g.data[fy * g.width + fx] / 2 - 10000
      const ex = g.data[fy * g.width + ((fx + 1) % g.width)] / 2 - 10000, ny = g.data[Math.max(0, fy - 1) * g.width + fx] / 2 - 10000
      const dx = Math.max(Math.cos(lat * DEG), 0.03) * (2 * Math.PI * R_M) / g.width, dy = Math.PI * R_M / g.height
      sl = Math.atan(Math.hypot((ex - hM) / dx, (ny - hM) / dy)) / DEG
      source = `LOLA global, ~${(dy / 1000).toFixed(1)} km grid`
    }
    this.cb.onHover({ lat, lon, heightM: hM, slopeDeg: sl, source })
  }
  private onDbl = (e: MouseEvent) => {
    const r = this.pickLatLon(e)
    if (r) this.cb.onPick(r[0], r[1])
  }
  private static MOVE_KEYS = ['w', 'a', 's', 'd', 'q', 'e', ' ', 'pageup', 'pagedown', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']
  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  }
  private onKey = (e: KeyboardEvent) => {
    if (this.typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (ExplorerEngine.MOVE_KEYS.includes(k)) {
      this.input.keys.add(k)
      // arrows and Space would otherwise scroll the page or press the focused button
      if (k === ' ' || k.startsWith('arrow') || k.startsWith('page')) e.preventDefault()
    }
    if (e.repeat) return
    if (k === 'l' && this.mode === 'rover') this.roverAction('lights')
    if (k === 'c' && this.mode === 'rover') this.roverAction('cam')
    if (k === 'r') this.resetView()
    if (k === 'f') this.focusSelected()
    if (k === 'm') this.setMeasuring(!this.measuring)
    if (k === 'escape' && this.measuring) this.setMeasuring(false)
  }
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    this.input.keys.delete(k)
    if (k === 'shift') this.input.keys.delete('shift')
    if (k === ' ' && !this.typing(e)) e.preventDefault()
  }
  private onBlur = () => this.input.keys.clear()
  private onVisibility = () => { if (document.hidden) cancelAnimationFrame(this.raf); else { this.clock.update(); this.loop() } }

  private move(dt: number) {
    const a = this.input.read()
    const fast = a.boost ? 3 : 1
    if (this.mode === 'surface') {
      // arrows (or right stick) look around; W A S D (or left stick) walk at an astronaut's 1.5 m/s, Shift runs ×8
      this.look.yaw -= a.turn * dt * 1.1
      this.look.pitch = Math.max(-1.2, Math.min(1.45, this.look.pitch + (a.arrowY + a.lookY) * dt * 0.8))
      if (a.fwd || a.strafe) {
        const sp = 1.5 * fast * (a.boost ? 8 / 3 : 1) * dt
        const fe = -Math.sin(this.look.yaw), fn = Math.cos(this.look.yaw) // camera forward in (east, north)
        const lim = this.terrain.patch ? this.terrain.patch.spanM / 2 - 500 : 0
        this.walk.e = Math.max(-lim, Math.min(lim, this.walk.e + (fe * a.fwd + fn * a.strafe) * sp))
        this.walk.n = Math.max(-lim, Math.min(lim, this.walk.n + (fn * a.fwd - fe * a.strafe) * sp))
          }
      return
    }
    if (this.mode === 'rover') { this.driveRover(dt, a.brake ? 0 : clampAxis(a.fwd + a.arrowY), clampAxis(a.strafe + a.turn), a.brake); return }
    if (this.mode !== 'drone' && this.mode !== 'pole') return
    a.fwd = clampAxis(a.fwd + a.arrowY)
    if (!a.fwd && !a.strafe && !a.turn && !a.lift) return
    const cam = this.terrCam, ctl = this.terrCtl
    const fwd = ctl.target.clone().sub(cam.position).setY(0)
    if (fwd.lengthSq() < 1e-9) return
    fwd.normalize()
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    const dist = cam.position.distanceTo(ctl.target)
    const v = Math.max(0.3, dist * 0.6) * dt * fast
    const mv = fwd.multiplyScalar(a.fwd * v).add(right.multiplyScalar(a.strafe * v))
    const half = this.terrain.patch ? this.terrain.patch.spanM / 2000 - 1 : 1e9
    const t = ctl.target.clone().add(mv)
    t.x = Math.max(-half, Math.min(half, t.x)); t.z = Math.max(-half, Math.min(half, t.z))
    const delta = t.clone().sub(ctl.target)
    delta.y = this.groundY(t.x * 1000, -t.z * 1000) - ctl.target.y
    ctl.target.add(delta); cam.position.add(delta)
    if (a.turn) {
      const off = cam.position.clone().sub(ctl.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a.turn * dt * 1.1)
      cam.position.copy(ctl.target).add(off)
    }
    if (a.lift > 0) cam.position.y += v * 0.6 * a.lift
    if (a.lift < 0) cam.position.y = Math.max(ctl.target.y + 0.05, cam.position.y + v * 0.6 * a.lift)
  }

  // ------------------------------------------------------------------ rover
  setVirtual(v: Partial<Virtual>) { this.input.virtual = { ...this.input.virtual, ...v } }
  get gamepad() { return this.input.gamepadName }

  roverAction(cmd: 'cam' | 'lights' | 'reset' | 'speed', value?: RoverSpeed) {
    const r = this.rover
    if (cmd === 'cam') { r.cam = r.cam === 'chase' ? 'mast' : 'chase'; this.look.yaw = 0; this.look.pitch = -0.08 }
    if (cmd === 'lights') r.lights = !r.lights
    if (cmd === 'speed' && value) r.speed = value
    if (cmd === 'reset' && this.selected) { r.placed = false; r.trail = []; r.dist = 0; r.battery = 82; this.placeRover() }
    this.sendRover(true)
  }

  /** Put the rover at the selected site (first entry) or keep it where it was after a patch rebuild. */
  private placeRover() {
    const r = this.rover
    if (!this.frame || !this.terrain.patch) return
    if (!r.placed && this.selected) { r.lat = this.selected.lat; r.lon = this.selected.lon; r.heading = this.sunDirScene.lengthSq() ? Math.atan2(this.sunDirScene.x, -this.sunDirScene.z) : 0; r.placed = true }
    const d = this.me(r.lat, r.lon), f = this.frame
    const q = [d[0] * R_M - f.o[0], d[1] * R_M - f.o[1], d[2] * R_M - f.o[2]]
    r.e = dot(q, f.e); r.n = dot(q, f.n)
    r.lastSky = 0
  }

  private terrainNormal(e: number, n: number, step: number): THREE.Vector3 {
    const t = this.terrain
    const hx = (t.surfaceY(e + step, n) - t.surfaceY(e - step, n)) * 1000 / (2 * step)
    const hy = (t.surfaceY(e, n + step) - t.surfaceY(e, n - step)) * 1000 / (2 * step)
    return new THREE.Vector3(-hx, 1, hy).normalize() // scene axes: x east, y up, z south
  }

  private driveRover(dt: number, throttle: number, steer: number, brake = false) {
    const r = this.rover, p = this.terrain.patch
    if (!p || !this.frame) return
    const spec = ROVER_SPEEDS.find((s) => s.id === r.speed)!
    const vmax = spec.mps * spec.scale
    // smooth acceleration; steering rate falls off at speed
    r.v += (throttle * vmax - r.v) * Math.min(1, dt * (brake ? 8 : 2.5))
    r.heading += steer * dt * 0.9
    const fe = Math.sin(r.heading), fn = Math.cos(r.heading)
    const look = Math.max(4, p.spanM / p.n)
    const h0 = this.terrain.surfaceY(r.e, r.n) * 1000
    const h1 = this.terrain.surfaceY(r.e + fe * look * Math.sign(r.v || 1), r.n + fn * look * Math.sign(r.v || 1)) * 1000
    const grade = Math.atan((h1 - h0) / look) / DEG
    r.blocked = null
    if (grade > MAX_CLIMB_DEG && Math.abs(r.v) > 0.001) { r.blocked = `Too steep: ${grade.toFixed(0)}° ahead (limit ${MAX_CLIMB_DEG}°)`; r.v = 0 }
    if (r.battery <= 0.5) { r.blocked = 'Battery empty — park in sunlight to recharge'; r.v = Math.min(r.v, 0) }
    const step = r.v * dt
    r.e += fe * step; r.n += fn * step
    r.dist += Math.abs(step)
    const lim = p.spanM / 2 * 0.92
    if (Math.abs(r.e) > lim || Math.abs(r.n) > lim) {
      // near the edge of the loaded terrain: rebuild it around the rover
      ;[r.lat, r.lon] = this.localToLatLon(r.e, r.n)
      this.patchKey = ''
      this.ensurePatch()
    }
    // illustrative power budget: solar charging scales with visible Sun, driving and keeping warm cost power
    r.battery = Math.max(0, Math.min(100, r.battery + dt * spec.scale * (0.004 * r.sunFrac - 0.0008 - 0.002 * Math.abs(r.v) / Math.max(vmax, 1e-6)) ))
    // pose on the terrain
    const y = this.terrain.surfaceY(r.e, r.n)
    const up = this.terrainNormal(r.e, r.n, 1.6)
    const fwd = new THREE.Vector3(fe, 0, -fn)
    fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize()
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize()
    const m = new THREE.Matrix4().makeBasis(right, up, fwd)
    this.roverGroup.position.set(r.e / 1000, y, -r.n / 1000)
    this.roverGroup.quaternion.setFromRotationMatrix(m)
    for (const w of this.roverModel.wheels) w.rotation.x += step / 0.32
    // trail every 2 m of travel
    const last = r.trail[r.trail.length - 1]
    const here = new THREE.Vector3(r.e / 1000, y + 0.0002, -r.n / 1000)
    if (!last || last.distanceTo(here) > 0.002) {
      r.trail.push(here)
      if (r.trail.length > 4000) r.trail.shift()
      this.trailLine.geometry.dispose()
      this.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(r.trail)
    }
    // sunlight and Earth at the rover, traced along the full LOLA data (out to 300 km), twice a second
    const now = performance.now()
    if (now - r.lastSky > 500) {
      r.lastSky = now
      ;[r.lat, r.lon] = this.localToLatLon(r.e, r.n)
      const d = getMoonData(), smp = d ? makeSampler(d) : null
      const k = computeSky(makeFrame(r.lat, r.lon), SPHERE_HORIZON, this.timeMs, newSky())
      if (k.ok && smp) {
        const hs = horizonAngle(smp, r.lat, r.lon, k.sunAz, 1.5), he = horizonAngle(smp, r.lat, r.lon, k.earthAz, 2.5)
        const x = (k.sunEl - hs) / k.sunR
        r.sunFrac = x >= 1 ? 1 : x <= -1 ? 0 : 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI
        r.sunEl = k.sunEl; r.earthEl = k.earthEl; r.earthUp = k.earthEl > he
      }
    }
    // rover lighting follows the real Sun and dims in shadow
    this.sunLight.position.copy(this.roverGroup.position).add(this.lighting === 'full' ? this.terrain.uniforms.uLightScene.value : this.sunDirScene)
    this.sunLight.target.position.copy(this.roverGroup.position)
    this.sunLight.intensity = this.lighting === 'full' ? 1.6 : 0.15 + 2.6 * r.sunFrac
    // headlights on the terrain
    const tu = this.terrain.uniforms
    tu.uLamp.value = r.lights ? 1 : 0
    this.roverModel.lamp.getWorldPosition(tu.uLampPos.value)
    tu.uLampDir.value.copy(fwd).addScaledVector(up, -0.18).normalize()
    this.sendRover(false)
  }

  private sendRover(force: boolean) {
    const r = this.rover, now = performance.now()
    if (!this.cb.onRover || (!force && now - r.lastSent < 200)) return
    r.lastSent = now
    const spec = ROVER_SPEEDS.find((s) => s.id === r.speed)!
    const p = this.terrain.patch
    this.cb.onRover({
      lat: r.lat, lon: r.lon, elevM: p ? this.terrain.sample(p.h, r.e, r.n) : 0, slopeDeg: p ? this.terrain.sample(p.slope, r.e, r.n) : 0,
      headingDeg: ((r.heading / DEG) % 360 + 360) % 360, speedMps: Math.abs(r.v), timeScale: spec.scale, distM: r.dist,
      sunFrac: r.sunFrac, sunEl: r.sunEl, earthUp: r.earthUp, earthEl: r.earthEl, battery: r.battery, blocked: r.blocked, cam: r.cam, lights: r.lights,
    })
  }

  private roverCamera(dt: number) {
    const r = this.rover, cam = this.terrCam
    const base = this.roverGroup.position
    if (r.cam === 'mast') {
      const p = new THREE.Vector3(); this.roverModel.mastCam.getWorldPosition(p)
      cam.position.copy(p)
      cam.rotation.order = 'YXZ'
      cam.rotation.set(this.look.pitch, -r.heading + this.look.yaw, 0)
      return
    }
    const back = new THREE.Vector3(-Math.sin(r.heading + r.camYaw), 0, Math.cos(r.heading + r.camYaw))
    const want = base.clone().addScaledVector(back, r.camDist).add(new THREE.Vector3(0, r.camDist * 0.42, 0))
    const g = this.terrain.surfaceY(want.x * 1000, -want.z * 1000) + 0.0015
    if (want.y < g) want.y = g
    cam.position.lerp(want, Math.min(1, dt * 4))
    cam.lookAt(base.clone().add(new THREE.Vector3(0, 0.0012, 0)))
  }

  // ------------------------------------------------------------------ frame loop
  private setStatus(p: Partial<EngineStatus>) {
    this.status = { ...this.status, ...p }
    this.cb.onStatus(this.status)
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    // centre the 3D views in the space between the view tabs and the time dock, not behind the dock
    // and right of the docked toolbar
    const dock = this.host.parentElement?.querySelector<HTMLElement>('.xp-dock')?.offsetHeight ?? 0
    const rail = this.host.parentElement?.querySelector<HTMLElement>('.xp-rail')?.offsetWidth ?? 0
    const shift = Math.max(0, Math.round((dock + 28) / 2)), sx = -Math.round(rail / 2)
    for (const c of [this.globeCam, this.terrCam]) {
      c.aspect = w / h
      if (shift || sx) c.setViewOffset(w, h, sx, shift, w, h); else c.clearViewOffset()
      c.updateProjectionMatrix()
    }
    const a = w / h
    if (a > 2) { this.mapCam.left = -a; this.mapCam.right = a; this.mapCam.top = 1; this.mapCam.bottom = -1 }
    else { this.mapCam.left = -2; this.mapCam.right = 2; this.mapCam.top = 2 / a; this.mapCam.bottom = -2 / a }
    this.mapCam.updateProjectionMatrix()
    if (this.terrain.patch) this.fitTop(this.terrain.patch.spanM / 2000)
  }

  private render() {
    const cam = this.activeCam()
    const scene = this.mode === 'globe' ? this.globeScene : this.mode === 'map' && this.mapKind === 'global' ? this.mapScene : this.terrScene
    this.renderer.render(scene, cam)
  }

  private loop = () => {
    if (this.disposed) return
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.loop)
    this.clock.update()
    const dt = Math.min(0.1, this.clock.getDelta())
    if (this.status.blocked) { this.renderer.clear(); return }
    if (this.fly) {
      const f = this.fly, k = Math.min(1, (performance.now() - f.start) / f.dur), e = ease(k)
      if (f.arc) {
        const r0 = f.p0.length(), r1 = f.p1.length()
        const q = new THREE.Quaternion().setFromUnitVectors(f.p0.clone().normalize(), f.p1.clone().normalize())
        f.cam.position.copy(f.p0.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(q, e)).multiplyScalar(r0 + (r1 - r0) * e))
      } else f.cam.position.lerpVectors(f.p0, f.p1, e)
      if (f.ctl) f.ctl.target.lerpVectors(f.t0v, f.t1v, e)
      if (k >= 1) this.fly = null
    }
    this.move(dt)
    const terr = this.mode === 'pole' || this.mode === 'drone' || this.mode === 'rover' || this.mode === 'surface' || (this.mode === 'map' && this.mapKind === 'pole')
    if (terr && this.terrain.patch) {
      this.roverGroup.visible = this.trailLine.visible = this.mode === 'rover'
      if (this.mode === 'rover') this.roverCamera(dt)
      else this.terrain.uniforms.uLamp.value = 0
      // keep the drone above the ground
      if (this.mode === 'drone' || this.mode === 'pole') {
        const c = this.terrCam.position
        const g = this.groundY(c.x * 1000, -c.z * 1000) + 0.08
        if (Math.abs(c.x) < this.terrain.patch.spanM / 2000 && Math.abs(c.z) < this.terrain.patch.spanM / 2000 && c.y < g) c.y = g
      }
      if (this.mode === 'surface') {
        const y = this.groundY(this.walk.e, this.walk.n) + 0.0018
        this.terrCam.position.set(this.walk.e / 1000, y, -this.walk.n / 1000)
        this.terrCam.rotation.order = 'YXZ'
        this.terrCam.rotation.set(this.look.pitch, this.look.yaw, 0)
        this.terrCam.fov = 62; this.terrCam.updateProjectionMatrix()
      } else if (this.terrCam.fov !== 55) { this.terrCam.fov = 55; this.terrCam.updateProjectionMatrix() }
      const now = performance.now()
      if (this.visDirty && now - this.lastVisAt > 90) {
        const v = this.localVectors(this.timeMs)
        if (v) {
          this.terrain.computeVisibility(this.renderer, v[0], v[1])
          if (this.detail.patch && this.detail.group.visible) this.detail.computeVisibility(this.renderer, v[0], v[1])
        }
        this.visDirty = false
        this.lastVisAt = now
      }
      if (this.terrain.stayPending) {
        this.terrain.stepStay(this.renderer, 3, (ms) => this.localVectors(ms))
        this.setStatus({ stay: { done: this.terrain.stayDone, total: this.terrain.stayTotal } })
      } else if (this.detail.stayPending) this.detail.stepStay(this.renderer, 2, (ms) => this.localVectors(ms))
      this.updateContextGlobe()
      if (now - this.lodAt > 350) { this.lodAt = now; this.updateLod() }
      this.sky.group.visible = this.mode === 'drone' || this.mode === 'surface' || this.mode === 'pole' || this.mode === 'rover'
      this.sky.update(this.terrCam, this.sunDirScene, this.earthDirScene, this.sunR, this.earthR)
      this.terrMarks.visible = this.mode !== 'surface' && this.mode !== 'rover'
      this.scaleMarks()
    }
    this.ctxGlobe.mesh.visible = terr && !!this.terrain.patch
    this.globe.uniforms.uCamObj.value.copy(this.globeCam.position)
    if (this.mode === 'globe') {
      // zoom and turn in proportion to altitude, so close to the surface every scroll step is small and smooth
      const d = this.globeCam.position.length(), alt = Math.max(d - 1, 1e-4)
      this.globeCtl.zoomSpeed = Math.max(0.04, Math.min(1, (3 * alt) / d))
      this.globeCtl.rotateSpeed = Math.max(0.006, Math.min(0.5, alt * 0.45))
    }
    const tt = performance.now() / 1000
    this.paths.visible = (this.mode === 'surface' || this.mode === 'rover') && this.opts.paths && terr
    if (this.paths.visible) { if (!this.pathKey) this.buildPaths(); this.paths.position.copy(this.terrCam.position) }
    this.updateAstronaut(tt)
    const showOrb = this.mode === 'globe' && this.opts.orbiter
    this.orbiter.visible = this.orbitRing.visible = showOrb
    if (showOrb) {
      // polar orbit whose plane slowly turns; one revolution every 40 s (illustrative)
      const om = tt * 0.02, th = tt * (Math.PI * 2 / 40)
      const nrm = new THREE.Vector3(Math.cos(om), 0, Math.sin(om)), a = new THREE.Vector3(0, 1, 0), b = new THREE.Vector3().crossVectors(nrm, a)
      const pos = a.clone().multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th)).multiplyScalar(1.0576)
      const vel = a.clone().multiplyScalar(-Math.sin(th)).addScaledVector(b, Math.cos(th))
      this.orbiter.position.copy(pos)
      this.orbiter.up.copy(pos).normalize()
      this.orbiter.lookAt(pos.clone().add(vel))
      this.orbitRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm)
    }
    for (const c of [this.globeCtl, this.terrCtl, this.mapCtl, this.poleTopCtl]) if (c.enabled) c.update()
    if (!terr && performance.now() - this.lodAt > 400) { this.lodAt = performance.now(); this.updateImagery() }
    if (this.lighting === 'full' && this.mode === 'globe') {
      // light from just above and beside the viewer: the whole visible face is lit, with enough slant to read relief
      const c = this.globeCam, dir = c.position.clone().normalize()
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion)
      this.globe.uniforms.uLight.value.copy(dir).addScaledVector(up, 0.32).addScaledVector(right, -0.22).normalize()
    }
    if (terr && this.frame && this.icrf) {
      // local (east, up, south) ← Moon body-fixed ← ICRF, centred on the camera
      const f = this.frame, m = this.icrf
      const row = (v: number[], sgn = 1) => [0, 1, 2].map((j) => sgn * (v[0] * m[j] + v[1] * m[3 + j] + v[2] * m[6 + j]))
      this.terrStars.orient([...row(f.e), ...row(f.u), ...row(f.n, -1)], this.terrCam.position)
    }
    const t = performance.now() / 1000
    // globe markers keep a constant size on screen: shrink them as the camera comes down
    const gk = Math.max(0.004, Math.min(1, (this.globeCam.position.length() - 1) / 0.9))
    this.globeMarks.children.forEach((m) => m.scale.setScalar(gk * (m.userData.pulse ? 1 + 0.18 * Math.sin(t * 3) : 1)))
    this.render()
    this.updateLabels(this.activeCam())
  }
}
