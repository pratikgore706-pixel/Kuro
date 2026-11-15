import * as THREE from 'three'
import { DETAIL_GLSL, detailUniforms } from './DetailImagery'
import { PSR_GLSL, psrUniforms } from './NasaLayers'
import { COMMON, LOG_DEPTH_FRAG, LOG_DEPTH_FRAG_PARS, LOG_DEPTH_VERT, LOG_DEPTH_VERT_PARS } from './glsl'

/**
 * The whole Moon as a sphere of radius 1 (= 1737.4 km). Elevation displaces the surface (with vertical
 * exaggeration), relief normals come from the elevation gradient, and every data layer is computed per pixel.
 * Scene axes: x = MOON_ME y (90°E), y = MOON_ME z (north), z = MOON_ME x (mean Earth direction).
 */
const vert = /* glsl */ `
uniform sampler2D uHeight;
uniform float uHasHeight, uExag;
varying vec3 vSphere;
varying vec3 vWorld;
varying vec3 vObj;
const float RM = 1737400.0;
vec2 llUV(vec3 n) {
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  return vec2((lon + PI) / (2.0 * PI), (PI * 0.5 - lat) / PI);
}
void main() {
  vec3 n = normalize(position);
  vSphere = n;
  float h = uHasHeight > 0.5 ? textureLod(uHeight, llUV(n), 0.0).r : 0.0;
  vec3 p = n * (1.0 + h * uExag / RM);
  vObj = p;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${LOG_DEPTH_VERT}
}`

const frag = /* glsl */ `
uniform sampler2D uColor, uHeight;
uniform float uHasColor, uHasHeight, uExag, uMinH, uMaxH, uGrid, uLayer, uFlat;
uniform vec3 uSun, uLight, uEarthPos; // uSun: true Sun. uLight: shading light (true Sun, or from the viewer in Full Moon mode)
uniform vec3 uCamObj;  // camera position in the globe's own axes (Moon radii)
uniform vec4 uClip;    // when this globe surrounds a terrain square: (x, z, half-width) in scene units, w > 0.5 enables
varying vec3 vSphere;
varying vec3 vWorld;
varying vec3 vObj;
const float RM = 1737400.0;

// Seam-free equirectangular lookup (Tarini): pick the longitude parameterisation with the smaller derivative.
vec4 sampleEq(sampler2D t, vec2 uv) {
  float u2 = fract(uv.x + 0.5) - 0.5;
  vec2 dx1 = dFdx(uv), dy1 = dFdy(uv);
  vec2 dx2 = vec2(dFdx(u2), dx1.y), dy2 = vec2(dFdy(u2), dy1.y);
  // choose, then sample once (a single return keeps Windows / Direct3D shader compilers happy)
  bool alt = max(abs(dx2.x), abs(dy2.x)) < max(abs(dx1.x), abs(dy1.x));
  return textureGrad(t, alt ? vec2(u2, uv.y) : uv, alt ? dx2 : dx1, alt ? dy2 : dy1);
}

void main() {
  ${LOG_DEPTH_FRAG}
  if (uClip.w > 0.5 && abs(vWorld.x - uClip.x) < uClip.z && abs(vWorld.z - uClip.y) < uClip.z) discard;
  vec3 n = normalize(vSphere);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2((lon + PI) / (2.0 * PI), (PI * 0.5 - lat) / PI);

  // local east / north / up in scene axes
  vec3 east = normalize(vec3(cos(lon), 0.0, -sin(lon)));
  vec3 north = cross(n, east);

  float h = 0.0, slope = 0.0;
  vec3 nl = vec3(0.0, 0.0, 1.0);
  if (uHasHeight > 0.5) {
    vec2 px = 1.0 / vec2(textureSize(uHeight, 0));
    h = texture(uHeight, uv).r;
    float hE = texture(uHeight, uv + vec2(px.x, 0.0)).r, hW = texture(uHeight, uv - vec2(px.x, 0.0)).r;
    float hN = texture(uHeight, uv - vec2(0.0, px.y)).r, hS = texture(uHeight, uv + vec2(0.0, px.y)).r;
    float dx = max(cos(lat), 0.03) * 2.0 * PI * RM * px.x * 2.0;
    float dy = PI * RM * px.y * 2.0;
    vec2 g = vec2((hE - hW) / dx, (hN - hS) / dy);
    slope = degrees(atan(length(g)));
    nl = normalize(vec3(-g * max(uExag, 1.0), 1.0));
  }
  vec3 N = normalize(east * nl.x + north * nl.y + n * nl.z);
  vec3 V = normalize(uCamObj - vObj);

  // true-Sun lighting; the terminator follows the sphere so relief cannot light the night side
  float day = smoothstep(-0.012, 0.012, dot(n, uLight));
  float light = lunarShade(dot(N, uLight), dot(N, V)) * day;
  vec3 toEarth = normalize(uEarthPos - vObj);
  float earthUp = step(0.0, dot(n, toEarth));
  // earthshine: sunlight reflected by Earth faintly lights the lunar night side facing Earth (real, ~0.1% level, boosted for view)
  float earthshine = 0.035 * max(dot(n, toEarth), 0.0) * (1.0 - day);

  vec3 albedo = uHasColor > 0.5 ? sampleEq(uColor, uv).rgb : vec3(0.56);
  vec4 det = detailAlbedo(albedo, uv);
  albedo = det.rgb;
  if (int(uLayer + 0.5) == 0 && det.w > 0.0) {
    // the photo carries its own fine shading; the 3.8 km height grid would only smear it, so light from the smooth sphere
    N = normalize(mix(N, n, det.w * 0.85));
    light = lunarShade(dot(N, uLight), dot(N, V)) * day;
  }
  vec3 col;
  int layer = int(uLayer + 0.5);
  float relief = hillshade(nl);
  vec3 warm = vec3(1.0, 0.95, 0.88);
  vec3 night = earthshine * vec3(0.55, 0.68, 1.0) + uFlat * vec3(0.035, 0.04, 0.06);
  if (layer == 8) {
    // colour relief: LOLA elevation as colour, multiplied by the real-time lunar lighting and the imagery's albedo detail
    float lum = dot(albedo, vec3(0.333));
    vec3 tint = rampElevation(pow(clamp((h - uMinH) / (uMaxH - uMinH), 0.0, 1.0), 0.9));
    // keep saturation: albedo modulates detail gently, light is not allowed to blow out to white
    vec3 lit = tint * (0.45 + 0.7 * lum) * min(light * 1.15, 1.0) * warm;
    col = lit + tint * 0.12 * (night + earthshine * vec3(0.4, 0.5, 0.8));
  }
  else if (layer == 0) col = albedo * (light * 1.25 * warm + night);
  else if (layer == 9) col = psrOverlay(albedo * (0.58 + 0.3 * max(dot(N, V), 0.0)), psrAt(degrees(lat), degrees(lon)), 0.85);
  else if (layer == 1) col = vec3(0.72) * (light * 1.25 * warm + night);
  else if (layer == 2) col = rampElevation((h - uMinH) / (uMaxH - uMinH)) * relief;
  else if (layer == 3) col = rampSlope(slope / 40.0) * relief;
  else if (layer == 4) {
    float s = dot(n, uSun);
    float trueLight = lunarShade(dot(N, uSun), dot(N, V)) * smoothstep(-0.012, 0.012, s);
    col = rampSun(smoothstep(-0.05, 0.08, s) * 0.55 + clamp(trueLight, 0.0, 1.0) * 0.45) * relief;
    float line = 1.0 - smoothstep(0.0, fwidth(s) * 1.5, abs(s));
    col = mix(col, vec3(1.0, 0.85, 0.55), line * 0.9);
  } else if (layer == 5) {
    float e = dot(n, toEarth);
    col = mix(rampEarth(0.08), rampEarth(0.55 + 0.45 * clamp(e * 3.0, 0.0, 1.0)), earthUp) * relief;
    float line = 1.0 - smoothstep(0.0, fwidth(e) * 1.5, abs(e));
    col = mix(col, vec3(0.75, 0.9, 1.0), line * 0.9);
  } else col = albedo * light;

  // graticule: every 15°, every 5° poleward of 75°
  if (uGrid > 0.5) {
    float la = degrees(lat), lo = degrees(lon);
    float step = abs(la) > 75.0 ? 5.0 : 15.0;
    float gla = abs(fract(la / step + 0.5) - 0.5) * step / fwidth(la);
    float glo = abs(fract(lo / 15.0 + 0.5) - 0.5) * 15.0 / max(fwidth(lo), 1e-4);
    float gline = 1.0 - min(min(gla, glo), 1.0);
    col = mix(col, vec3(0.75, 0.78, 1.0), gline * 0.16);
  }
  gl_FragColor = vec4(col, 1.0);
}`

