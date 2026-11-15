import * as THREE from 'three'
import { PSR_GLSL, psrUniforms } from './NasaLayers'
import { DETAIL_GLSL, detailUniforms } from './DetailImagery'
import { COMMON, LOG_DEPTH_FRAG, LOG_DEPTH_FRAG_PARS, LOG_DEPTH_VERT, LOG_DEPTH_VERT_PARS } from './glsl'
import type { PatchResult } from './patchWorker'

/**
 * A square of real LOLA terrain in the local frame of its centre: x = east, y = up, z = south (kilometres).
 * A GPU pass ray-marches the elevation grid towards the Sun and Earth for every cell, so shadows and Earth
 * visibility come from the terrain itself, with lunar curvature, at the chosen instant.
 */

const quadVert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const visFrag = /* glsl */ `
uniform sampler2D uZ, uZB;
uniform float uSpan, uN, uSunR, uHasB, uSpanB, uSteps;
uniform vec2 uC, uCB;   // centres of this square and of the base square in the shared frame, metres (east, north)
uniform vec3 uSun;    // unit vector to the Sun, local (east, north, up) at the frame origin
uniform vec3 uEarth;  // Earth position relative to the frame origin, metres, same axes
varying vec2 vUv;
const float RM = 1737400.0;

vec3 P(vec2 uv) { return vec3(uC.x + (uv.x - 0.5) * uSpan, uC.y + (0.5 - uv.y) * uSpan, texture(uZ, uv).r); }

// terrain height (frame z, metres) at frame position xy: this square first, then the larger base square around it.
// Called inside a loop, so it samples at an explicit level (textureLod) and returns once — both keep Windows
// (Direct3D) shader compilers from rejecting the optimised build.
bool heightAt(vec2 xy, out float z) {
  z = 0.0;
  bool ok = false;
  vec2 uv = vec2((xy.x - uC.x) / uSpan + 0.5, 0.5 - (xy.y - uC.y) / uSpan);
  if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
    z = textureLod(uZ, uv, 0.0).r; ok = true;
  } else if (uHasB > 0.5) {
    vec2 ub = vec2((xy.x - uCB.x) / uSpanB + 0.5, 0.5 - (xy.y - uCB.y) / uSpanB);
    if (ub.x >= 0.0 && ub.y >= 0.0 && ub.x <= 1.0 && ub.y <= 1.0) { z = textureLod(uZB, ub, 0.0).r; ok = true; }
  }
  return ok;
}

// highest terrain elevation angle (radians) seen from f along the horizontal direction dir
float horizon(vec3 f, vec3 up, vec2 dir) {
  float cell = uSpan / uN;
  float best = -1.6;
  float d = cell;
  for (int i = 0; i < 280; i++) {
    if (float(i) >= uSteps) break;
    vec2 xy = f.xy + dir * d;
    float z;
    if (!heightAt(xy, z)) break;
    vec3 t = vec3(xy, z);
    best = max(best, asin(clamp(dot(normalize(t - f), up), -1.0, 1.0)));
    d = max(d + cell, d * 1.045);
  }
  return best;
}

void main() {
  vec3 f = P(vUv);
  f.z += 2.0; // observer 2 m above the ground
  vec3 up = normalize(vec3(f.xy, f.z + RM));
  float elS = asin(clamp(dot(uSun, up), -1.0, 1.0));
  vec3 hs = uSun - dot(uSun, up) * up;
  float sunFrac = 0.0;
  float hzS = -1.6;
  if (elS > -uSunR - 0.02) {
    hzS = horizon(f, up, normalize(hs.xy + 1e-9));
    sunFrac = discFraction((elS - hzS) / uSunR);
  }
  vec3 ve = uEarth - f;
  vec3 ue = normalize(ve);
  float elE = asin(clamp(dot(ue, up), -1.0, 1.0));
  vec3 he = ue - dot(ue, up) * up;
  float earthUp = 0.0;
  if (elE > -0.03) earthUp = step(horizon(f, up, normalize(he.xy + 1e-9)), elE);
  gl_FragColor = vec4(sunFrac, earthUp, clamp(hzS / 0.2 + 0.5, 0.0, 1.0), 1.0);
}`

