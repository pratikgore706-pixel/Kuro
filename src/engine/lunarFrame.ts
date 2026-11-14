import { jdTT } from './time'

/**
 * Orientation of the Moon from the IAU WGCCRE rotation model (Archinal et al. 2018), with all thirteen
 * periodic terms. Gives the rotation from ICRF/J2000 into the Moon body-fixed frame, which this model
 * approximates as Mean Earth / polar axis to within about 0.01°. Used to place the real stars in the sky.
 */
const D = Math.PI / 180

export function moonPole(utcMs: number): { ra: number; dec: number; w: number } {
  const d = jdTT(utcMs) - 2451545.0
  const T = d / 36525
  const E = [
    125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.064993 * d, 276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ].map((x) => x * D)
  const s = (i: number) => Math.sin(E[i - 1]), c = (i: number) => Math.cos(E[i - 1])
  const ra = 269.9949 + 0.0031 * T - 3.8787 * s(1) - 0.1204 * s(2) + 0.07 * s(3) - 0.0172 * s(4) + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13)
  const dec = 66.5392 + 0.013 * T + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4) - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13)
  const w = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * s(1) + 0.1208 * s(2) - 0.0642 * s(3) + 0.0158 * s(4) + 0.0252 * s(5) - 0.0066 * s(6) - 0.0047 * s(7) - 0.0046 * s(8) + 0.0028 * s(9) + 0.0052 * s(10) + 0.004 * s(11) + 0.0019 * s(12) - 0.0044 * s(13)
  return { ra, dec, w }
}

/** Row-major 3×3 matrix taking ICRF vectors to Moon body-fixed: Rz(W) · Rx(90° − δ0) · Rz(90° + α0). */
export function icrfToMoon(utcMs: number): number[] {
  const { ra, dec, w } = moonPole(utcMs)
  const rz = (t: number) => { const c = Math.cos(t), s = Math.sin(t); return [c, s, 0, -s, c, 0, 0, 0, 1] }
  const rx = (t: number) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, s, 0, -s, c] }
  const mul = (a: number[], b: number[]) => {
    const r = new Array(9).fill(0)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
    return r
  }
  return mul(rz(w * D), mul(rx((90 - dec) * D), rz((90 + ra) * D)))
}
