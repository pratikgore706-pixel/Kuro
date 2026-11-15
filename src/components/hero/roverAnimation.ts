// RoverAnimation — moves the layered rover (base, wheel blur, LCD faces, shadow).
// Motion is grounded: wheel blur and suspension are driven by the rover's actual
// velocity, so wheels settle and the suspension relaxes whenever it stops.

import { clamp } from './chapterController'

const TAU = Math.PI * 2
// rover artwork reference points (fractions of the rover image box)
export const ROVER_PTS = {
  lcdRight: { u: 0.86, v: 0.16 },   // just right of the LCD, at screen height
  mastLeft: { u: 0.24, v: 0.16 },   // left of the antenna mast
  top: { u: 0.5, v: 0.0 },
}
const ORIGIN_V = 0.96                // transform-origin: 50% 96%

export interface RoverFrame {
  d: number          // drive position 0–1
  motion: number     // 0 (stopped) … 1 (driving), smoothed velocity
  rough: number      // 0–1 extra suspension on uneven ground
  sunLight: number
  night: number
  sunXn: number      // sun x, 0–1 across the viewport
  elev: number       // sun elevation 0–1
  yellow: number
  red: number
}

export function createRoverAnimation(root: HTMLElement) {
  const q = (s: string) => root.querySelector<HTMLElement>(s)
  const ground = q('.hv-ground')!
  const rover = q('.hv-rover')!
  const blur = q('.hv-rv-blur')
  const shadow = q('.hv-rover-shadow')
  const faceY = q('.hv-face-yellow')
  const faceR = q('.hv-face-red')

  // untransformed rover box in .hv coordinates (offset* ignore transforms)
  let bx = 0, by = 0, bw = 0, bh = 0, gh = 0
  let s = 1, ty = 0
  const measure = () => {
    gh = ground.offsetHeight
    bx = ground.offsetLeft + rover.offsetLeft
    by = ground.offsetTop + rover.offsetTop
    bw = rover.offsetWidth
    bh = rover.offsetHeight
  }

  const update = (f: RoverFrame) => {
    s = 1 + 0.75 * f.d
    // suspension: tied to distance travelled (so it matches the wheels), fades out at rest
    const amp = f.motion * (1 + 1.6 * f.rough)
    const bob = (Math.sin(f.d * TAU * 14) * 1.1 + Math.sin(f.d * TAU * 37) * 0.6) * amp
    const roll = (Math.sin(f.d * TAU * 9) * 0.35 + Math.sin(f.d * TAU * 23) * 0.2 * f.rough) * amp
    ty = f.d * gh * 0.12
    rover.style.transform = `translate3d(0, ${(ty + bob).toFixed(2)}px, 0) scale(${s.toFixed(4)}) rotate(${roll.toFixed(3)}deg)`
    rover.style.filter = `brightness(${(1.05 + 0.15 * f.sunLight - 0.42 * f.night).toFixed(3)})`
    if (blur) blur.style.opacity = clamp(f.motion * 1.1).toFixed(3)
    if (shadow) {
      const away = -(f.sunXn - 0.5) * 70
      shadow.style.transform = `translateX(${away.toFixed(1)}%) scaleX(${(1 + (1 - f.elev) * 0.7).toFixed(3)})`
      shadow.style.opacity = clamp(0.45 + 0.4 * f.sunLight - 0.35 * f.night).toFixed(3)
    }
    if (faceY) faceY.style.opacity = f.yellow.toFixed(3)
    if (faceR) faceR.style.opacity = f.red.toFixed(3)
  }

  /** a point on the rover artwork, in .hv coordinates, after the current transform */
  const point = (u: number, v: number) => ({
    x: bx + bw / 2 + (u - 0.5) * bw * s,
    y: by + ORIGIN_V * bh + (v - ORIGIN_V) * bh * s + ty,
  })

  return { measure, update, point }
}