const terrVert = /* glsl */ `
attribute float aH;
attribute float aSlope;
varying vec2 vUv;
varying vec3 vWorld;
varying float vH;
varying float vSlope;
void main() {
  vUv = uv; vH = aH; vSlope = aSlope;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${LOG_DEPTH_VERT}
}`

const terrFrag = /* glsl */ `
uniform sampler2D uVis, uStay, uH;
uniform float uLayer, uMinH, uMaxH, uStayN, uContours, uFill, uGrid, uSpanKm, uCellM, uExag;
uniform vec3 uSunScene, uEarthScene, uSel, uLampPos, uLampDir;
uniform float uLamp, uGrain, uFull, uSelR;
uniform vec4 uHole;      // (x, z, half-width) in scene km of a finer square drawn over this one; w > 0.5 enables
uniform vec3 uLightScene; // Full Moon mode: an even high light with no cast shadows
uniform vec3 uFrE, uFrN, uFrU; // the frame's east, north and up axes in Moon body-fixed coordinates (for latitude/longitude)
uniform sampler2D uColor; uniform float uHasColor; // global LRO WAC mosaic; NASA Moon Trek tiles sharpen it where you look
const float RKM = 1737.4;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y); }

// Decorative micro-relief below the 80 m LOLA grid (not data): one small crater per cell in some cells, plus regolith bumps.
float craterOct(vec2 m, float s) {
  vec2 c = floor(m / s), f = m / s - c, r = hash22(c);
  float rad = 0.1 + 0.22 * r.x;
  vec2 ctr = 0.5 + (hash22(c + 17.0) - 0.5) * (1.0 - 2.8 * rad);
  float d = length(f - ctr) / rad;
  float bowl = (d * d - 1.0) * step(d, 1.0);
  float rim = exp(-pow((d - 1.0) * 3.2, 2.0)) * 0.4;
  return (bowl + rim) * rad * s * 0.22 * step(0.4, r.y);
}
float micro(vec2 m, float fw) {
  float hgt = 0.0;
  float s = 220.0;
  for (int i = 0; i < 4; i++) {
    float fade = 1.0 - smoothstep(0.04, 0.16, fw / s);
    if (fade > 0.0) hgt += craterOct(m + float(i) * 37.0, s) * fade;
    s *= 0.3;
  }
  float fb = 1.0 - smoothstep(0.1, 0.5, fw / 3.0);
  hgt += (vnoise(m / 3.0) - 0.5) * 0.35 * fb + (vnoise(m / 11.0) - 0.5) * 0.9 * (1.0 - smoothstep(0.1, 0.5, fw / 11.0));
  return hgt;
}

varying vec2 vUv;
varying vec3 vWorld;
varying float vH;
varying float vSlope;
void main() {
  ${LOG_DEPTH_FRAG}
  if (uHole.w > 0.5 && abs(vWorld.x - uHole.x) < uHole.z && abs(vWorld.z - uHole.y) < uHole.z) discard;
  // per-pixel normal from the elevation grid, tilted with the Moon's curvature
  vec2 px = 1.0 / vec2(textureSize(uH, 0));
  float gE = (texture(uH, vUv + vec2(px.x, 0.0)).r - texture(uH, vUv - vec2(px.x, 0.0)).r) / (2.0 * uCellM);
  float gN = (texture(uH, vUv - vec2(0.0, px.y)).r - texture(uH, vUv + vec2(0.0, px.y)).r) / (2.0 * uCellM);
  vec3 upL = normalize(vec3(vWorld.x, vWorld.y + RKM, vWorld.z));
  vec3 m = vec3(vWorld.x, 0.0, -vWorld.z) * 1000.0; // east, -, north in metres
  float fw = length(fwidth(m.xz));
  if (uGrain > 0.5) {
    float e = max(fw * 0.5, 0.05);
    float h0 = micro(m.xz, fw);
    gE += (micro(m.xz + vec2(e, 0.0), fw) - h0) / e;
    gN += (micro(m.xz + vec2(0.0, e), fw) - h0) / e;
  }
  vec3 N = normalize(upL + vec3(-gE * uExag, 0.0, gN * uExag));
  vec3 nl = vec3(N.x, -N.z, N.y);
  vec3 V = normalize(cameraPosition - vWorld);
  vec4 vis = texture(uVis, vUv);
  // latitude and longitude of this point (Moon body-fixed), for NASA imagery and the shadowed-region map
  vec3 qme = uFrU * (RKM * 1000.0 + vWorld.y * 1000.0) + uFrE * (vWorld.x * 1000.0) - uFrN * (vWorld.z * 1000.0);
  float latD = degrees(asin(clamp(qme.z / length(qme), -1.0, 1.0))), lonD = degrees(atan(qme.y, qme.x));
  vec2 eqUV = vec2((lonD + 180.0) / 360.0, (90.0 - latD) / 180.0);
  float relief = hillshade(nl);
  float sunLight = uFull > 0.5 ? max(dot(N, uLightScene), 0.0) * 0.72 : lunarShade(dot(N, uSunScene), dot(N, V)) * vis.r;
  float earthshine = 0.03 * max(dot(N, uEarthScene), 0.0) * vis.g;
  int layer = int(uLayer + 0.5);
  vec3 col;
  vec3 warm = vec3(1.0, 0.95, 0.87);
  vec3 shade = vec3(0.5, 0.62, 1.0) * earthshine + vec3(0.06, 0.068, 0.11) * uFill * (0.35 + relief);
  if (layer == 8) {
    vec3 tint = rampElevation((vH - uMinH) / (uMaxH - uMinH));
    col = tint * (sunLight * 1.6 * warm + shade * 2.6 + 0.02);
  } else if (layer <= 1 || layer == 9) {
    if (uHasColor > 0.5) {
      // the real Moon: NASA's LRO photo (sharper tiles as you zoom), lit by the real Sun with KURO's traced shadows;
      // shadowed ground keeps a little of the photo so the terrain stays legible
      vec3 photo = detailAlbedo(textureLod(uColor, eqUV, 0.0).rgb, eqUV).rgb;
      col = photo * (0.2 + sunLight * 1.25) * warm * 1.15 + shade * 0.6;
      // under NASA's shadowed regions the ground is lit evenly: the layer is about permanent shadow, not today's Sun
      if (layer == 9) col = photo * (0.58 + 0.3 * max(dot(N, V), 0.0));
    } else col = vec3(0.68, 0.665, 0.64) * (layer == 9 ? vec3(0.58 + 0.3 * max(dot(N, V), 0.0)) : sunLight * 1.55 * warm) + shade;
  } else if (layer == 2) col = rampElevation((vH - uMinH) / (uMaxH - uMinH)) * relief;
  else if (layer == 3) col = rampSlope(vSlope / 40.0) * relief;
  else if (layer == 4) col = rampSun(vis.r * 0.85 + sunLight * 0.3) * (0.55 + 0.45 * relief);
  else if (layer == 5) col = rampEarth(0.12 + 0.75 * vis.g) * relief;
  else if (layer == 6) col = rampStay(texture(uStay, vUv).r / max(uStayN, 1.0)) * (0.65 + 0.35 * relief);
  else col = rampEarth(texture(uStay, vUv).g / max(uStayN, 1.0)) * (0.65 + 0.35 * relief);

  // NASA's permanently shadowed regions: its own layer, and drawn as outlines over KURO's Sun-over-stay as a cross-check
  if (uHasPsr > 0.5 && (layer == 9 || layer == 6)) {
    float p = psrAt(latD, lonD);
    col = psrOverlay(col + (layer == 9 ? 0.03 : 0.0), p, layer == 9 ? 0.85 : 0.0);
  }
  if (uGrain > 0.5) col *= 0.9 + 0.2 * vnoise(m.xz / 7.0) * (1.0 - smoothstep(0.2, 1.0, fw / 7.0)) + 0.06 * (vnoise(m.xz / 90.0) - 0.5);
  if (uLamp > 0.5) {
    // rover headlights: a soft cone, inverse-square falloff (scene units are km)
    vec3 Lv = uLampPos - vWorld;
    float d = length(Lv);
    vec3 Ld = Lv / max(d, 1e-6);
    float cone = smoothstep(0.82, 0.96, dot(-Ld, uLampDir));
    float fall = 1.0 / (1.0 + pow(d / 0.018, 2.0));
    col += vec3(0.95, 0.97, 1.0) * cone * fall * max(dot(N, Ld), 0.0) * 1.6;
  }
  if (uContours > 0.5) {
    float step = (uMaxH - uMinH) > 6000.0 ? 500.0 : 250.0;
    float c = abs(fract(vH / step + 0.5) - 0.5) * step / max(fwidth(vH), 1e-3);
    col = mix(col, vec3(1.0), (1.0 - min(c, 1.0)) * 0.22);
  }
  if (uGrid > 0.5) {
    float g = 10.0;
    vec2 p = vWorld.xz / g;
    vec2 gd = abs(fract(p + 0.5) - 0.5) / fwidth(p);
    col = mix(col, vec3(0.7, 0.75, 1.0), (1.0 - min(min(gd.x, gd.y), 1.0)) * 0.08);
  }
  // selected-site ring, drawn on the ground so it follows the terrain
  float d = length(vWorld.xz - uSel.xz);
  float r = uSelR;
  float ring = smoothstep(r * 0.16, 0.0, abs(d - r)) + smoothstep(r * 0.5, 0.0, d) * 0.35;
  col = mix(col, vec3(1.0, 0.66, 0.32), clamp(ring, 0.0, 1.0) * uSel.y);
  gl_FragColor = vec4(col, 1.0);
}`

