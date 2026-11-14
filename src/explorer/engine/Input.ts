/** One place that merges keyboard, on-screen pad and gamepad into the same axes. All axes are −1…1. */
/** fwd/strafe: W S A D (or left stick). arrowY/turn: arrow keys. lift: E/Q, Space, PageUp/PageDown. look*: right stick. */
export interface Axes { fwd: number; strafe: number; turn: number; arrowY: number; lift: number; lookX: number; lookY: number; boost: boolean; brake: boolean }
export interface Virtual { x: number; y: number; turn: number; lift: number; boost: boolean }

const DEAD = 0.14
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD))
const clamp = (v: number) => Math.max(-1, Math.min(1, v))

export class Input {
  keys = new Set<string>()
  virtual: Virtual = { x: 0, y: 0, turn: 0, lift: 0, boost: false }
  gamepadName: string | null = null

  read(): Axes {
    const k = this.keys
    const a: Axes = {
      fwd: (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0),
      strafe: (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0),
      turn: (k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0),
      arrowY: (k.has('arrowup') ? 1 : 0) - (k.has('arrowdown') ? 1 : 0),
      lift: (k.has('e') || k.has(' ') || k.has('pageup') ? 1 : 0) - (k.has('q') || k.has('pagedown') ? 1 : 0),
      lookX: 0, lookY: 0,
      boost: k.has('shift') || this.virtual.boost,
      brake: k.has(' '),
    }
    a.fwd += -this.virtual.y; a.strafe += this.virtual.x; a.turn += this.virtual.turn; a.lift += this.virtual.lift
    // first connected standard gamepad: left stick moves, right stick turns / looks, triggers lift, A boosts
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const gp = Array.from(pads ?? []).find((p) => p && p.connected) ?? null
    this.gamepadName = gp ? gp.id : null
    if (gp) {
      a.strafe += dz(gp.axes[0] ?? 0); a.fwd += -dz(gp.axes[1] ?? 0)
      a.turn += dz(gp.axes[2] ?? 0); a.lookY += -dz(gp.axes[3] ?? 0); a.lookX += dz(gp.axes[2] ?? 0)
      a.lift += (gp.buttons[7]?.value ?? 0) - (gp.buttons[6]?.value ?? 0)
      if (gp.buttons[0]?.pressed) a.boost = true
    }
    a.fwd = clamp(a.fwd); a.strafe = clamp(a.strafe); a.turn = clamp(a.turn); a.lift = clamp(a.lift)
    return a
  }
}
