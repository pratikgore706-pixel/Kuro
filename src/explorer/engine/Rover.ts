import * as THREE from 'three'

/**
 * A six-wheeled polar rover drawn in code (proportions loosely after NASA's VIPER: ~2.5 m long, 1.5 m wide,
 * mast 2.5 m). Units are metres inside the model; the group is scaled to kilometres for the scene.
 */
export function buildRoverModel(): { group: THREE.Group; wheels: THREE.Object3D[]; lamp: THREE.Object3D; mastCam: THREE.Object3D } {
  const g = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.55, metalness: 0.1 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a649, roughness: 0.32, metalness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2b31, roughness: 0.7, metalness: 0.3 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.9 })
  const solar = new THREE.MeshStandardMaterial({ color: 0x1b2f7a, roughness: 0.25, metalness: 0.6, emissive: 0x0a1440, emissiveIntensity: 0.35 })
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffa040, emissiveIntensity: 1.2 })
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b
  }
  // chassis (forward = +z)
  box(1.5, 0.55, 2.3, white, 0, 0.95, 0)
  box(1.52, 0.18, 2.32, gold, 0, 0.62, 0)
  box(1.3, 0.06, 2.0, dark, 0, 1.25, 0)
  // vertical solar panels on three sides (polar rovers carry them upright for a low Sun)
  box(0.05, 0.85, 1.9, solar, 0.78, 1.18, 0)
  box(0.05, 0.85, 1.9, solar, -0.78, 1.18, 0)
  box(1.4, 0.85, 0.05, solar, 0, 1.18, -1.17)
  // mast with camera head and lights
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 12), steel); mast.position.set(0.35, 1.9, 0.75); g.add(mast)
  const head = box(0.5, 0.22, 0.24, dark, 0.35, 2.6, 0.78)
  void head
  for (const x of [0.2, 0.5]) { const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), steel); lens.rotation.x = Math.PI / 2; lens.position.set(x, 2.6, 0.92); g.add(lens) }
  const lampL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), amber); lampL.position.set(-0.45, 1.05, 1.17); g.add(lampL)
  const lampR = lampL.clone(); lampR.position.x = 0.45; g.add(lampR)
  // high-gain antenna
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), white)
  dish.material = white; dish.position.set(-0.4, 1.75, -0.6); dish.rotation.set(-0.9, 0.3, 0); g.add(dish)
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), steel); boom.position.set(-0.4, 1.5, -0.6); g.add(boom)
  // rocker arms and six wheels
  const wheels: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    box(0.08, 0.1, 2.4, steel, side * 0.92, 0.55, 0)
    for (const z of [-0.95, 0, 0.95]) {
      const w = new THREE.Group()
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 24), dark); tyre.rotation.z = Math.PI / 2; w.add(tyre)
      for (let k = 0; k < 8; k++) { const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.08), steel); const a = (k / 8) * Math.PI * 2; cleat.position.set(0, Math.cos(a) * 0.32, Math.sin(a) * 0.32); cleat.rotation.x = a; w.add(cleat) }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 12), gold); hub.rotation.z = Math.PI / 2; w.add(hub)
      w.position.set(side * 1.05, 0.32, z)
      g.add(w); wheels.push(w)
    }
  }
  const lamp = new THREE.Object3D(); lamp.position.set(0, 1.05, 1.2); g.add(lamp)
  const mastCam = new THREE.Object3D(); mastCam.position.set(0.35, 2.62, 0.95); g.add(mastCam)
  g.traverse((o) => { (o as THREE.Mesh).castShadow = false })
  return { group: g, wheels, lamp, mastCam }
}

export interface RoverTelemetry {
  lat: number; lon: number; elevM: number; slopeDeg: number; headingDeg: number
  speedMps: number; timeScale: number; distM: number
  sunFrac: number; sunEl: number; earthUp: boolean; earthEl: number
  battery: number; blocked: string | null; cam: 'chase' | 'mast'; lights: boolean
  /** Autopilot target, when driving to a destination. */
  dest: { name: string; lat: number; lon: number; distM: number; bearingDeg: number; etaS: number; status: 'driving' | 'arrived' | 'blocked' | 'paused' } | null
  /** Waiting for a click on the ground to set the destination. */
  picking: boolean
}

export const ROVER_SPEEDS = [
  { id: 'real', label: 'Real speed (0.2 m/s)', mps: 0.2, scale: 1 },
  { id: 'x50', label: 'Time-lapse ×50', mps: 0.2, scale: 50 },
  { id: 'x500', label: 'Time-lapse ×500', mps: 0.2, scale: 500 },
  { id: 'x2000', label: 'Time-lapse ×2000', mps: 0.2, scale: 2000 },
] as const
export type RoverSpeed = (typeof ROVER_SPEEDS)[number]['id']

/** Steepest slope the rover will climb; VIPER was designed for about 15° sustained and ~25° short climbs. */
export const MAX_CLIMB_DEG = 25
