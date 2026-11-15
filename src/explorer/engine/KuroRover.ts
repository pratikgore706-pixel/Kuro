import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * The KURO rover from the "KURO Rover — complete view set" sheet, modelled in code: six hex-tread wheels on a
 * gold-jointed rocker-bogie, a white riveted chassis with a chamfered nose, two hinged solar wings, a navigation
 * dome and cameras on the deck, a whip antenna at the rear and the mast-mounted head with its dot-matrix face
 * (which blinks). Reference size ≈ 2.30 m long, 1.50 m wide, 1.70 m to the top of the head.
 * Units are metres; forward is +z, up is +y — the same contract as buildRoverModel in Rover.ts.
 */
export function buildKuroRover(): { group: THREE.Group; wheels: THREE.Object3D[]; lamp: THREE.Object3D; mastCam: THREE.Object3D } {
  const g = new THREE.Group()
  const plate = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.5, metalness: 0.2 })
  const plateDark = new THREE.MeshStandardMaterial({ color: 0xa9aaa8, roughness: 0.55, metalness: 0.25 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b02a, roughness: 0.35, metalness: 0.55 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, roughness: 0.3, metalness: 0.5 })
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.35, metalness: 0.4 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.95, metalness: 0.05 })
  const lens = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.08, metalness: 0.9 })
  const amber = new THREE.MeshStandardMaterial({ color: 0xffc04d, emissive: 0xffa82e, emissiveIntensity: 1.1 })
  const solar = new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.22, metalness: 0.65, color: 0xffffff })

  const add = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D = g) => { parent.add(o); return o }
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return add(b, parent)
  }
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m)
  /** A tube between two points. */
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, parent: THREE.Object3D = g) => {
    const d = new THREE.Vector3().subVectors(b, a), t = cyl(r, r, d.length(), m, 10)
    t.position.copy(a).addScaledVector(d, 0.5)
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    return add(t, parent)
  }
  const joint = (p: THREE.Vector3, r = 0.045) => { const j = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), gold); j.position.copy(p); return add(j) }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  // ---------------------------------------------------------------- chassis
  const BODY_Y0 = 0.56, BODY_Y1 = 1.0, BODY_W = 0.96
  {
    // side profile: flat back, long top, chamfered nose
    const s = new THREE.Shape()
    s.moveTo(-0.78, BODY_Y0); s.lineTo(0.72, BODY_Y0); s.lineTo(0.9, 0.7); s.lineTo(0.9, 0.86); s.lineTo(0.76, BODY_Y1); s.lineTo(-0.78, BODY_Y1); s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: BODY_W, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 })
    geo.translate(0, 0, -BODY_W / 2)
    geo.rotateY(-Math.PI / 2) // shape x → scene +z (forward), extrusion → scene x
    add(new THREE.Mesh(geo, plate))
    // gold edge trim
    for (const side of [-1, 1]) {
      box(0.025, 0.025, 1.52, gold, side * (BODY_W / 2 + 0.02), BODY_Y1 + 0.005, -0.02)
      box(0.025, 0.025, 1.66, gold, side * (BODY_W / 2 + 0.02), BODY_Y0 - 0.005, -0.04)
    }
    box(BODY_W + 0.04, 0.025, 0.025, gold, 0, BODY_Y1 + 0.005, -0.79)
    // panel seams on the sides
    for (const side of [-1, 1]) for (const z of [-0.35, 0.1, 0.5]) box(0.006, BODY_Y1 - BODY_Y0 - 0.06, 0.012, plateDark, side * (BODY_W / 2 + 0.021), (BODY_Y0 + BODY_Y1) / 2, z)
    // belly pan and lower skid box
    box(0.62, 0.12, 1.2, plateDark, 0, BODY_Y0 - 0.06, 0)
    box(0.5, 0.1, 0.34, plate, 0, 0.42, 0.55)
    // front face: three dark instrument windows, a camera, amber lamps
    const front = new THREE.Group(); front.position.set(0, 0.78, 0.9 + 0.022); add(front)
    for (const [x, w] of [[-0.25, 0.2], [0, 0.2], [0.27, 0.26]] as const) box(w, 0.2, 0.012, black, x, 0.02, 0, front)
    const cam = cyl(0.045, 0.045, 0.06, lens, 18); cam.rotation.x = Math.PI / 2; cam.position.set(-0.4, 0.05, 0.02); front.add(cam)
    const camRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), gold); camRing.position.set(-0.4, 0.05, 0.02); front.add(camRing)
    for (const x of [-0.4, 0.4]) { const l = box(0.08, 0.05, 0.03, amber, x, -0.12, 0.005, front); void l }
    box(BODY_W - 0.06, 0.018, 0.02, gold, 0, -0.17, 0.0, front)
    // rear: vent grille and two gold tow hooks
    const rear = new THREE.Group(); rear.position.set(0, 0.78, -0.8 - 0.022); add(rear)
    box(0.4, 0.22, 0.012, black, 0, 0.0, 0, rear)
    for (let k = 0; k < 7; k++) box(0.38, 0.012, 0.02, steel, 0, -0.09 + k * 0.03, -0.006, rear)
    for (const x of [-0.33, 0.33]) box(0.08, 0.08, 0.05, gold, x, -0.13, -0.01, rear)
  }

  // ---------------------------------------------------------------- deck: navigation dome, cameras, handle
  {
    const nav = cyl(0.13, 0.14, 0.16, plate, 24); nav.position.set(-0.18, BODY_Y1 + 0.1, -0.2); add(nav)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate); dome.position.set(-0.18, BODY_Y1 + 0.18, -0.2); add(dome)
    box(0.03, 0.06, 0.04, black, -0.18, BODY_Y1 + 0.12, -0.065)
    const navRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 8, 28), gold); navRing.rotation.x = Math.PI / 2; navRing.position.set(-0.18, BODY_Y1 + 0.03, -0.2); add(navRing)
    for (const z of [0.05, 0.36]) {
      box(0.12, 0.12, 0.12, plate, 0.3, BODY_Y1 + 0.1, z)
      const l = cyl(0.035, 0.035, 0.03, lens, 16); l.rotation.z = Math.PI / 2; l.position.set(0.365, BODY_Y1 + 0.1, z); add(l)
      box(0.04, 0.05, 0.04, gold, 0.3, BODY_Y1 + 0.025, z)
    }
    // carry handle
    tube(V(-0.05, BODY_Y1 + 0.02, 0.08), V(-0.05, BODY_Y1 + 0.06, 0.08), 0.01, steel)
    tube(V(0.12, BODY_Y1 + 0.02, 0.08), V(0.12, BODY_Y1 + 0.06, 0.08), 0.01, steel)
    tube(V(-0.05, BODY_Y1 + 0.06, 0.08), V(0.12, BODY_Y1 + 0.06, 0.08), 0.01, steel)
  }

  // ---------------------------------------------------------------- solar wings (hinged at the deck edge, tilted down)
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(side * (BODY_W / 2 + 0.03), BODY_Y1 - 0.12, -0.2); add(hinge)
    hinge.rotation.z = side * -0.32
    const wing = new THREE.Group(); wing.position.x = side * 0.36; hinge.add(wing)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 1.15), [steel, steel, solar, plateDark, steel, steel]); wing.add(panel)
    // gold frame and centre divider
    for (const z of [-0.585, 0.585]) box(0.72, 0.03, 0.02, gold, 0, 0.005, z, wing)
    for (const x of [-0.355, 0.355]) box(0.02, 0.03, 1.19, gold, x, 0.005, 0, wing)
    box(0.7, 0.03, 0.016, gold, 0, 0.005, 0, wing)
    box(0.04, 0.05, 0.9, gold, -side * 0.36, 0, 0, wing) // hinge barrel
  }

  // ---------------------------------------------------------------- rocker-bogie and wheels
  const WR = 0.31, WX = 0.68, WZ = [-0.82, 0.02, 0.84]
  const wheels: THREE.Object3D[] = []
  const tyreGeo = new THREE.CylinderGeometry(WR - 0.06, WR - 0.06, 0.24, 28)
  const lugGeo = new THREE.BoxGeometry(0.115, 0.075, 0.105)
  const sideLugGeo = new THREE.BoxGeometry(0.03, 0.06, 0.08)
  const rimGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.02, 28)
  const capGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.05, 28)
  const boltGeo = new THREE.SphereGeometry(0.011, 6, 4)
  for (const side of [-1, 1]) {
    for (const z of WZ) {
      const w = new THREE.Group()
      const tyre = new THREE.Mesh(tyreGeo, rubber); tyre.rotation.z = Math.PI / 2; w.add(tyre)
      // chunky staggered tread blocks in two rows, plus shoulder blocks on the outer sidewall
      const N = 16
      for (let k = 0; k < N; k++) {
        for (const row of [-1, 1]) {
          const a = ((k + (row > 0 ? 0.5 : 0)) / N) * Math.PI * 2
          const lug = new THREE.Mesh(lugGeo, rubber)
          lug.position.set(row * 0.062, Math.cos(a) * (WR - 0.04), Math.sin(a) * (WR - 0.04))
          lug.rotation.x = a
          w.add(lug)
        }
        const a = (k / N) * Math.PI * 2, sl = new THREE.Mesh(sideLugGeo, rubber)
        sl.position.set(side * 0.125, Math.cos(a) * (WR - 0.08), Math.sin(a) * (WR - 0.08)); sl.rotation.x = a; w.add(sl)
      }
      // outer face: dark rim, gold bolt ring, polished hub cap
      const rim = new THREE.Mesh(rimGeo, black); rim.rotation.z = Math.PI / 2; rim.position.x = side * 0.122; w.add(rim)
      const cap = new THREE.Mesh(capGeo, steel); cap.rotation.z = side * -Math.PI / 2; cap.position.x = side * 0.145; w.add(cap)
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, b = new THREE.Mesh(boltGeo, gold)
        b.position.set(side * 0.134, Math.cos(a) * 0.135, Math.sin(a) * 0.135); w.add(b)
      }
      w.position.set(side * WX, WR, z)
      add(w); wheels.push(w)
    }
    // rocker: pivot on the body side, one leg to the rear wheel, one to the bogie
    const sx = side * (BODY_W / 2 + 0.05)
    const pivot = V(sx, 0.62, -0.18), bogie = V(side * 0.56, 0.5, 0.42)
    const hub = (z: number) => V(side * 0.53, WR, z)
    joint(pivot, 0.06)
    tube(pivot, V(side * 0.55, 0.52, WZ[0] + 0.1), 0.03, steel)
    tube(V(side * 0.55, 0.52, WZ[0] + 0.1), hub(WZ[0]), 0.03, steel)
    joint(V(side * 0.55, 0.52, WZ[0] + 0.1))
    tube(pivot, bogie, 0.03, steel)
    joint(bogie, 0.055)
    tube(bogie, V(side * 0.55, 0.46, WZ[1] + 0.05), 0.026, steel)
    tube(V(side * 0.55, 0.46, WZ[1] + 0.05), hub(WZ[1]), 0.026, steel)
    tube(bogie, V(side * 0.55, 0.48, WZ[2] - 0.08), 0.026, steel)
    tube(V(side * 0.55, 0.48, WZ[2] - 0.08), hub(WZ[2]), 0.026, steel)
    for (const z of WZ) { const ax = cyl(0.05, 0.05, 0.1, gold, 12); ax.rotation.z = Math.PI / 2; ax.position.copy(hub(z)); add(ax) }
    // diagonal struts (the gold-capped A-frames in the views)
    tube(V(sx, 0.78, 0.35), bogie, 0.018, steel)
    tube(V(sx, 0.78, -0.55), V(side * 0.55, 0.52, WZ[0] + 0.1), 0.018, steel)
    joint(V(sx, 0.78, 0.35), 0.03); joint(V(sx, 0.78, -0.55), 0.03)
  }
  // front bumper bar (seen in the side views)
  tube(V(-0.42, 0.5, 0.92), V(-0.42, 0.5, 1.08), 0.025, steel)
  tube(V(0.42, 0.5, 0.92), V(0.42, 0.5, 1.08), 0.025, steel)
  tube(V(-0.42, 0.5, 1.08), V(0.42, 0.5, 1.08), 0.025, steel)

  // ---------------------------------------------------------------- whip antenna (rear left)
  {
    const base = cyl(0.05, 0.06, 0.08, gold, 12); base.position.set(-0.36, BODY_Y1 + 0.04, -0.58); add(base)
    const lo = cyl(0.025, 0.025, 0.5, steel, 10); lo.position.set(-0.36, BODY_Y1 + 0.33, -0.58); add(lo)
    const hi = cyl(0.012, 0.012, 0.6, steel, 8); hi.position.set(-0.36, BODY_Y1 + 0.88, -0.58); add(hi)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), steel); tip.position.set(-0.36, BODY_Y1 + 1.19, -0.58); add(tip)
  }

  // ---------------------------------------------------------------- mast and head
  const HEAD_Y = 1.52, HEAD_Z = 0.5, HEAD_X = 0.12
  {
    const collar = cyl(0.08, 0.09, 0.06, gold, 16); collar.position.set(HEAD_X, BODY_Y1 + 0.03, HEAD_Z); add(collar)
    const m1 = cyl(0.055, 0.055, 0.2, steel, 16); m1.position.set(HEAD_X, BODY_Y1 + 0.15, HEAD_Z); add(m1)
    const ring = cyl(0.07, 0.07, 0.04, plateDark, 16); ring.position.set(HEAD_X, BODY_Y1 + 0.27, HEAD_Z); add(ring)
    const m2 = cyl(0.045, 0.045, 0.14, steel, 16); m2.position.set(HEAD_X, BODY_Y1 + 0.36, HEAD_Z); add(m2)
    const yoke = cyl(0.07, 0.06, 0.05, gold, 16); yoke.position.set(HEAD_X, BODY_Y1 + 0.45, HEAD_Z); add(yoke)
  }
  const head = new THREE.Group(); head.position.set(HEAD_X, HEAD_Y, HEAD_Z); add(head)
  const screenFace = faceScreen()
  {
    // octagonal (chamfered) head: 0.62 wide, 0.34 tall, 0.3 deep
    const W = 0.62, H = 0.34, D = 0.3, c = 0.06
    const s = new THREE.Shape()
    s.moveTo(-W / 2 + c, -H / 2); s.lineTo(W / 2 - c, -H / 2); s.lineTo(W / 2, -H / 2 + c); s.lineTo(W / 2, H / 2 - c); s.lineTo(W / 2 - c, H / 2)
    s.lineTo(-W / 2 + c, H / 2); s.lineTo(-W / 2, H / 2 - c); s.lineTo(-W / 2, -H / 2 + c); s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 })
    geo.translate(0, 0, -D / 2)
    head.add(new THREE.Mesh(geo, plate))
    // the screen: inset black glass with the live face, inside a raised bezel
    const sw = W - 0.09, sh = H - 0.09, sc = 0.04
    const ss = new THREE.Shape()
    ss.moveTo(-sw / 2 + sc, -sh / 2); ss.lineTo(sw / 2 - sc, -sh / 2); ss.lineTo(sw / 2, -sh / 2 + sc); ss.lineTo(sw / 2, sh / 2 - sc); ss.lineTo(sw / 2 - sc, sh / 2)
    ss.lineTo(-sw / 2 + sc, sh / 2); ss.lineTo(-sw / 2, sh / 2 - sc); ss.lineTo(-sw / 2, -sh / 2 + sc); ss.closePath()
    const sg = new THREE.ShapeGeometry(ss)
    // ShapeGeometry UVs are in shape units; map them to 0..1 for the face texture
    const uv = sg.attributes.uv as THREE.BufferAttribute, pos = sg.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + sw / 2) / sw, (pos.getY(i) + sh / 2) / sh)
    const screen = new THREE.Mesh(sg, screenFace.material); screen.position.z = D / 2 + 0.014; head.add(screen)
    screen.onBeforeRender = () => screenFace.tick()
    // bezel bolts
    for (const [x, y] of [[-0.24, 0.14], [0, 0.155], [0.24, 0.14], [-0.24, -0.14], [0, -0.155], [0.24, -0.14], [-0.3, 0], [0.3, 0]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), gold); b.position.set(x, y, D / 2 + 0.014); head.add(b)
    }
    // side and rear vents
    for (const side of [-1, 1]) {
      box(0.012, 0.18, 0.16, black, side * (W / 2 + 0.008), 0, 0, head)
      for (let k = 0; k < 6; k++) box(0.016, 0.01, 0.15, steel, side * (W / 2 + 0.01), -0.075 + k * 0.03, 0, head)
    }
    box(0.42, 0.2, 0.012, black, 0, 0, -D / 2 - 0.014, head)
    for (let k = 0; k < 7; k++) box(0.4, 0.012, 0.016, steel, 0, -0.085 + k * 0.028, -D / 2 - 0.016, head)
  }

  const lamp = new THREE.Object3D(); lamp.position.set(0, 0.66, 0.95); add(lamp)
  const mastCam = new THREE.Object3D(); mastCam.position.set(HEAD_X, HEAD_Y, HEAD_Z + 0.17); add(mastCam)
  // soft fill so the rover stays readable in polar shadow (lights only the rover and figures; terrain has its own shader)
  const fill = new THREE.HemisphereLight(0xe6ecf4, 0x3a3836, 0.85); add(fill)
  // ~600 small parts would be ~600 draw calls per frame: bake them into one mesh per material
  // (body and head as one rigid set, each wheel as its own set so it can still spin)
  mergeByMaterial(g, (o) => wheels.includes(o) || o === head)
  mergeByMaterial(head, () => false)
  for (const w of wheels) mergeByMaterial(w, () => false)
  return { group: g, wheels, lamp, mastCam }
}

