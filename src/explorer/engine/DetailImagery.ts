import * as THREE from 'three'

const TREK: string = (globalThis as { __KURO_TREK?: string }).__KURO_TREK ?? 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm'
const MAXC = 16, ROWS = 5, TILE = 256
/** Default window width in tiles; near the poles a window widens (up to MAXC) to span the longitudes on screen. */
export const COLS = 6
/** Finest Moon Trek level of the LRO WAC mosaic: 2^(z+1) × 2^z tiles of 256 px, so z = 8 is ~83 m per pixel. */
export const MAX_ZOOM = 8
const MAX_INFLIGHT = 8

/** Shared tile cache and download queue: finest level first, nearest the middle of the view first; stale requests dropped. */
class TileStore {
  private cache = new Map<string, HTMLImageElement>()
  private failed = new Set<string>()
  private inflight = new Set<string>()
  private queue: { url: string; prio: number; owner: Level; gen: number }[] = []
  failures = 0
  okCount = 0

  get(url: string) { return this.cache.get(url) }
  want(url: string, prio: number, owner: Level, gen: number) {
    if (this.cache.has(url) || this.inflight.has(url) || this.failed.has(url)) return
    this.queue.push({ url, prio, owner, gen })
  }
  /** Forget queued (not yet started) requests a level no longer needs. */
  prune() { this.queue = this.queue.filter((q) => q.gen === q.owner.gen) }
  pump() {
    this.queue.sort((a, b) => a.prio - b.prio)
    while (this.inflight.size < MAX_INFLIGHT && this.queue.length) {
      const q = this.queue.shift()!
      if (q.gen !== q.owner.gen || this.cache.has(q.url) || this.inflight.has(q.url)) continue
      this.inflight.add(q.url)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        this.inflight.delete(q.url); this.okCount++; this.failures = 0
        this.cache.set(q.url, img)
        if (this.cache.size > 900) this.cache.delete(this.cache.keys().next().value!)
        q.owner.tileArrived(q.url, img)
        this.pump()
      }
      img.onerror = () => { this.inflight.delete(q.url); this.failed.add(q.url); this.failures++; this.pump() }
      img.src = q.url
    }
  }
}

/** One window of tiles at one zoom level, drawn into a canvas texture; missing tiles stay transparent. */
class Level {
  readonly canvas = document.createElement('canvas')
  readonly ctx: CanvasRenderingContext2D
  readonly texture: THREE.CanvasTexture
  readonly box = new THREE.Vector4(0, 0, 1, 1)
  ready = false
  gen = 0
  private key = ''
  private slots = new Map<string, [number, number]>() // url → canvas cell
  private dirtyAt = 0
  private dirty = false

  constructor(private store: TileStore, private rank: number, maxAniso: number, private onChange: () => void) {
    this.canvas.width = MAXC * TILE; this.canvas.height = ROWS * TILE
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.flipY = false
    this.texture.premultiplyAlpha = true
    this.texture.anisotropy = maxAniso
    this.texture.minFilter = THREE.LinearMipmapLinearFilter
  }

  clear() { if (this.key) { this.key = ''; this.gen++; this.ready = false; this.onChange() } }

  request(lat: number, lon: number, z: number, nc = COLS) {
    const cols = 2 ** (z + 1), rows = 2 ** z, deg = 180 / rows
    const nr = Math.min(ROWS, rows)
    nc = Math.max(1, Math.min(MAXC, nc, cols))
    const fc = (lon + 180) / deg, fr = (90 - lat) / deg
    const c0 = Math.round(fc - nc / 2), r0 = Math.max(0, Math.min(rows - nr, Math.round(fr - nr / 2)))
    const wc = ((c0 % cols) + cols) % cols
    const key = `${z}/${r0}/${wc}/${nc}`
    if (key === this.key) return
    this.key = key
    this.gen++
    this.slots.clear()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    // the texture always spans MAXC × ROWS tiles; the box covers only the part in use
    this.box.set(wc / cols, r0 / rows, MAXC / cols, ROWS / rows)
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const url = `${TREK}/${z}/${r0 + r}/${(((c0 + c) % cols) + cols) % cols}.jpg`
      this.slots.set(url, [c, r])
      const hit = this.store.get(url)
      if (hit) this.ctx.drawImage(hit, c * TILE, r * TILE, TILE, TILE)
      // finest level first (rank 0), then by distance from the middle of the view
      else this.store.want(url, this.rank * 1000 + Math.hypot(c + 0.5 - (fc - c0), r + 0.5 - (fr - r0)), this, this.gen)
    }
    this.ready = true
    this.flush(true)
  }

  tileArrived(url: string, img: HTMLImageElement) {
    const s = this.slots.get(url)
    if (!s) return
    this.ctx.drawImage(img, s[0] * TILE, s[1] * TILE, TILE, TILE)
    this.flush(false)
  }
  /** Re-upload the canvas at most a few times a second while tiles stream in. */
  flush(now: boolean) {
    this.dirty = true
    const t = performance.now()
    if (!now && t - this.dirtyAt < 180) { setTimeout(() => this.dirty && this.flush(true), 200); return }
    this.dirtyAt = t; this.dirty = false
    this.texture.needsUpdate = true
    this.onChange()
  }
  dispose() { this.texture.dispose() }
}

