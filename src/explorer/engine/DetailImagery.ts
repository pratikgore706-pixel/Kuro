import * as THREE from 'three'

const TREK: string = (globalThis as { __KURO_TREK?: string }).__KURO_TREK ?? 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm'
const COLS = 12, ROWS = 6, TILE = 256
/** Finest Moon Trek level of the LRO WAC mosaic: 2^(z+1) × 2^z tiles of 256 px, so z = 8 is ~83 m per pixel. */
export const MAX_ZOOM = 8

/** One window of Moon Trek tiles at one zoom level. `box` = (u0, v0, du, dv) in equirectangular uv, v from the north. */
class Level {
  readonly canvas = document.createElement('canvas')
  readonly texture: THREE.CanvasTexture
  readonly box = new THREE.Vector4(0, 0, 1, 1)
  ready = false
  private key = ''
  private gen = 0

  constructor(maxAniso: number, private onChange: () => void, private onFail: () => void, private onOk: () => void) {
    this.canvas.width = COLS * TILE; this.canvas.height = ROWS * TILE
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.flipY = false
    this.texture.anisotropy = maxAniso
    this.texture.minFilter = THREE.LinearMipmapLinearFilter
  }

  clear() { this.gen++; this.key = ''; if (this.ready) { this.ready = false; this.onChange() } }

  request(lat: number, lon: number, z: number) {
    const cols = 2 ** (z + 1), rows = 2 ** z, deg = 180 / rows
    const nr = Math.min(ROWS, rows)
    const c0 = Math.round((lon + 180) / deg - COLS / 2), r0 = Math.max(0, Math.min(rows - nr, Math.round((90 - lat) / deg - nr / 2)))
    const wc = ((c0 % cols) + cols) % cols
    const key = `${z}/${r0}/${wc}`
    if (key === this.key) return
    this.key = key
    const gen = ++this.gen
    const off = document.createElement('canvas'); off.width = this.canvas.width; off.height = this.canvas.height
    const ctx = off.getContext('2d')!
    let ok = 0, done = 0
    const total = COLS * nr
    const finish = () => {
      if (gen !== this.gen) return
      if (ok < total * 0.6) { this.key = ''; this.onFail(); return }
      this.onOk()
      const g = this.canvas.getContext('2d')!
      g.clearRect(0, 0, this.canvas.width, this.canvas.height)
      g.drawImage(off, 0, 0)
      this.texture.needsUpdate = true
      this.box.set(wc / cols, r0 / rows, COLS / cols, nr / rows)
      this.ready = true
      this.onChange()
    }
    for (let r = 0; r < nr; r++) for (let c = 0; c < COLS; c++) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { if (gen === this.gen) { ctx.drawImage(img, c * TILE, r * TILE, TILE, TILE); ok++ } if (++done === total) finish() }
      img.onerror = () => { if (++done === total) finish() }
      img.src = `${TREK}/${z}/${r0 + r}/${(((c0 + c) % cols) + cols) % cols}.jpg`
    }
  }
  dispose() { this.texture.dispose() }
}

/**
 * Sharp imagery wherever you look, like a map app: three windows of NASA Moon Trek LRO WAC tiles centred on the view,
 * at the zoom that matches the screen and the two coarser zooms around it. The shader uses the finest window that
 * covers each pixel and blends across window edges. Needs the network; without it the global map stays.
 */
export class DetailImagery {
  readonly levels: Level[]
  private failures = 0

  constructor(maxAniso: number, onChange: () => void) {
    const fail = () => { this.failures++ }, ok = () => { this.failures = 0 }
    this.levels = [0, 1, 2].map(() => new Level(maxAniso, onChange, fail, ok))
  }
  get available() { return this.failures < 6 }

  /** z: finest zoom wanted at (lat, lon), or 0 for none. Coarser levels z−1 and z−2 fill the surroundings. */
  request(lat: number, lon: number, z: number) {
    if (!this.available) return
    for (let i = 0; i < 3; i++) {
      const zi = z - (2 - i) // levels[0] coarsest … levels[2] finest
      if (!z || zi < 4) this.levels[i].clear()
      else this.levels[i].request(lat, lon, zi)
    }
  }
  dispose() { this.levels.forEach((l) => l.dispose()) }
}

/** GLSL: overlay the three windows on a base albedo, coarse to fine, with soft edges. */
export const DETAIL_GLSL = /* glsl */ `
uniform sampler2D uDet0, uDet1, uDet2;
uniform vec4 uBox0, uBox1, uBox2;
uniform vec3 uHasDet;
float detEdge(vec2 d) { vec2 e = min(d, 1.0 - d); return (d.x > 0.0 && d.x < 1.0 && d.y > 0.0 && d.y < 1.0) ? smoothstep(0.0, 0.06, min(e.x, e.y)) : 0.0; }
vec2 detUV(vec2 uv, vec4 b) { return vec2(fract(uv.x - b.x), uv.y - b.y) / b.zw; }
// returns albedo, and in .w how much of it came from a detail window (0…1)
vec4 detailAlbedo(vec3 base, vec2 uv) {
  vec3 c = base; float k = 0.0;
  if (uHasDet.x > 0.5) { vec2 d = detUV(uv, uBox0); float w = detEdge(d); if (w > 0.0) { c = mix(c, texture(uDet0, d).rgb, w); k = max(k, w); } }
  if (uHasDet.y > 0.5) { vec2 d = detUV(uv, uBox1); float w = detEdge(d); if (w > 0.0) { c = mix(c, texture(uDet1, d).rgb, w); k = max(k, w); } }
  if (uHasDet.z > 0.5) { vec2 d = detUV(uv, uBox2); float w = detEdge(d); if (w > 0.0) { c = mix(c, texture(uDet2, d).rgb, w); k = max(k, w); } }
  return vec4(c, k);
}
`
export const detailUniforms = () => ({
  uDet0: { value: null as THREE.Texture | null }, uDet1: { value: null as THREE.Texture | null }, uDet2: { value: null as THREE.Texture | null },
  uBox0: { value: new THREE.Vector4() }, uBox1: { value: new THREE.Vector4() }, uBox2: { value: new THREE.Vector4() },
  uHasDet: { value: new THREE.Vector3() },
})
