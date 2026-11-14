import * as THREE from 'three'
import { LOG_DEPTH_FRAG, LOG_DEPTH_FRAG_PARS, LOG_DEPTH_VERT, LOG_DEPTH_VERT_PARS } from './glsl'

/** B−V colour index → approximate RGB of the star's blackbody colour (Ballesteros 2012 temperature, then a fitted ramp). */
function bvColor(bv: number): [number, number, number] {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
  const k = t / 100
  const r = k <= 66 ? 1 : Math.min(1, 1.2929 * Math.pow(k - 60, -0.1332))
  const g = k <= 66 ? Math.min(1, Math.max(0, 0.3901 * Math.log(k) - 0.6318)) : Math.min(1, 1.1299 * Math.pow(k - 60, -0.0755))
  const b = k >= 66 ? 1 : k <= 19 ? 0 : Math.min(1, Math.max(0, 0.5432 * Math.log(k - 10) - 1.1962))
  return [r, g, b]
}

const starVert = `${LOG_DEPTH_VERT_PARS}
attribute float aSize; varying vec3 vC; uniform float uPx;
void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx; ${LOG_DEPTH_VERT} }`
const starFrag = `${LOG_DEPTH_FRAG_PARS}
varying vec3 vC; uniform float uGain;
void main(){ ${LOG_DEPTH_FRAG} vec2 p = gl_PointCoord - 0.5; float r = length(p);
  float a = exp(-r * r * 9.0) + 0.2 * exp(-r * r * 3.0);
  gl_FragColor = vec4(vC * a * uGain, 1.0); }`
const mwVert = `${LOG_DEPTH_VERT_PARS}
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${LOG_DEPTH_VERT} }`
const mwFrag = `${LOG_DEPTH_FRAG_PARS}
uniform sampler2D uMw; uniform float uGain; varying vec3 vDir;
void main(){ ${LOG_DEPTH_FRAG}
  vec3 d = normalize(vDir);
  float ra = atan(d.y, d.x), dec = asin(clamp(d.z, -1.0, 1.0));
  vec2 uv = vec2(ra / 6.2831853 + 0.5, 0.5 - dec / 3.1415927);
  float m = texture2D(uMw, uv).r;
  vec3 c = mix(vec3(0.55, 0.62, 0.85), vec3(1.0, 0.9, 0.78), smoothstep(0.3, 0.9, m));
  gl_FragColor = vec4(c * pow(m, 1.4) * uGain, 1.0); }`

/**
 * The real night sky: 41 411 stars to magnitude 8 (Hipparcos / Yale Bright Star data via d3-celestial) at their
 * catalogue positions and colours, plus the Milky Way's measured outline. Geometry is in ICRF; the group is turned
 * into the scene with the IAU lunar rotation model, so the sky wheels overhead exactly as it does from the Moon.
 * If the catalogue cannot load, a seeded decorative field stands in.
 */
export class StarSky {
  group = new THREE.Group()
  private stars: THREE.Points | null = null
  private mw: THREE.Mesh | null = null
  private uniforms = { uPx: { value: Math.min(window.devicePixelRatio, 2) }, uGain: { value: 1 } }
  private mwUniforms = { uMw: { value: null as THREE.Texture | null }, uGain: { value: 0.3 } }
  ready = false

  constructor(private radius: number) {
    this.group.renderOrder = -10
    this.group.matrixAutoUpdate = false
  }

  async load(base: string) {
    try {
      const res = await fetch(`${base}data/stars.bin`)
      if (!res.ok) throw new Error(String(res.status))
      const raw = new Int16Array(await res.arrayBuffer())
      const n = raw.length / 5
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const o = i * 5, R = this.radius / 32767
        pos[i * 3] = raw[o] * R; pos[i * 3 + 1] = raw[o + 1] * R; pos[i * 3 + 2] = raw[o + 2] * R
        const mag = raw[o + 3] / 1000, bv = raw[o + 4] / 1000
        const lum = Math.min(1.6, Math.max(0.3, Math.pow(10, -0.4 * (mag - 1.5)) ** 0.36))
        const c = bvColor(bv)
        col.set([c[0] * lum, c[1] * lum, c[2] * lum], i * 3)
        size[i] = 2.4 + 6 * Math.min(1, Math.max(0, (5 - mag) / 6.5)) ** 1.6
      }
      this.stars = this.points(pos, col, size)
    } catch {
      this.stars = this.decorative()
    }
    this.group.add(this.stars)
    new THREE.TextureLoader().load(`${base}data/milkyway.png`, (t) => {
      t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace
      this.mwUniforms.uMw.value = t
      this.mw = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 0.98, 96, 48), new THREE.ShaderMaterial({
        uniforms: this.mwUniforms, vertexShader: mwVert, fragmentShader: mwFrag, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
      }))
      this.mw.frustumCulled = false
      this.mw.renderOrder = -11
      this.group.add(this.mw)
    })
    this.ready = true
  }

  /** rot: row-major 3×3 scene ← ICRF. centre: where the sky is centred (the camera in the terrain views). */
  orient(rot: number[], centre?: THREE.Vector3) {
    const m = this.group.matrix
    m.set(rot[0], rot[1], rot[2], 0, rot[3], rot[4], rot[5], 0, rot[6], rot[7], rot[8], 0, 0, 0, 0, 1)
    if (centre) m.setPosition(centre)
    this.group.matrixWorldNeedsUpdate = true
  }
  /** Dim the sky (e.g. when the camera is on a sunlit surface the eye would adapt; kept gentle). */
  setGain(g: number) { this.uniforms.uGain.value = g; this.mwUniforms.uGain.value = 0.3 * g }

  private points(pos: Float32Array, col: Float32Array, size: Float32Array) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    const m = new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, uniforms: this.uniforms, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return p
  }
  private decorative() {
    const count = 4000, pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count)
    let s = 11
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < count; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z), b = 0.3 + Math.pow(rnd(), 4) * 0.9
      pos.set([r * Math.cos(a) * this.radius, r * Math.sin(a) * this.radius, z * this.radius], i * 3)
      col.set([b, b, b], i * 3); size[i] = 1.4 + Math.pow(rnd(), 6) * 3
    }
    return this.points(pos, col, size)
  }
  dispose() {
    this.stars?.geometry.dispose(); (this.stars?.material as THREE.Material | undefined)?.dispose()
    this.mw?.geometry.dispose(); (this.mw?.material as THREE.Material | undefined)?.dispose()
    this.mwUniforms.uMw.value?.dispose()
  }
}

function glowTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  for (const [o, s] of stops) grad.addColorStop(o, s)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const earthVert = `${LOG_DEPTH_VERT_PARS}\nvarying vec3 vN; varying vec3 vV;\nvoid main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; ${LOG_DEPTH_VERT} }`
const earthFrag = `${LOG_DEPTH_FRAG_PARS}\nuniform vec3 uSun; varying vec3 vN; varying vec3 vV;
void main(){ ${LOG_DEPTH_FRAG}
  vec3 n = normalize(vN);
  float d = max(dot(n, uSun), 0.0);
  float rim = pow(1.0 - max(dot(n, vV), 0.0), 3.0);
  vec3 ocean = vec3(0.10, 0.32, 0.78), cloud = vec3(0.92, 0.95, 1.0);
  vec3 c = mix(ocean, cloud, 0.28 + 0.25 * sin(n.y * 9.0 + n.x * 4.0) * sin(n.z * 7.0));
  vec3 col = c * (0.04 + 1.25 * d) + vec3(0.35, 0.6, 1.0) * rim * (0.25 + d);
  gl_FragColor = vec4(col, 1.0); }`

/**
 * Sun and Earth for the near-surface views. Both sit at a fixed large distance from the camera along their
 * true local directions, sized to their true angular diameters (Sun 0.53°, Earth ≈ 1.9°). Earth shows its
 * real phase, lit from the true Sun direction; its surface pattern is stylised.
 */
export class SkyBodies {
  group = new THREE.Group()
  private sunCore: THREE.Sprite
  private sunGlow: THREE.Sprite
  private earth: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private earthHalo: THREE.Sprite
  readonly dist: number

  constructor(dist: number) {
    this.dist = dist
    const core = glowTexture([[0, 'rgba(255,255,255,1)'], [0.42, 'rgba(255,250,235,1)'], [0.5, 'rgba(255,214,150,0.55)'], [1, 'rgba(255,170,80,0)']])
    const glow = glowTexture([[0, 'rgba(255,196,120,0.55)'], [0.18, 'rgba(255,160,80,0.22)'], [0.5, 'rgba(255,120,60,0.06)'], [1, 'rgba(255,120,60,0)']])
    this.sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: core, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true }))
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true }))
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) } }, vertexShader: earthVert, fragmentShader: earthFrag }))
    this.earthHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(120,170,255,0.35)'], [0.5, 'rgba(80,140,255,0.08)'], [1, 'rgba(80,140,255,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    this.group.add(this.sunGlow, this.sunCore, this.earthHalo, this.earth)
    this.group.renderOrder = -5
  }

  /** sun/earth: unit directions in scene axes. Angular radii in radians. */
  update(camera: THREE.Camera, sun: THREE.Vector3, earth: THREE.Vector3, sunR: number, earthR: number) {
    this.group.position.copy(camera.position)
    const D = this.dist
    const s = Math.tan(sunR) * D * 2
    this.sunCore.position.copy(sun).multiplyScalar(D); this.sunCore.scale.setScalar(s * 2.2)
    this.sunGlow.position.copy(sun).multiplyScalar(D * 0.999); this.sunGlow.scale.setScalar(s * 22)
    const e = Math.tan(earthR) * D
    this.earth.position.copy(earth).multiplyScalar(D); this.earth.scale.setScalar(e)
    this.earthHalo.position.copy(this.earth.position); this.earthHalo.scale.setScalar(e * 5)
    this.earth.material.uniforms.uSun.value.copy(sun)
  }
  dispose() {
    for (const s of [this.sunCore, this.sunGlow, this.earthHalo]) { s.material.map?.dispose(); s.material.dispose() }
    this.earth.geometry.dispose(); this.earth.material.dispose()
  }
}