/**
 * Sharp imagery wherever you look, like a map app: three windows of NASA Moon Trek LRO WAC tiles centred on the view —
 * at the zoom that matches the screen and the two coarser zooms around it. Tiles stream in finest-first and are cached;
 * where a tile has not arrived the next coarser window (or the global map) shows through. Needs the network.
 */
export class DetailImagery {
  readonly levels: Level[] // [0] coarsest … [2] finest
  private store = new TileStore()

  constructor(maxAniso: number, onChange: () => void) {
    this.levels = [2, 1, 0].map((rank) => new Level(this.store, rank, maxAniso, onChange))
  }
  get available() { return this.store.okCount > 0 || this.store.failures < 12 }

  /** z: finest zoom wanted at (lat, lon), or 0 for none. Coarser levels z−1 and z−2 fill the surroundings. */
  request(lat: number, lon: number, z: number, spanDeg = 0) {
    if (!this.available) return
    for (let i = 0; i < 3; i++) {
      const zi = z - (2 - i)
      // enough columns to cover spanDeg of longitude at this zoom (more near the poles)
      const nc = Math.max(COLS, Math.ceil(spanDeg / (360 / 2 ** (zi + 1))) + 1)
      if (!z || zi < 4) this.levels[i].clear()
      else this.levels[i].request(lat, lon, zi, nc)
    }
    this.store.prune()
    this.store.pump()
  }
  dispose() { this.levels.forEach((l) => l.dispose()) }
}

/** GLSL: overlay the three windows on a base albedo, coarse to fine, with soft edges; untiled gaps show through. */
export const DETAIL_GLSL = /* glsl */ `
uniform sampler2D uDet0, uDet1, uDet2;
uniform vec4 uBox0, uBox1, uBox2;
uniform vec3 uHasDet;
float detEdge(vec2 d) { vec2 e = min(d, 1.0 - d); return (d.x > 0.0 && d.x < 1.0 && d.y > 0.0 && d.y < 1.0) ? smoothstep(0.0, 0.04, min(e.x, e.y)) : 0.0; }
vec2 detUV(vec2 uv, vec4 b) { return vec2(fract(uv.x - b.x), uv.y - b.y) / b.zw; }
vec3 detMix(vec3 c, inout float k, sampler2D t, vec4 box, vec2 uv) {
  vec2 d = detUV(uv, box); float w = detEdge(d);
  if (w <= 0.0) return c;
  vec4 s = texture(t, d);
  w *= clamp(s.a * 1.5 - 0.25, 0.0, 1.0);
  k = max(k, w);
  return mix(c, s.rgb / max(s.a, 1e-3), w);
}
// returns albedo, and in .w how much of it came from a detail window (0…1)
vec4 detailAlbedo(vec3 base, vec2 uv) {
  vec3 c = base; float k = 0.0;
  if (uHasDet.x > 0.5) c = detMix(c, k, uDet0, uBox0, uv);
  if (uHasDet.y > 0.5) c = detMix(c, k, uDet1, uBox1, uv);
  if (uHasDet.z > 0.5) c = detMix(c, k, uDet2, uBox2, uv);
  return vec4(c, k);
}
`
export const detailUniforms = () => ({
  uDet0: { value: null as THREE.Texture | null }, uDet1: { value: null as THREE.Texture | null }, uDet2: { value: null as THREE.Texture | null },
  uBox0: { value: new THREE.Vector4() }, uBox1: { value: new THREE.Vector4() }, uBox2: { value: new THREE.Vector4() },
  uHasDet: { value: new THREE.Vector3() },
})