/** Dark-blue solar cells with silver bus lines, drawn once. */
function solarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512
  const x = c.getContext('2d')!
  x.fillStyle = '#0d1430'; x.fillRect(0, 0, 256, 512)
  const cw = 256 / 8, ch = 512 / 14
  for (let i = 0; i < 8; i++) for (let j = 0; j < 14; j++) {
    const gr = x.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch)
    gr.addColorStop(0, '#16224a'); gr.addColorStop(1, '#0a1029')
    x.fillStyle = gr; x.fillRect(i * cw + 1.5, j * ch + 1.5, cw - 3, ch - 3)
    x.fillStyle = 'rgba(190,200,220,0.35)'; x.fillRect(i * cw + cw / 2 - 0.5, j * ch + 2, 1, ch - 4)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

/** The dot-matrix face: square eyes and a smile, white on black glass. Blinks every few seconds. */
function faceScreen(): { material: THREE.MeshStandardMaterial; tick: () => void } {
  const c = document.createElement('canvas'); c.width = 224; c.height = 112
  const x = c.getContext('2d')!
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter
  const P = 7 // one dot = 7 px, grid 32×16
  const dot = (i: number, j: number) => x.fillRect(i * P + 1, j * P + 1, P - 2, P - 2)
  let blink = false
  const draw = () => {
    x.fillStyle = '#030304'; x.fillRect(0, 0, c.width, c.height)
    x.fillStyle = '#f4f2ea'
    for (const ex of [8, 20]) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (!blink || j === 3) dot(ex + i, 3 + j)
    const smile: [number, number][] = [[8, 10], [9, 11], [10, 12], [11, 12], [12, 12], [13, 12], [14, 12], [15, 12], [16, 12], [17, 12], [18, 12], [19, 12], [20, 12], [21, 12], [22, 11], [23, 10]]
    for (const [i, j] of smile) dot(i, j)
    t.needsUpdate = true
  }
  draw()
  const material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, roughness: 0.15, metalness: 0.2 })
  let next = performance.now() + 3000
  return {
    material,
    tick: () => {
      const now = performance.now()
      if (!blink && now > next) { blink = true; draw(); next = now + 140 }
      else if (blink && now > next) { blink = false; draw(); next = now + 2500 + Math.random() * 3500 }
    },
  }
}

/**
 * Replace the plain meshes under `root` (not under any child for which `keep` is true, and not meshes with
 * multi-materials or per-frame callbacks) by one merged mesh per material, in root's local space.
 */
function mergeByMaterial(root: THREE.Object3D, keep: (o: THREE.Object3D) => boolean) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const drop: THREE.Mesh[] = []
  const walk = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (keep(c)) continue
      const m = c as THREE.Mesh
      if (m.isMesh && !Array.isArray(m.material) && m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender) {
        const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone())
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k)
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2))
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
        const list = buckets.get(m.material) ?? []; list.push(geo); buckets.set(m.material, list)
        drop.push(m)
      }
      walk(c)
    }
  }
  walk(root)
  for (const m of drop) { m.parent?.remove(m); m.geometry.dispose() }
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (merged) root.add(new THREE.Mesh(merged, mat))
  }
}
