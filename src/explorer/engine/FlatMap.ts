import * as THREE from 'three'
import { DETAIL_GLSL, detailUniforms } from './DetailImagery'
import { PSR_GLSL, psrUniforms } from './NasaLayers'
import { COMMON, LOG_DEPTH_FRAG, LOG_DEPTH_FRAG_PARS, LOG_DEPTH_VERT, LOG_DEPTH_VERT_PARS } from './glsl'

/**
 * The whole Moon unrolled: equirectangular plane 4 × 2 scene units, longitude −180…180 left→right.
 * Same layers as the globe; the day side, night side and terminator come from the true Sun.
 */
const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${LOG_DEPTH_VERT} }`
const frag = /* glsl */ `
uniform sampler2D uColor, uHeight;
uniform float uHasColor, uHasHeight, uMinH, uMaxH, uLayer, uGrid, uFull;
uniform vec3 uSunME, uEarthME; // Sun direction (unit) and Earth position (Moon radii), MOON_ME axes
varying vec2 vUv;
const float RM = 1737400.0;
void main() {
  ${LOG_DEPTH_FRAG}
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float lon = (uv.x * 2.0 - 1.0) * PI, lat = (0.5 - uv.y) * PI;
  vec3 n = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  float h = 0.0, slope = 0.0; vec3 nl = vec3(0, 0, 1);
  if (uHasHeight > 0.5) {
    vec2 px = 1.0 / vec2(textureSize(uHeight, 0));
    h = texture(uHeight, uv).r;
    float dx = max(cos(lat), 0.03) * 2.0 * PI * RM * px.x * 2.0, dy = PI * RM * px.y * 2.0;
    vec2 g = vec2((texture(uHeight, uv + vec2(px.x, 0)).r - texture(uHeight, uv - vec2(px.x, 0)).r) / dx,
                  (texture(uHeight, uv - vec2(0, px.y)).r - texture(uHeight, uv + vec2(0, px.y)).r) / dy);
    slope = degrees(atan(length(g)));
    nl = normalize(vec3(-g * 4.0, 1.0));
  }
  float relief = hillshade(nl);
  float s = dot(n, uSunME);
  float day = max(smoothstep(-0.012, 0.012, s), uFull);
  vec3 toE = normalize(uEarthME - n);
  float e = dot(n, toE);
  vec3 albedo = uHasColor > 0.5 ? texture(uColor, uv).rgb : vec3(0.58);
  vec4 det = detailAlbedo(albedo, uv);
  albedo = det.rgb;
  int layer = int(uLayer + 0.5);
  vec3 col;
  if (layer == 8) col = rampElevation((h - uMinH) / (uMaxH - uMinH)) * (0.6 + 0.6 * dot(albedo, vec3(0.333))) * relief * mix(0.3, 1.15, day);
  else if (layer == 0) col = albedo * relief * mix(0.22, 1.12, day);
  else if (layer == 9) col = psrOverlay(albedo * relief * 1.05, psrAt(degrees(lat), degrees(lon)), 0.85);
  else if (layer == 1) col = vec3(0.7) * relief * mix(0.22, 1.12, day);
  else if (layer == 2) col = rampElevation((h - uMinH) / (uMaxH - uMinH)) * relief;
  else if (layer == 3) col = rampSlope(slope / 40.0) * relief;
  else if (layer == 4) col = rampSun(0.1 + 0.85 * day * clamp(s * 4.0 + 0.35, 0.0, 1.0)) * relief;
  else if (layer == 5) col = mix(rampEarth(0.08), rampEarth(0.55 + 0.45 * clamp(e * 3.0, 0.0, 1.0)), step(0.0, e)) * relief;
  else col = albedo * relief;
  // terminator on the Sun layer, Earth's limb on the Earth layer
  float tl = 1.0 - smoothstep(0.0, fwidth(s) * 1.4, abs(s));
  if (layer == 4) col = mix(col, vec3(1.0, 0.8, 0.5), tl * 0.85);
  float el = 1.0 - smoothstep(0.0, fwidth(e) * 1.4, abs(e));
  if (layer == 5) col = mix(col, vec3(0.6, 0.85, 1.0), el * 0.75);
  if (uGrid > 0.5) {
    vec2 d = vec2(degrees(lon), degrees(lat)) / 15.0;
    vec2 gd = abs(fract(d + 0.5) - 0.5) / fwidth(d);
    col = mix(col, vec3(0.8, 0.82, 1.0), (1.0 - min(min(gd.x, gd.y), 1.0)) * 0.18);
  }
  gl_FragColor = vec4(col, 1.0);
}`

export class FlatMap {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  uniforms = {
    uColor: { value: null as THREE.Texture | null }, uHasColor: { value: 0 },
    uHeight: { value: null as THREE.Texture | null }, uHasHeight: { value: 0 },
    uMinH: { value: -9000 }, uMaxH: { value: 10000 }, uLayer: { value: 0 }, uGrid: { value: 1 }, uFull: { value: 0 },
    ...detailUniforms(),
    ...psrUniforms(),
    uSunME: { value: new THREE.Vector3(1, 0, 0) }, uEarthME: { value: new THREE.Vector3(220, 0, 0) },
  }
  constructor() {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: LOG_DEPTH_VERT_PARS + vert, fragmentShader: LOG_DEPTH_FRAG_PARS + COMMON + DETAIL_GLSL + PSR_GLSL + frag }))
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}
/** lat/lon → flat-map scene coordinates. */
export const mapXY = (lat: number, lon: number): [number, number] => [(lon / 180) * 2, (lat / 90)]