export class Terrain {
  group = new THREE.Group()
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null
  patch: PatchResult | null = null
  private zTex: THREE.DataTexture | null = null
  private hTex: THREE.DataTexture | null = null
  /** A larger square this one sits inside, used to trace shadows beyond this square's edge. */
  private base: Terrain | null = null
  private visRT: THREE.WebGLRenderTarget
  private stayRT: THREE.WebGLRenderTarget
  private quadScene = new THREE.Scene()
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private visMat: THREE.ShaderMaterial
  private accMat: THREE.ShaderMaterial
  private exag = 1
  private meshRes: number
  /** Pending stay samples (UTC ms) still to be accumulated; null when nothing is queued. */
  private stayQueue: number[] = []
  stayDone = 0
  stayTotal = 0
  uniforms = {
    uVis: { value: null as THREE.Texture | null }, uStay: { value: null as THREE.Texture | null },
    uLayer: { value: 1 }, uMinH: { value: 0 }, uMaxH: { value: 1 }, uStayN: { value: 1 },
    uContours: { value: 0 }, uFill: { value: 1 }, uGrid: { value: 0 }, uSpanKm: { value: 100 },
    uSunScene: { value: new THREE.Vector3(0, 1, 0) }, uEarthScene: { value: new THREE.Vector3(0, 1, 0) },
    uSel: { value: new THREE.Vector3(0, 0, 0) },
    uLamp: { value: 0 }, uGrain: { value: 0 }, uSelR: { value: 1 }, ...psrUniforms(), ...detailUniforms(), uColor: { value: null as THREE.Texture | null }, uHasColor: { value: 0 }, uFrE: { value: new THREE.Vector3(1, 0, 0) }, uFrN: { value: new THREE.Vector3(0, 1, 0) }, uFrU: { value: new THREE.Vector3(0, 0, 1) }, uFull: { value: 0 }, uH: { value: null as THREE.Texture | null }, uCellM: { value: 100 }, uExag: { value: 1 }, uHole: { value: new THREE.Vector4(0, 0, 0, 0) }, uLightScene: { value: new THREE.Vector3(-0.38, 0.86, -0.34).normalize() }, uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) },
  }

  constructor(meshRes = 768) {
    this.meshRes = meshRes
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter }
    this.visRT = new THREE.WebGLRenderTarget(4, 4, rtOpts)
    this.stayRT = new THREE.WebGLRenderTarget(4, 4, rtOpts)
    const visUniforms = {
      uZ: { value: null as THREE.Texture | null }, uSpan: { value: 1 }, uN: { value: 1 }, uSunR: { value: 0.00465 },
      uZB: { value: null as THREE.Texture | null }, uHasB: { value: 0 }, uSteps: { value: 180 }, uSpanB: { value: 1 }, uC: { value: new THREE.Vector2() }, uCB: { value: new THREE.Vector2() },
      uSun: { value: new THREE.Vector3(0, 0, 1) }, uEarth: { value: new THREE.Vector3(0, 0, 3.8e8) },
    }
    this.visMat = new THREE.ShaderMaterial({ uniforms: visUniforms, vertexShader: quadVert, fragmentShader: COMMON + visFrag, depthTest: false, depthWrite: false })
    this.accMat = new THREE.ShaderMaterial({ uniforms: visUniforms, vertexShader: quadVert, fragmentShader: COMMON + visFrag, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true })
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.visMat))
    this.uniforms.uVis.value = this.visRT.texture
    this.uniforms.uStay.value = this.stayRT.texture
  }

  setPatch(p: PatchResult, renderer: THREE.WebGLRenderer) {
    this.patch = p
    this.zTex?.dispose(); this.hTex?.dispose()
    const tex = (a: Float32Array) => {
      const t = new THREE.DataTexture(a, p.n, p.n, THREE.RedFormat, THREE.FloatType)
      t.minFilter = t.magFilter = renderer.extensions.has('OES_texture_float_linear') ? THREE.LinearFilter : THREE.NearestFilter
      t.flipY = false; t.needsUpdate = true
      return t
    }
    this.zTex = tex(p.z)
    this.hTex = tex(p.h)
    this.uniforms.uH.value = this.hTex
    this.uniforms.uCellM.value = p.spanM / p.n
    this.visMat.uniforms.uC.value.set(p.ce, p.cn)
    this.linkBase()
    const vn = Math.min(p.n, 1024)
    this.visRT.setSize(vn, vn)
    this.stayRT.setSize(Math.min(vn, 1024), Math.min(vn, 1024))
    const u = this.visMat.uniforms
    u.uZ.value = this.zTex; u.uSpan.value = p.spanM; u.uN.value = p.n
    this.uniforms.uMinH.value = p.minH; this.uniforms.uMaxH.value = p.maxH; this.uniforms.uSpanKm.value = p.spanM / 1000
    this.buildMesh()
  }

  /** Trace shadows into a larger square beyond this one's edge (detail squares), or stop at the edge (null). */
  setBase(b: Terrain | null) { this.base = b; this.linkBase() }
  private linkBase() {
    const u = this.visMat.uniforms, b = this.base?.patch
    u.uHasB.value = b && this.base!.zTex ? 1 : 0
    u.uSteps.value = u.uHasB.value ? 280 : 180
    if (b) { u.uZB.value = this.base!.zTex; u.uSpanB.value = b.spanM; u.uCB.value.set(b.ce, b.cn) }
  }
  /** Hide this square where a finer one is drawn: centre (east, north) metres and width, or null. */
  setHole(h: { ce: number; cn: number; span: number } | null) {
    const v = this.uniforms.uHole.value
    if (!h) { v.w = 0; return }
    // shrink by one of this square's cells so the two never leave a gap
    const cell = this.patch ? this.patch.spanM / this.patch.n : 0
    v.set(h.ce / 1000, -h.cn / 1000, Math.max(0, h.span / 2 - cell) / 1000, 1)
  }
  /** Whether frame position (east, north) metres lies inside this square. */
  contains(east: number, north: number, margin = 0) {
    const p = this.patch
    return !!p && Math.abs(east - p.ce) < p.spanM / 2 - margin && Math.abs(north - p.cn) < p.spanM / 2 - margin
  }

  /** Bilinear lookup in the patch grid at frame (east, north) metres. */
  sample(arr: Float32Array, east: number, north: number): number {
    const p = this.patch!
    east -= p.ce; north -= p.cn
    const fx = (east + p.spanM / 2) / (p.spanM / p.n) - 0.5, fy = (p.spanM / 2 - north) / (p.spanM / p.n) - 0.5
    const x0 = Math.max(0, Math.min(p.n - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(p.n - 2, Math.floor(fy)))
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0)), n = p.n
    return (arr[y0 * n + x0] * (1 - tx) + arr[y0 * n + x0 + 1] * tx) * (1 - ty) + (arr[(y0 + 1) * n + x0] * (1 - tx) + arr[(y0 + 1) * n + x0 + 1] * tx) * ty
  }

  /** Scene height (km) of the displayed surface at local (east, north) metres. */
  surfaceY(east: number, north: number): number {
    if (!this.patch) return 0
    return (this.sample(this.patch.z, east, north) + this.sample(this.patch.h, east, north) * (this.exag - 1)) / 1000
  }

  setExaggeration(x: number) { this.uniforms.uExag.value = x; if (x !== this.exag) { this.exag = x; if (this.patch) this.updatePositions() } }
  setMeshResolution(m: number) { if (m !== this.meshRes) { this.meshRes = m; if (this.patch) this.buildMesh() } }

  private buildMesh() {
    const p = this.patch!
    const M = this.meshRes
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(M * M * 3), uv = new Float32Array(M * M * 2), aH = new Float32Array(M * M), aS = new Float32Array(M * M)
    const half = p.spanM / 2
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const k = j * M + i
      const east = p.ce - half + (i / (M - 1)) * p.spanM, north = p.cn + half - (j / (M - 1)) * p.spanM
      pos[k * 3] = east / 1000; pos[k * 3 + 2] = -north / 1000
      uv[k * 2] = i / (M - 1); uv[k * 2 + 1] = j / (M - 1)
      aH[k] = this.sample(p.h, east, north); aS[k] = this.sample(p.slope, east, north)
    }
    const idx = new Uint32Array((M - 1) * (M - 1) * 6)
    let t = 0
    for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
      const a = j * M + i, b = a + 1, c = a + M, d = c + 1
      idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setAttribute('aH', new THREE.BufferAttribute(aH, 1))
    geo.setAttribute('aSlope', new THREE.BufferAttribute(aS, 1))
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.geometry = geo }
    else {
      const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: LOG_DEPTH_VERT_PARS + COMMON + terrVert, fragmentShader: LOG_DEPTH_FRAG_PARS + COMMON + PSR_GLSL + DETAIL_GLSL + terrFrag })
      this.mesh = new THREE.Mesh(geo, mat)
      this.mesh.frustumCulled = false
      this.group.add(this.mesh)
    }
    this.updatePositions()
  }

  private updatePositions() {
    const geo = this.mesh!.geometry, p = this.patch!
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const M = this.meshRes, arr = pos.array as Float32Array
    for (let k = 0; k < M * M; k++) {
      const east = arr[k * 3] * 1000, north = -arr[k * 3 + 2] * 1000
      arr[k * 3 + 1] = (this.sample(p.z, east, north) + this.sample(p.h, east, north) * (this.exag - 1)) / 1000
    }
    pos.needsUpdate = true
    geo.computeBoundingSphere()
  }

  /** Recompute Sun and Earth visibility for one instant. sun: unit local (e, n, u); earth: metres local (e, n, u). */
  computeVisibility(renderer: THREE.WebGLRenderer, sun: THREE.Vector3, earth: THREE.Vector3) {
    if (!this.patch) return
    const u = this.visMat.uniforms
    u.uSun.value.copy(sun); u.uEarth.value.copy(earth)
    const mesh = this.quadScene.children[0] as THREE.Mesh
    mesh.material = this.visMat
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.visRT)
    renderer.render(this.quadScene, this.quadCam)
    renderer.setRenderTarget(prev)
  }

  /** Queue a progressive average of Sun and Earth visibility over a stay. */
  startStay(times: number[], renderer: THREE.WebGLRenderer) {
    this.stayQueue = times.slice()
    this.stayTotal = times.length
    this.stayDone = 0
    this.uniforms.uStayN.value = 1
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.stayRT)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, false, false)
    renderer.setRenderTarget(prev)
  }

  /** Process up to `k` queued stay samples. `vectors(ms)` returns [sun, earth] in local axes, or null. */
  stepStay(renderer: THREE.WebGLRenderer, k: number, vectors: (ms: number) => [THREE.Vector3, THREE.Vector3] | null): boolean {
    if (!this.patch || !this.stayQueue.length) return false
    const mesh = this.quadScene.children[0] as THREE.Mesh
    mesh.material = this.accMat
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.stayRT)
    for (let i = 0; i < k && this.stayQueue.length; i++) {
      const v = vectors(this.stayQueue.shift()!)
      if (!v) continue
      this.accMat.uniforms.uSun.value.copy(v[0]); this.accMat.uniforms.uEarth.value.copy(v[1])
      renderer.render(this.quadScene, this.quadCam)
      this.stayDone++
    }
    renderer.setRenderTarget(prev)
    mesh.material = this.visMat
    this.uniforms.uStayN.value = Math.max(1, this.stayDone)
    return true
  }

  get stayPending() { return this.stayQueue.length > 0 }

  dispose() {
    this.mesh?.geometry.dispose(); this.mesh?.material.dispose()
    this.zTex?.dispose(); this.hTex?.dispose(); this.visRT.dispose(); this.stayRT.dispose(); this.visMat.dispose(); this.accMat.dispose()
  }
}
