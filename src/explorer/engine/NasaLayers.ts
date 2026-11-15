import * as THREE from 'three'

const PSR: string = (globalThis as { __KURO_PSR?: string }).__KURO_PSR ?? 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_Illumination_SPole65S_240m_EQ/1.0.0/default/default028mm'
/** Southern edge of the window we load: rows 30–31 of zoom 5 cover 78.75°S to the pole. */
export const PSR_LAT0 = -78.75

/**
 * NASA's map of permanently shadowed regions (PSRs) at the lunar South Pole: the LOLA team's binary product
 * (240 m, from the LDEM_75S_240M elevation model), served by NASA Moon Trek as equirectangular tiles whose alpha marks
 * permanent shadow. Loaded once, on demand, into a single texture covering 78.75°S–90°S. Used as its own layer and as
 * an independent check on KURO's own "Sun over stay" shadow tracing.
 */
export class PsrMap {
  texture: THREE.DataTexture | null = null
  state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
  private onReady: () => void

  constructor(onReady: () => void) { this.onReady = onReady }

  load() {
    if (this.state !== 'idle') return
    this.state = 'loading'
    const z = 5, cols = 2 ** (z + 1), rows = [30, 31], TW = 128 // tiles drawn at half width: 64 × 128 = 8192 px around
    const canvas = document.createElement('canvas'); canvas.width = cols * TW; canvas.height = rows.length * 256
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    let done = 0, ok = 0
    const total = cols * rows.length
    const finish = () => {
      if (ok < total * 0.8) { this.state = 'failed'; this.onReady(); return }
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const W = canvas.width, H = canvas.height
      const raw = new Uint8Array(W * H)
      for (let i = 0; i < raw.length; i++) raw[i] = px[i * 4 + 3] // alpha = permanent shadow
      // 3×3 smoothing (wrapping in longitude): edges become clean contours and isolated single pixels (< ~1 km) drop out
      const a = new Uint8Array(W * H)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(H - 1, Math.max(0, y + dy)); for (let dx = -1; dx <= 1; dx++) sum += raw[yy * W + ((x + dx + W) % W)] }
        a[y * W + x] = sum / 9
      }
      const t = new THREE.DataTexture(a, canvas.width, canvas.height, THREE.RedFormat, THREE.UnsignedByteType)
      t.minFilter = t.magFilter = THREE.LinearFilter
      t.wrapS = THREE.RepeatWrapping
      t.flipY = false
      t.needsUpdate = true
      this.texture = t
      this.state = 'ready'
      this.onReady()
    }
    rows.forEach((r, ri) => {
      for (let c = 0; c < cols; c++) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => { ctx.drawImage(img, c * TW, ri * 256, TW, 256); ok++; if (++done === total) finish() }
        img.onerror = () => { if (++done === total) finish() }
        img.src = `${PSR}/${z}/${r}/${c}.png`
      }
    })
  }
  dispose() { this.texture?.dispose() }
}

/** GLSL: NASA permanent-shadow value (0…1) at a latitude/longitude in degrees. */
export const PSR_GLSL = /* glsl */ `
uniform sampler2D uPsr; uniform float uHasPsr;
float psrAt(float latDeg, float lonDeg) {
  if (uHasPsr < 0.5 || latDeg > ${PSR_LAT0.toFixed(2)}) return 0.0;
  return textureLod(uPsr, vec2((lonDeg + 180.0) / 360.0, (${PSR_LAT0.toFixed(2)} - latDeg) / (90.0 + ${PSR_LAT0.toFixed(2)})), 0.0).r;
}
// colour a surface by NASA's PSRs: icy blue fill inside the 50% contour and a crisp outline
vec3 psrOverlay(vec3 col, float p, float fill) {
  float w = max(fwidth(p) * 1.2, 1e-3);
  float inside = smoothstep(0.5 - w, 0.5 + w, p);
  float edge = 1.0 - smoothstep(0.0, w * 1.6, abs(p - 0.5));
  col = mix(col, vec3(0.32, 0.78, 1.0) * (0.35 + 0.65 * max(max(col.r, col.g), col.b) + 0.25), inside * fill);
  return mix(col, vec3(0.75, 0.95, 1.0), edge * 0.9);
}
`
export const psrUniforms = () => ({ uPsr: { value: null as THREE.Texture | null }, uHasPsr: { value: 0 } })
