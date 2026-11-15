/** Shared GLSL: colour scales for each data layer, lunar photometry, and the solar-disc visibility formula. */

export const LAYER_IDS = ['imagery', 'relief', 'elevation', 'slope', 'sun', 'earth', 'sunStay', 'earthStay', 'colour', 'psr'] as const
export type LayerId = (typeof LAYER_IDS)[number]
export const layerIndex = (id: LayerId) => LAYER_IDS.indexOf(id)

/** Colour stops (hex) shared by the shaders and the legends so they always match. */
export const RAMPS: Record<'elevation' | 'slope' | 'sun' | 'earth' | 'stay', string[]> = {
  elevation: ['#1a0f45', '#3d2c9e', '#2a74c4', '#2bb59a', '#e7c35a', '#fff2dc'],
  slope: ['#0f3d46', '#1f8f74', '#b9dc5b', '#f4c04e', '#f07a3c', '#c51b5a'],
  sun: ['#070a24', '#1c1650', '#5b2f9c', '#d76a3a', '#ffb347', '#fff3cf'],
  earth: ['#0a0c22', '#132a5c', '#1f4fb0', '#2f86ff', '#6cc4ff', '#d9f3ff'],
  stay: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
}

const vec3 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `vec3(${((n >> 16) / 255).toFixed(4)}, ${(((n >> 8) & 255) / 255).toFixed(4)}, ${((n & 255) / 255).toFixed(4)})`
}
const ramp = (name: string, c: string[]) => `
vec3 ${name}(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  vec3 a = ${vec3(c[0])}, b = ${vec3(c[1])}, cc = ${vec3(c[2])}, d = ${vec3(c[3])}, e = ${vec3(c[4])}, f = ${vec3(c[5])};
  if (t < 1.0) return mix(a, b, t);
  if (t < 2.0) return mix(b, cc, t - 1.0);
  if (t < 3.0) return mix(cc, d, t - 2.0);
  if (t < 4.0) return mix(d, e, t - 3.0);
  return mix(e, f, t - 4.0);
}`

export const COMMON = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
${ramp('rampElevation', RAMPS.elevation)}
${ramp('rampSlope', RAMPS.slope)}
${ramp('rampSun', RAMPS.sun)}
${ramp('rampEarth', RAMPS.earth)}
${ramp('rampStay', RAMPS.stay)}

// Fraction of a disc above a straight horizon; x = (centre elevation − horizon) / angular radius.
// Clamping gives exactly 1 above +1 and 0 below −1; one return keeps Windows (Direct3D) shader compilers happy.
float discFraction(float x) {
  float c = clamp(x, -1.0, 1.0);
  return 0.5 + (c * sqrt(1.0 - c * c) + asin(c)) / PI;
}

// Lunar photometry: blend of Lambert and Lommel–Seeliger, which keeps the Moon's limb bright like the real one.
float lunarShade(float mu0, float mu) {
  if (mu0 <= 0.0) return 0.0;
  return mix(mu0, 2.0 * mu0 / (mu0 + max(mu, 0.0) + 1e-3), 0.55);
}

// Fixed-direction hillshade used under the data layers so relief stays readable at any time of day.
float hillshade(vec3 nLocal) {
  vec3 l = normalize(vec3(-0.55, 0.55, 0.62));
  return 0.42 + 0.58 * max(dot(nLocal, l), 0.0);
}
`

export const LOG_DEPTH_VERT_PARS = '\n#include <common>\n#include <logdepthbuf_pars_vertex>\n'
export const LOG_DEPTH_VERT = '\n#include <logdepthbuf_vertex>\n'
export const LOG_DEPTH_FRAG_PARS = '\n#include <logdepthbuf_pars_fragment>\n'
export const LOG_DEPTH_FRAG = '\n#include <logdepthbuf_fragment>\n'
