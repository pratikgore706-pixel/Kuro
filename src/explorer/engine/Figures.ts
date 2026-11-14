import * as THREE from 'three'

/**
 * An astronaut in a white EVA suit, 1.8 m tall, drawn in code (metres; the group is scaled to scene km).
 * Stands beside the site in the Rover and Surface views to give the terrain a human scale. Illustrative.
 */
export function buildAstronaut(): { group: THREE.Group; arm: THREE.Object3D } {
  const g = new THREE.Group()
  const suit = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.78, metalness: 0.02 })
  const soft = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3d45, roughness: 0.6, metalness: 0.4 })
  const visor = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.12, metalness: 1, emissive: 0x3a2400, emissiveIntensity: 0.3 })
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc8402e, roughness: 0.6 })
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o
  }
  const cyl = (r: number, h: number) => new THREE.CylinderGeometry(r, r * 0.92, h, 14)
  // legs and boots
  for (const s of [-1, 1]) {
    add(cyl(0.11, 0.48), suit, s * 0.13, 0.62, 0)
    add(cyl(0.1, 0.42), suit, s * 0.13, 0.26, 0)
    add(new THREE.BoxGeometry(0.17, 0.12, 0.3), dark, s * 0.13, 0.06, 0.05)
    add(new THREE.TorusGeometry(0.105, 0.025, 6, 16), soft, s * 0.13, 0.42, 0).rotation.x = Math.PI / 2
  }
  // torso, chest box, life-support backpack
  add(new THREE.CapsuleGeometry(0.24, 0.4, 6, 14), suit, 0, 1.18, 0)
  add(new THREE.BoxGeometry(0.3, 0.16, 0.1), soft, 0, 1.18, 0.22)
  add(new THREE.BoxGeometry(0.1, 0.03, 0.02), stripe, 0.09, 1.23, 0.275)
  add(new THREE.BoxGeometry(0.5, 0.62, 0.26), soft, 0, 1.25, -0.3)
  // arms (the right one waves)
  add(cyl(0.085, 0.55), suit, -0.33, 1.13, 0).rotation.z = 0.18
  add(new THREE.SphereGeometry(0.075, 10, 8), dark, -0.38, 0.84, 0)
  const arm = new THREE.Group(); arm.position.set(0.31, 1.38, 0); g.add(arm)
  add(cyl(0.085, 0.55), suit, 0, -0.26, 0, arm)
  add(new THREE.SphereGeometry(0.075, 10, 8), dark, 0, -0.55, 0, arm)
  // helmet with gold visor
  add(new THREE.SphereGeometry(0.2, 24, 18), suit, 0, 1.66, 0)
  const v = add(new THREE.SphereGeometry(0.175, 24, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.42), visor, 0, 1.66, 0.035)
  v.rotation.y = 0
  g.traverse((o) => { o.castShadow = false })
  return { group: g, arm }
}

/**
 * A small polar orbiter (gold-foil bus, two solar wings, high-gain dish) for the globe view. Illustrative:
 * drawn about 10 000 times larger than a real spacecraft so it can be seen at globe scale, on a 100 km circular
 * polar orbit, sped up. It is not a tracked spacecraft.
 */
export function buildOrbiter(): THREE.Group {
  const g = new THREE.Group()
  const foil = new THREE.MeshStandardMaterial({ color: 0xd8a542, roughness: 0.3, metalness: 0.9, emissive: 0x2a1a00, emissiveIntensity: 0.5 })
  const panel = new THREE.MeshStandardMaterial({ color: 0x23409a, roughness: 0.25, metalness: 0.5, emissive: 0x0b1a4a, emissiveIntensity: 0.6 })
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, emissive: 0x222222 })
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1.3, 1), foil))
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.9), panel); w.position.set(s * 1.9, 0, 0); g.add(w)
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), white); strut.rotation.z = Math.PI / 2; strut.position.set(s * 0.6, 0, 0); g.add(strut)
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.25, 20, 1, true), white); dish.position.set(0, 0.9, 0); dish.rotation.x = Math.PI; g.add(dish)
  return g
}