export class Globe {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  uniforms = {
    uColor: { value: null as THREE.Texture | null }, uHasColor: { value: 0 },
    uHeight: { value: null as THREE.Texture | null }, uHasHeight: { value: 0 },
    uExag: { value: 8 }, uMinH: { value: -9000 }, uMaxH: { value: 10000 },
    uGrid: { value: 1 }, uLayer: { value: 0 }, uFlat: { value: 1 },
    uCamObj: { value: new THREE.Vector3(0, 0, 4) }, uClip: { value: new THREE.Vector4(0, 0, 0, 0) },
    ...detailUniforms(),
    ...psrUniforms(),
    uSun: { value: new THREE.Vector3(0, 0, 1) }, uLight: { value: new THREE.Vector3(0, 0, 1) }, uEarthPos: { value: new THREE.Vector3(0, 0, 220) },
  }

  constructor(segments = 640) {
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: LOG_DEPTH_VERT_PARS + COMMON + vert, fragmentShader: LOG_DEPTH_FRAG_PARS + COMMON + DETAIL_GLSL + PSR_GLSL + frag })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments / 2), mat)
  }

  setHeight(tex: THREE.Texture | null, minM: number, maxM: number) {
    this.uniforms.uHeight.value = tex; this.uniforms.uHasHeight.value = tex ? 1 : 0
    this.uniforms.uMinH.value = minM; this.uniforms.uMaxH.value = maxM
  }
  setColor(tex: THREE.Texture | null) { this.uniforms.uColor.value = tex; this.uniforms.uHasColor.value = tex ? 1 : 0 }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}

/** Equirectangular uint16 LOLA grid → float32 metres texture with linear filtering (half-float fallback). */
export function heightTexture(data: Uint16Array, w: number, h: number, renderer: THREE.WebGLRenderer): THREE.DataTexture {
  const floatLinear = renderer.extensions.has('OES_texture_float_linear')
  let tex: THREE.DataTexture
  if (floatLinear) {
    const f = new Float32Array(w * h)
    for (let i = 0; i < f.length; i++) f[i] = data[i] / 2 - 10000
    tex = new THREE.DataTexture(f, w, h, THREE.RedFormat, THREE.FloatType)
  } else {
    const f = new Uint16Array(w * h)
    for (let i = 0; i < f.length; i++) f[i] = THREE.DataUtils.toHalfFloat(data[i] / 2 - 10000)
    tex = new THREE.DataTexture(f, w, h, THREE.RedFormat, THREE.HalfFloatType)
  }
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.flipY = false
  tex.needsUpdate = true
  return tex
}
