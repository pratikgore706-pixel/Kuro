import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Crosshair, ExternalLink, MapPin, Minus, Plus, RotateCcw, Search, X } from 'lucide-react'
import { estimateSlopeDeg, fromStereo, makeSampler, toStereo, type MoonData } from '../moonData'
import { POLE_EXTENT, POLE_PIXEL, type RasterKind, type RasterLayer, type RasterResult } from './mapShared'
import { CATEGORIES, gazetteerUrl, loadMoonNames, searchNames, typeOf, type Category, type MoonFeature } from './moonNames'
import '../../styles/explorer-map.css'

/**
 * The Moon as a proper 2D map.
 *  Whole Moon — simple cylindrical (equirectangular) projection, the projection NASA Moon Trek and LROC QuickMap use
 *  for the global mosaic; NASA LRO WAC tiles stream in as you zoom (from Moon Trek), over the bundled mosaic.
 *  South Pole — polar stereographic centred on the pole, true scale at the pole: the standard projection for polar
 *  maps, with no stretching at 90°S. Built from NASA LOLA elevation (80 m and 320 m south polar products).
 * Names: every IAU-approved feature from the USGS Gazetteer of Planetary Nomenclature, shown by size as you zoom.
 */

export type MapKind = 'global' | 'pole'
export interface MapSite { id: string; name: string; lat: number; lon: number; note?: string }
export interface MapApi { focusSite: (id: string) => void; reset: () => void }

const TREK = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm'
const KM_PER_DEG = (Math.PI * 1737.4) / 180
const DEG = Math.PI / 180
const POLE_LIMIT = -70 // edge of the polar map
const LAYERS: Record<MapKind, { id: RasterLayer; label: string; hint: string }[]> = {
  global: [
    { id: 'photo', label: 'Photo', hint: 'NASA LRO Wide Angle Camera mosaic (Moon Trek tiles as you zoom)' },
    { id: 'relief', label: 'Relief', hint: 'Shaded relief from NASA LOLA elevation, lit from the north-west' },
    { id: 'elevation', label: 'Elevation', hint: 'Height from NASA LOLA, coloured low (violet) to high (white)' },
  ],
  pole: [
    { id: 'relief', label: 'Relief', hint: 'Shaded relief from NASA LOLA south polar elevation (80–320 m)' },
    { id: 'elevation', label: 'Elevation', hint: 'Height from NASA LOLA, coloured low (violet) to high (white)' },
    { id: 'slope', label: 'Slope', hint: 'Ground slope from LOLA: green gentle, red steep' },
    { id: 'photo', label: 'Photo', hint: 'NASA LRO WAC mosaic reprojected to the polar map (coarser: ~2.5 km here)' },
  ],
}

type View = { cx: number; cy: number; s: number }
type Inset = { l: number; r: number; t: number; b: number }
type Picked = { kind: 'feature'; f: MoonFeature } | { kind: 'site'; s: MapSite } | null
type Box = { x: number; y: number; w: number; h: number; f: MoonFeature }

const fmtLat = (v: number) => `${Math.abs(v).toFixed(v > -10 && v < 10 ? 3 : 2)}°${v < 0 ? 'S' : 'N'}`
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'W' : 'E'}`
const fmtKm = (km: number) => (km >= 100 ? `${Math.round(km)} km` : km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`)
/** Stereographic scale factor at a latitude (map length ÷ ground length), 1 at the pole. */
const kAt = (lat: number) => 2 / (1 - Math.sin(lat * DEG))

export function MoonMap({ kind, onKind, moon, sites, selectedId, onSelect, onAddSite, apiRef }: {
  kind: MapKind
  onKind: (k: MapKind) => void
  moon: MoonData | null
  sites: MapSite[]
  selectedId: string
  onSelect: (id: string) => void
  onAddSite: (lat: number, lon: number, name: string) => void
  apiRef?: MutableRefObject<MapApi | null>
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const view = useRef<View>({ cx: 0, cy: 0, s: 1 })
  const size = useRef({ w: 1, h: 1, dpr: 1 })
  const inset = useRef<Inset>({ l: 0, r: 0, t: 0, b: 0 })
  const dirty = useRef(true)
  const raf = useRef(0)
  const boxes = useRef<Box[]>([])
  const anim = useRef<{ from: View; to: View; t0: number; dur: number } | null>(null)
  const pendingFly = useRef<{ lat: number; lon: number; km: number } | null>(null)

  const [layer, setLayer] = useState<Record<MapKind, RasterLayer>>({ global: 'photo', pole: 'relief' })
  const [cats, setCats] = useState<Record<Category, boolean>>({ seas: true, craters: true, small: true, mountains: true, valleys: true, landing: true })
  const [showSites, setShowSites] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [names, setNames] = useState<MoonFeature[] | null>(null)
  const [namesErr, setNamesErr] = useState(false)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Picked>(null)
  const [readout, setReadout] = useState<{ lat: number; lon: number; h: number; slope: number | null; near: string | null } | null>(null)
  const [legend, setLegend] = useState<{ min: number; max: number } | null>(null)
  const [, setTick] = useState(0) // re-render on raster arrival (for the legend)
  const curLayer = layer[kind]

  // everything the draw loop reads lives in one ref, so drawing never waits on React
  const st = useRef({ kind, layer: curLayer, cats, showSites, showGrid, names, sites, selectedId, picked })
  st.current = { kind, layer: curLayer, cats, showSites, showGrid, names, sites, selectedId, picked }
  const invalidate = () => { dirty.current = true }
  useEffect(invalidate, [kind, curLayer, cats, showSites, showGrid, names, sites, selectedId, picked])

  // ------------------------------------------------------------------ data: names
  useEffect(() => { loadMoonNames().then((r) => setNames(r.features)).catch(() => setNamesErr(true)) }, [])
  /** Feature positions on the current projection, computed once per projection. */
  const proj = useMemo(() => {
    if (!names) return null
    const x = new Float64Array(names.length), y = new Float64Array(names.length), k = new Float32Array(names.length)
    names.forEach((f, i) => {
      if (kind === 'global') { x[i] = f.lon; y[i] = -f.lat; k[i] = 1 }
      else if (f.lat < POLE_LIMIT + 2) { const [px, py] = toStereo(f.lat, f.lon); x[i] = px; y[i] = -py; k[i] = kAt(f.lat) }
      else { x[i] = NaN; y[i] = NaN }
    })
    return { x, y, k }
  }, [names, kind])
  const projRef = useRef(proj); projRef.current = proj

  // ------------------------------------------------------------------ data: rasters (worker) and imagery
  const worker = useRef<Worker | null>(null)
  const rasters = useRef(new Map<string, RasterResult | 'pending'>())
  const reqId = useRef(0)
  const photo = useRef<HTMLImageElement | null>(null)
  const tiles = useRef(new Map<string, HTMLImageElement | 'loading' | 'failed'>())
  const tileQueue = useRef<string[]>([])
  const inflight = useRef(0)

  useEffect(() => {
    if (!moon) return
    const w = new Worker(new URL('./mapRaster.worker.ts', import.meta.url), { type: 'module' })
    const abs = (u: string | null) => (u ? new URL(u, location.href).href : null)
    w.postMessage({ init: {
      global: moon.global && { width: moon.global.width, height: moon.global.height, data: moon.global.data },
      pole: moon.pole && { width: moon.pole.width, height: moon.pole.height, data: moon.pole.data, x0: moon.pole.x0, y0: moon.pole.y0, pixelM: moon.pole.pixelM, noData: moon.pole.noData },
      poleHi: moon.poleHi && { width: moon.poleHi.width, height: moon.poleHi.height, data: moon.poleHi.data, x0: moon.poleHi.x0, y0: moon.poleHi.y0, pixelM: moon.poleHi.pixelM, noData: moon.poleHi.noData },
      colorUrl: abs(moon.colorUrl),
    } })
    w.onmessage = (ev: MessageEvent<RasterResult>) => {
      const r = ev.data
      rasters.current.set(`${r.kind}:${r.layer}`, r)
      dirty.current = true
      setTick((t) => t + 1)
    }
    worker.current = w
    if (moon.colorUrl) { const im = new Image(); im.onload = () => { photo.current = im; dirty.current = true }; im.src = moon.colorUrl }
    dirty.current = true
    return () => { w.terminate(); worker.current = null; for (const r of rasters.current.values()) if (r !== 'pending') r.bitmap?.close(); rasters.current.clear() }
  }, [moon])

  const raster = (k: RasterKind, l: RasterLayer): RasterResult | null => {
    const key = `${k}:${l}`, r = rasters.current.get(key)
    if (r === 'pending') return null
    if (r) return r.bitmap ? r : null
    if (worker.current) { rasters.current.set(key, 'pending'); worker.current.postMessage({ id: ++reqId.current, kind: k, layer: l }) }
    return null
  }
  const wantTile = (url: string) => {
    if (tiles.current.has(url)) return
    tiles.current.set(url, 'loading'); tileQueue.current.push(url); pumpTiles()
  }
  const pumpTiles = () => {
    while (inflight.current < 8 && tileQueue.current.length) {
      const url = tileQueue.current.shift()!
      inflight.current++
      const im = new Image()
      im.onload = () => { inflight.current--; tiles.current.set(url, im); dirty.current = true; pumpTiles() }
      im.onerror = () => { inflight.current--; tiles.current.set(url, 'failed'); pumpTiles() }
      im.src = url
    }
    // keep the cache bounded
    if (tiles.current.size > 700) { let n = tiles.current.size - 600; for (const k of tiles.current.keys()) { if (n-- <= 0) break; if (tiles.current.get(k) !== 'loading') tiles.current.delete(k) } }
  }

  // ------------------------------------------------------------------ view helpers
  const fitScale = (k: MapKind) => {
    const { w, h } = size.current, i = inset.current
    const fw = Math.max(200, w - i.l - i.r), fh = Math.max(160, h - i.t - i.b)
    return k === 'global' ? Math.min(fw / 360, fh / 180) : Math.min(fw, fh) / (2 * POLE_EXTENT.poleWide)
  }
  const limits = (k: MapKind) => ({ min: fitScale(k) * 0.8, max: k === 'global' ? 900 : 1 / 12 })
  const centre = () => { const { w, h } = size.current, i = inset.current; return [(i.l + w - i.r) / 2, (i.t + h - i.b) / 2] }
  const clampView = (v: View, k: MapKind): View => {
    const L = limits(k), s = Math.max(L.min, Math.min(L.max, v.s))
    const ex = k === 'global' ? 180 : POLE_EXTENT.poleWide, ey = k === 'global' ? 90 : POLE_EXTENT.poleWide
    return { s, cx: Math.max(-ex, Math.min(ex, v.cx)), cy: Math.max(-ey, Math.min(ey, v.cy)) }
  }
  const toScreen = (x: number, y: number): [number, number] => { const v = view.current, [ox, oy] = centre(); return [(x - v.cx) * v.s + ox, (y - v.cy) * v.s + oy] }
  const toWorld = (sx: number, sy: number): [number, number] => { const v = view.current, [ox, oy] = centre(); return [(sx - ox) / v.s + v.cx, (sy - oy) / v.s + v.cy] }
  const worldOf = (lat: number, lon: number, k: MapKind): [number, number] => { if (k === 'global') return [lon, -lat]; const [x, y] = toStereo(lat, lon); return [x, -y] }
  const latLonOf = (x: number, y: number, k: MapKind): [number, number] | null => {
    if (k === 'global') return Math.abs(y) <= 90 && Math.abs(x) <= 180 ? [-y, x] : null
    const [lat, lon] = fromStereo(x, -y)
    return lat <= POLE_LIMIT ? [lat, lon] : null
  }
  const flyTo = (to: View, dur = 650) => { anim.current = { from: { ...view.current }, to: clampView(to, st.current.kind), t0: performance.now(), dur }; dirty.current = true }
  const flyToFeature = (lat: number, lon: number, km: number) => {
    const k = st.current.kind
    if (k === 'pole' && lat > POLE_LIMIT + 1) { pendingFly.current = { lat, lon, km }; onKind('global'); return }
    // near the pole the cylindrical map stretches everything sideways: use the polar map there
    if (k === 'global' && lat < -80) { pendingFly.current = { lat, lon, km }; onKind('pole'); return }
    const [x, y] = worldOf(lat, lon, k)
    const { w, h } = size.current, span = Math.min(w, h) * 0.32
    const s = k === 'global' ? span / Math.max(0.05, km / KM_PER_DEG) : span / Math.max(400, km * 1000 * kAt(lat))
    flyTo({ cx: x, cy: y, s })
  }
  const reset = () => flyTo({ cx: 0, cy: 0, s: fitScale(st.current.kind) })

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      reset,
      focusSite: (id) => { const s = st.current.sites.find((x) => x.id === id); if (s) flyToFeature(s.lat, s.lon, st.current.kind === 'global' ? 400 : 40) },
    }
    return () => { apiRef.current = null }
  })

  // fit the new projection when the extent changes (and honour a pending fly from search)
  useEffect(() => {
    view.current = { cx: 0, cy: 0, s: fitScale(kind) }
    anim.current = null
    setPicked(null)
    const p = pendingFly.current
    if (p) { pendingFly.current = null; requestAnimationFrame(() => flyToFeature(p.lat, p.lon, p.km)) }
    dirty.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  // ------------------------------------------------------------------ size and inset (the open space between the Explorer's panels)
  useEffect(() => {
    const el = wrap.current!, c = cv.current!
    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = el.clientWidth, h = el.clientHeight
      const first = size.current.w <= 1
      size.current = { w, h, dpr }
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
      const xp = el.closest('.xp') as HTMLElement | null
      if (xp) {
        const cs = getComputedStyle(xp), px = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0
        const gap = px('--gap'), top = px('--top')
        inset.current = { l: px('--colL') + gap * 2, r: px('--colR') + gap * 2 + 48, t: top + 96, b: px('--dock') + gap * 2 + 34 }
        if (w < 860) inset.current = { l: 8, r: 8, t: 110, b: 150 }
      }
      if (first) view.current = { cx: 0, cy: 0, s: fitScale(st.current.kind) }
      else view.current = clampView(view.current, st.current.kind)
      dirty.current = true
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const xp = el.closest('.xp'); const mo = xp ? new MutationObserver(measure) : null
    if (xp && mo) mo.observe(xp, { attributes: true, attributeFilter: ['class'] })
    measure()
    return () => { ro.disconnect(); mo?.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------ drawing
  useEffect(() => {
    const loop = () => {
      raf.current = requestAnimationFrame(loop)
      const a = anim.current
      if (a) {
        const t = Math.min(1, (performance.now() - a.t0) / a.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        const ls = Math.log(a.from.s) + (Math.log(a.to.s) - Math.log(a.from.s)) * e
        view.current = { cx: a.from.cx + (a.to.cx - a.from.cx) * e, cy: a.from.cy + (a.to.cy - a.from.cy) * e, s: Math.exp(ls) }
        if (t >= 1) anim.current = null
        dirty.current = true
      }
      if (!dirty.current) return
      dirty.current = false
      draw()
      updateScale()
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function draw() {
    const c = cv.current
    if (!c) return
    const g = c.getContext('2d')!
    const { w, h, dpr } = size.current, v = view.current, S = st.current, K = S.kind
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#030507'; g.fillRect(0, 0, w, h)
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
    const [ox, oy] = centre()
    const place = (img: CanvasImageSource, x0: number, y0: number, x1: number, y1: number) => {
      const [a, b] = toScreen(x0, y0), [cx2, d] = toScreen(x1, y1)
      g.drawImage(img, a, b, cx2 - a, d - b)
    }

    // ---- base raster
    let legendFrom: RasterResult | null = null
    if (K === 'global') {
      if (S.layer === 'photo') {
        if (photo.current) place(photo.current, -180, -90, 180, 90)
        // Moon Trek tiles: level z has 2^(z+1) × 2^z tiles of 256 px; z = 8 is ~100 m per pixel
        const want = Math.ceil(Math.log2(Math.max(1, (v.s * dpr * 180) / 256)))
        const zMax = Math.max(0, Math.min(8, want))
        const [wx0, wy0] = toWorld(0, 0), [wx1, wy1] = toWorld(w, h)
        for (let z = 4; z <= zMax; z++) {
          const td = 180 / 2 ** z, cols = 2 ** (z + 1), rows = 2 ** z
          const c0 = Math.max(0, Math.floor((wx0 + 180) / td)), c1 = Math.min(cols - 1, Math.floor((wx1 + 180) / td))
          const r0 = Math.max(0, Math.floor((wy0 + 90) / td)), r1 = Math.min(rows - 1, Math.floor((wy1 + 90) / td))
          if ((c1 - c0 + 1) * (r1 - r0 + 1) > 160) continue
          // nearest the centre of the screen first
          const order: [number, number, number][] = []
          for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) order.push([r, cc, Math.hypot((cc + 0.5) * td - 180 - v.cx, (r + 0.5) * td - 90 - v.cy)])
          order.sort((p, q2) => p[2] - q2[2])
          for (const [r, cc] of order) {
            const url = `${TREK}/${z}/${r}/${cc}.jpg`, t = tiles.current.get(url)
            if (t instanceof HTMLImageElement) place(t, -180 + cc * td, -90 + r * td, -180 + (cc + 1) * td, -90 + (r + 1) * td)
            else if (z === zMax) wantTile(url)
          }
        }
      } else {
        const r = raster('global', S.layer)
        if (r?.bitmap) { place(r.bitmap, -180, -90, 180, 90); legendFrom = r }
        else if (photo.current) { g.globalAlpha = 0.35; place(photo.current, -180, -90, 180, 90); g.globalAlpha = 1 }
      }
    } else {
      const wide = raster('poleWide', S.layer)
      const E = POLE_EXTENT.poleWide
      if (wide?.bitmap) { place(wide.bitmap, -E, -E, E, E); legendFrom = wide }
      if (S.layer !== 'photo') {
        // finer LOLA grids when one wide pixel would be bigger than ~1.3 screen pixels
        if (v.s * POLE_PIXEL.poleWide > 1.3) { const m = raster('poleMid', S.layer); if (m?.bitmap) place(m.bitmap, -POLE_EXTENT.poleMid, -POLE_EXTENT.poleMid, POLE_EXTENT.poleMid, POLE_EXTENT.poleMid) }
        const [wx0, wy0] = toWorld(0, 0), [wx1, wy1] = toWorld(w, h), Eh = POLE_EXTENT.poleHi
        if (v.s * POLE_PIXEL.poleMid > 1.3 && wx1 > -Eh && wx0 < Eh && wy1 > -Eh && wy0 < Eh) { const hi = raster('poleHi', S.layer); if (hi?.bitmap) place(hi.bitmap, -Eh, -Eh, Eh, Eh) }
      }
      // fade the square corners beyond the map's 70°S edge
      const [px0, py0] = toScreen(0, 0)
      const rEdge = toStereo(POLE_LIMIT, 0)[1] * v.s
      g.save(); g.beginPath(); g.rect(0, 0, w, h); g.arc(px0, py0, rEdge, 0, Math.PI * 2, true); g.fillStyle = '#030507'; g.fill('evenodd'); g.restore()
    }
    if (legendFrom && (legendRef.current?.min !== legendFrom.min || legendRef.current?.max !== legendFrom.max)) { legendRef.current = { min: legendFrom.min, max: legendFrom.max }; queueMicrotask(() => setLegend(legendRef.current)) }

    // ---- graticule
    if (S.showGrid) drawGrid(g, w, h, ox, oy)

    // ---- names
    boxes.current = []
    const P = projRef.current
    if (S.names && P) {
      const placed: { x: number; y: number; w: number; h: number }[] = []
      const ins = inset.current, fx0 = ins.l - 10, fx1 = w - ins.r + 10, fy0 = ins.t - 40, fy1 = h - ins.b + 20
      const free = (b: { x: number; y: number; w: number; h: number }) => { for (const o of placed) if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) return false; return true }
      const list = S.names
      // the selected feature first, then landing sites, then everything by size (the list is sorted largest first)
      const order: number[] = []
      const pickedId = S.picked?.kind === 'feature' ? S.picked.f.id : -1
      list.forEach((f, i) => { if (f.id === pickedId) order.unshift(i); else if (f.type === 'ST') order.splice(pickedId >= 0 ? 1 : 0, 0, i); else order.push(i) })
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'
      let shown = 0
      for (const i of order) {
        if (shown > 420) break
        const f = list[i], x = P.x[i]
        if (isNaN(x)) continue
        const cat = typeOf(f.type).cat
        const isPicked = f.id === pickedId
        if (!S.cats[cat] && !isPicked) continue
        const [sx, sy] = toScreen(x, P.y[i])
        if (sx < fx0 || sx > fx1 || sy < fy0 || sy > fy1) continue
        const dpx = K === 'global' ? (f.km / KM_PER_DEG) * v.s : f.km * 1000 * P.k[i] * v.s
        const need = cat === 'seas' ? 30 : cat === 'craters' ? 22 : cat === 'small' ? 30 : cat === 'landing' ? (f.type === 'ST' ? 0 : 14) : 36
        if (dpx < need && !isPicked) continue
        // crater rims
        if ((cat === 'craters' || cat === 'small') && dpx > 16) {
          g.beginPath()
          const ry = dpx / 2, rx = K === 'global' ? ry / Math.max(0.05, Math.cos(f.lat * DEG)) : ry
          g.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2)
          g.strokeStyle = isPicked ? 'rgba(181,161,138,0.95)' : 'rgba(236,232,221,0.16)'; g.lineWidth = isPicked ? 1.6 : 1; g.stroke()
        }
        // label
        let font: string, color = '#ece8dd', text = f.name
        if (cat === 'seas') { const fs = Math.max(11, Math.min(19, dpx / 10)); font = `italic 500 ${fs}px "Inter Variable", Inter, sans-serif`; color = 'rgba(236,232,221,0.92)'; text = f.name.toUpperCase() }
        else if (cat === 'craters') { const fs = Math.max(10.5, Math.min(15, dpx / 6)); font = `500 ${fs}px "Inter Variable", Inter, sans-serif` }
        else if (cat === 'small') { font = `400 10px "Inter Variable", Inter, sans-serif`; color = 'rgba(236,232,221,0.78)' }
        else if (cat === 'landing') { font = `600 11px "IBM Plex Mono", monospace`; color = '#d8c3a5' }
        else { font = `500 9.5px "IBM Plex Mono", monospace`; color = 'rgba(200,214,230,0.9)'; text = f.name.toUpperCase() }
        g.font = font
        if (cat === 'seas') (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '1.5px'
        const tw = g.measureText(text).width, th = parseFloat(font.match(/(\d+(\.\d+)?)px/)![1]) + 4
        const ly = cat === 'landing' || dpx < tw * 0.9 ? sy - (cat === 'landing' ? 12 : 0) : sy
        const b = { x: sx - tw / 2 - 3, y: ly - th / 2, w: tw + 6, h: th }
        if (!free(b) && !isPicked) { (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'; continue }
        placed.push(b); shown++
        if (cat === 'landing') { g.fillStyle = '#d8c3a5'; g.save(); g.translate(sx, sy); g.rotate(Math.PI / 4); g.fillRect(-3.5, -3.5, 7, 7); g.restore() }
        g.strokeStyle = 'rgba(3,5,7,0.82)'; g.lineWidth = 3.2; g.strokeText(text, sx, ly)
        g.fillStyle = isPicked ? '#e9cfa6' : color; g.fillText(text, sx, ly)
        ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
        boxes.current.push({ ...b, f })
      }
    }

    // ---- KURO sites
    if (S.showSites) {
      g.font = '600 10.5px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'
      for (const s of S.sites) {
        if (K === 'pole' && s.lat > POLE_LIMIT) continue
        const [x, y] = worldOf(s.lat, s.lon, K), [sx, sy] = toScreen(x, y)
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue
        const sel = s.id === S.selectedId
        g.beginPath(); g.arc(sx, sy, sel ? 7 : 5, 0, Math.PI * 2)
        g.fillStyle = sel ? '#b5a18a' : 'rgba(181,161,138,0.25)'; g.fill()
        g.lineWidth = 1.5; g.strokeStyle = sel ? '#fff7e8' : '#b5a18a'; g.stroke()
        const ins = inset.current
        if ((sel || v.s > (K === 'global' ? 6 : 0.0009)) && sx > ins.l - 10 && sx < w - ins.r - 60 && sy > ins.t - 40 && sy < h - ins.b + 20) {
          const t = s.name.toUpperCase(), tw = g.measureText(t).width
          // an official IAU name already printed here wins; the KURO marker stays
          if (boxes.current.some((b) => sx + 10 < b.x + b.w && sx + 10 + tw > b.x && sy - 7 < b.y + b.h && sy + 7 > b.y)) continue
          g.strokeStyle = 'rgba(3,5,7,0.85)'; g.lineWidth = 3; g.strokeText(t, sx + 10, sy)
          g.fillStyle = sel ? '#f2efe6' : '#cdb89c'; g.fillText(t, sx + 10, sy)
        }
      }
    }
  }
  const legendRef = useRef<{ min: number; max: number } | null>(null)

  function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, ox: number, oy: number) {
    const v = view.current, K = st.current.kind
    g.save()
    g.strokeStyle = 'rgba(236,232,221,0.13)'; g.lineWidth = 1
    g.fillStyle = 'rgba(236,232,221,0.55)'; g.font = '500 9.5px "IBM Plex Mono", monospace'
    const i = inset.current
    if (K === 'global') {
      const steps = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1], step = steps.find((d) => d * v.s < 110) ?? 0.1
      const st2 = steps[Math.max(0, steps.indexOf(step) - 1)]
      const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(w, h)
      g.textAlign = 'left'; g.textBaseline = 'bottom'
      for (let lon = Math.ceil(Math.max(-180, x0) / st2) * st2; lon <= Math.min(180, x1); lon += st2) {
        const [sx] = toScreen(lon, 0); g.beginPath(); g.moveTo(sx, Math.max(0, toScreen(0, -90)[1])); g.lineTo(sx, Math.min(h, toScreen(0, 90)[1])); g.stroke()
        g.fillText(fmtLon(+lon.toFixed(2)).replace('.00', ''), sx + 3, h - i.b + 2)
      }
      g.textBaseline = 'middle'
      for (let lat = Math.ceil(Math.max(-90, -y1) / st2) * st2; lat <= Math.min(90, -y0); lat += st2) {
        const [, sy] = toScreen(0, -lat); g.beginPath(); g.moveTo(Math.max(0, toScreen(-180, 0)[0]), sy); g.lineTo(Math.min(w, toScreen(180, 0)[0]), sy); g.stroke()
        g.fillText(lat === 0 ? '0°' : fmtLat(+lat.toFixed(2)).replace('.00', '').replace('.000', ''), i.l + 2, sy - 7)
      }
    } else {
      const [px, py] = toScreen(0, 0)
      const ringsPx = (lat: number) => toStereo(lat, 0)[1] * v.s
      const steps = [5, 2, 1, 0.5, 0.25, 0.1], step = steps.find((d) => ringsPx(-90 + d) < 120) ?? 0.1
      const st2 = steps[Math.max(0, steps.indexOf(step) - 1)]
      g.textAlign = 'center'; g.textBaseline = 'middle'
      for (let lat = -90 + st2; lat <= POLE_LIMIT + 1e-9; lat += st2) {
        const r = ringsPx(lat)
        if (r < 4) continue
        g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.stroke()
        // label on the 0° meridian (straight up), where it is on screen
        const ly = py - r
        if (ly > i.t && ly < h - i.b && px > i.l && px < w - i.r) { g.fillStyle = 'rgba(3,5,7,0.7)'; g.fillRect(px - 22, ly - 7, 44, 14); g.fillStyle = 'rgba(236,232,221,0.62)'; g.fillText(fmtLat(lat).replace(/\.0+°/, '°').replace(/(\.\d*?)0+°/, '$1°'), px, ly) }
      }
      const mStep = v.s * 1000 > 1.5 ? 10 : 30
      const rMax = ringsPx(POLE_LIMIT)
      const rLab = Math.min(rMax * 0.97, Math.max(60, Math.min(Math.abs(w - i.r - px), Math.abs(px - i.l), Math.abs(py - i.t), Math.abs(h - i.b - py)) - 18))
      for (let lon = 0; lon < 360; lon += mStep) {
        const a = lon * DEG, dx = Math.sin(a), dy = -Math.cos(a)
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx * rMax, py + dy * rMax); g.stroke()
        const lx = px + dx * rLab, ly2 = py + dy * rLab
        if (lon % 30 === 0 && lx > i.l && lx < w - i.r && ly2 > i.t && ly2 < h - i.b) {
          const t = lon === 0 ? '0°' : lon === 180 ? '180°' : lon < 180 ? `${lon}°E` : `${360 - lon}°W`
          g.fillStyle = 'rgba(3,5,7,0.7)'; g.fillRect(lx - 18, ly2 - 7, 36, 14); g.fillStyle = 'rgba(236,232,221,0.62)'; g.fillText(t, lx, ly2)
        }
      }
      void ox; void oy
    }
    g.restore()
  }

  // ------------------------------------------------------------------ interaction
  const sampler = useMemo(() => (moon ? makeSampler(moon) : null), [moon])
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; s: number } | null>(null)
  const hoverRaf = useRef(0)

  const local = (e: { clientX: number; clientY: number }) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
  const zoomAt = (sx: number, sy: number, f: number) => {
    anim.current = null
    const K = st.current.kind, [wx, wy] = toWorld(sx, sy)
    const nv = clampView({ ...view.current, s: view.current.s * f }, K)
    const [ox, oy] = centre()
    view.current = clampView({ s: nv.s, cx: wx - (sx - ox) / nv.s, cy: wy - (sy - oy) / nv.s }, K)
    dirty.current = true
  }
  const onWheel = (e: React.WheelEvent) => { setReadout(null); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018))) }
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    anim.current = null
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.current.s }; drag.current = null }
    else drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y)
      const r = cv.current!.getBoundingClientRect()
      const f = (pinch.current.s * (d / pinch.current.d)) / view.current.s
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, f)
      return
    }
    const d = drag.current
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (d.moved) {
        const v = view.current
        view.current = clampView({ s: v.s, cx: v.cx - dx / v.s, cy: v.cy - dy / v.s }, st.current.kind)
        d.x = e.clientX; d.y = e.clientY; dirty.current = true
      }
    }
    // readout under the pointer (once per frame)
    const [x, y] = local(e)
    cancelAnimationFrame(hoverRaf.current)
    hoverRaf.current = requestAnimationFrame(() => {
      const K = st.current.kind, ll = latLonOf(...toWorld(x, y), K)
      if (!ll) { setReadout(null); return }
      const [lat, lon] = ll
      const hgt = sampler ? sampler.height(lat, lon) : NaN
      const slope = sampler && lat < -79.5 ? estimateSlopeDeg(sampler, lat, lon) : null
      setReadout({ lat, lon, h: hgt, slope: slope !== null && isFinite(slope) ? slope : null, near: hitFeature(x, y)?.name ?? null })
    })
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const d = drag.current
    drag.current = null
    if (!d || d.moved || d.id !== e.pointerId) return
    const [x, y] = local(e)
    // a click: a KURO site, a label, a crater under the pointer, or nothing
    const K = st.current.kind
    if (st.current.showSites) {
      for (const s of st.current.sites) {
        if (K === 'pole' && s.lat > POLE_LIMIT) continue
        const [sx, sy] = toScreen(...worldOf(s.lat, s.lon, K))
        if (Math.hypot(sx - x, sy - y) < 11) { onSelect(s.id); setPicked({ kind: 'site', s }); return }
      }
    }
    const f = hitFeature(x, y)
    setPicked(f ? { kind: 'feature', f } : null)
  }
  const onDouble = (e: React.MouseEvent) => { const [x, y] = local(e); const [wx, wy] = toWorld(x, y); flyTo({ ...view.current, cx: wx, cy: wy, s: view.current.s * 2.2 }, 380) }
  /** The label under (x, y), else the smallest named crater or region containing it. */
  function hitFeature(x: number, y: number): MoonFeature | null {
    for (const b of boxes.current) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.f
    const P = projRef.current, list = st.current.names, K = st.current.kind
    if (!P || !list) return null
    const [wx, wy] = toWorld(x, y), v = view.current
    let best: MoonFeature | null = null
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i], cat = typeOf(f.type).cat
      if (!st.current.cats[cat] || isNaN(P.x[i]) || (cat !== 'craters' && cat !== 'small' && cat !== 'seas')) continue
      const rpx = (K === 'global' ? (f.km / KM_PER_DEG) * v.s : f.km * 1000 * P.k[i] * v.s) / 2
      if (rpx < 6) continue
      const dx = (wx - P.x[i]) * v.s * (K === 'global' ? Math.cos(f.lat * DEG) : 1), dy = (wy - P.y[i]) * v.s
      if (dx * dx + dy * dy < rpx * rpx) { best = f; break } // list is largest first, so scanning backwards finds the smallest
    }
    return best
  }
  const onKey = (e: React.KeyboardEvent) => {
    const { w, h } = size.current, step = 80, v = view.current
    if (e.key === '+' || e.key === '=') zoomAt(w / 2, h / 2, 1.5)
    else if (e.key === '-' || e.key === '_') zoomAt(w / 2, h / 2, 1 / 1.5)
    else if (e.key === '0') reset()
    else if (e.key.startsWith('Arrow')) {
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      view.current = clampView({ s: v.s, cx: v.cx + dx / v.s, cy: v.cy + dy / v.s }, st.current.kind); dirty.current = true
    } else return
    e.preventDefault()
  }

  // ------------------------------------------------------------------ scale bar (written straight to the DOM on each draw)
  const scaleI = useRef<HTMLElement>(null), scaleT = useRef<HTMLSpanElement>(null)
  function updateScale() {
    const v = view.current, K = st.current.kind
    let kmPerPx: number
    if (K === 'global') kmPerPx = (KM_PER_DEG * Math.max(0.05, Math.cos(-v.cy * DEG))) / v.s
    else kmPerPx = 1 / (v.s * 1000 * kAt(fromStereo(v.cx, -v.cy)[0]))
    const target = kmPerPx * 110, p = Math.pow(10, Math.floor(Math.log10(target)))
    const n = [1, 2, 5, 10].map((m) => m * p).filter((x) => x <= target).pop() ?? p
    if (scaleI.current) scaleI.current.style.width = `${n / kmPerPx}px`
    if (scaleT.current) scaleT.current.textContent = fmtKm(n) + (K === 'global' ? ' at centre' : '')
  }

  const results = useMemo(() => (names ? searchNames(names, q) : []), [names, q])
  const choose = (f: MoonFeature) => { setQ(''); setPicked({ kind: 'feature', f }); if (!st.current.cats[typeOf(f.type).cat]) setCats((c) => ({ ...c, [typeOf(f.type).cat]: true })); flyToFeature(f.lat, f.lon, f.km) }
  const pf = picked?.kind === 'feature' ? picked.f : null, ps = picked?.kind === 'site' ? picked.s : null

  return (
    <div className="mm" ref={wrap}>
      <canvas ref={cv} className="mm-canvas" tabIndex={0} aria-label={`Map of the ${kind === 'global' ? 'whole Moon' : 'lunar South Pole'}. Drag to pan, scroll or pinch to zoom, double-click to zoom in, click a name for details.`}
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDouble} onKeyDown={onKey}
        onPointerLeave={() => setReadout(null)} />

      {/* search and layers */}
      <div className="mm-panel" data-occlude>
        <div className="mm-search">
          <Search size={14} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={names ? `Search ${names.length.toLocaleString()} named places` : namesErr ? 'Names could not load' : 'Loading names…'}
            aria-label="Search lunar feature names" disabled={!names}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) choose(results[0]); if (e.key === 'Escape') setQ('') }} />
          {q && <button className="mm-x" onClick={() => setQ('')} aria-label="Clear search"><X size={13} /></button>}
          {results.length > 0 && (
            <ul className="mm-results" role="listbox">
              {results.map((f) => (
                <li key={f.id}><button role="option" aria-selected="false" onClick={() => choose(f)}>
                  <b>{f.name}</b><span>{typeOf(f.type).label} · {fmtKm(f.km)}</span><span className="mono">{fmtLat(f.lat)} {fmtLon(f.lon)}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="mm-seg" role="radiogroup" aria-label="Map layer">
          {LAYERS[kind].map((l) => <button key={l.id} role="radio" aria-checked={curLayer === l.id} className={curLayer === l.id ? 'on' : ''} onClick={() => setLayer((x) => ({ ...x, [kind]: l.id }))} title={l.hint}>{l.label}</button>)}
        </div>
        <div className="mm-chips" aria-label="What to show">
          {CATEGORIES.map((c) => <button key={c.id} className={cats[c.id] ? 'on' : ''} aria-pressed={cats[c.id]} onClick={() => setCats((x) => ({ ...x, [c.id]: !x[c.id] }))}>{c.label}</button>)}
          <button className={showSites ? 'on' : ''} aria-pressed={showSites} onClick={() => setShowSites(!showSites)}>KURO sites</button>
          <button className={showGrid ? 'on' : ''} aria-pressed={showGrid} onClick={() => setShowGrid(!showGrid)}>Grid</button>
        </div>
        {(curLayer === 'elevation' || curLayer === 'slope') && (
          <div className="mm-legend">
            <i className={'mm-ramp ' + curLayer} />
            <span className="mono">{curLayer === 'slope' ? '0°' : legend ? `${(legend.min / 1000).toFixed(1)} km` : ''}</span>
            <span className="mono">{curLayer === 'slope' ? '35°+' : legend ? `+${(legend.max / 1000).toFixed(1)} km` : ''}</span>
          </div>
        )}
      </div>

      {/* zoom */}
      <div className="mm-zoom" data-occlude>
        <button onClick={() => zoomAt(...(centre() as [number, number]), 1.8)} aria-label="Zoom in"><Plus size={15} /></button>
        <button onClick={() => zoomAt(...(centre() as [number, number]), 1 / 1.8)} aria-label="Zoom out"><Minus size={15} /></button>
        <button onClick={reset} aria-label="Show the whole map"><RotateCcw size={14} /></button>
      </div>

      {/* readout + scale + credits */}
      <div className="mm-foot" data-occlude>
        <div className="mm-read mono" aria-live="off">
          {readout ? <>
            <span>{fmtLat(readout.lat)} {fmtLon(readout.lon)}</span>
            {isFinite(readout.h) && <span>{readout.h >= 0 ? '+' : '−'}{Math.abs(Math.round(readout.h)).toLocaleString()} m</span>}
            {readout.slope !== null && <span>slope {readout.slope.toFixed(1)}°</span>}
            {readout.near && <span className="near">{readout.near}</span>}
          </> : <span className="dim">{kind === 'global' ? 'Simple cylindrical projection · point anywhere for coordinates and height' : 'South polar stereographic · true scale at the pole · edge at 70°S'}</span>}
        </div>
        <div className="mm-scale"><i ref={scaleI} /><span className="mono" ref={scaleT} /></div>
        <p className="mm-credit">Imagery NASA/GSFC/Arizona State Univ. LRO WAC via <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">Moon Trek</a> · Elevation NASA LOLA · Names IAU/USGS <a href="https://planetarynames.wr.usgs.gov/" target="_blank" rel="noreferrer">Gazetteer</a></p>
      </div>

      {/* details card */}
      {(pf || ps) && (
        <aside className="mm-card" data-occlude aria-label="Selected place">
          <button className="mm-x" onClick={() => setPicked(null)} aria-label="Close"><X size={14} /></button>
          {pf && <>
            <p className="mm-kicker">{typeOf(pf.type).label}</p>
            <h3>{pf.name}</h3>
            <dl>
              <div><dt>Centre</dt><dd className="mono">{fmtLat(pf.lat)} · {fmtLon(pf.lon)}</dd></div>
              <div><dt>{['VA', 'RI', 'CA', 'RU', 'DO'].includes(pf.type) ? 'Length' : 'Diameter'}</dt><dd className="mono">{fmtKm(pf.km)}</dd></div>
              {sampler && isFinite(sampler.height(pf.lat, pf.lon)) && <div><dt>Height at centre</dt><dd className="mono">{Math.round(sampler.height(pf.lat, pf.lon)).toLocaleString()} m</dd></div>}
              {pf.origin && <div className="wide"><dt>Named for</dt><dd>{pf.origin}</dd></div>}
            </dl>
            <div className="mm-actions">
              <button onClick={() => flyToFeature(pf.lat, pf.lon, pf.km)}><Crosshair size={13} /> Zoom to it</button>
              <button onClick={() => onAddSite(pf.lat, pf.lon, pf.name)} title="Add this place to KURO’s sites (South Pole places are ranked)"><MapPin size={13} /> Add as a site</button>
              <a href={gazetteerUrl(pf.id)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> IAU / USGS record</a>
              <a href="https://quickmap.lroc.asu.edu/" target="_blank" rel="noreferrer"><ExternalLink size={13} /> LROC QuickMap</a>
            </div>
          </>}
          {ps && <>
            <p className="mm-kicker">KURO site</p>
            <h3>{ps.name}</h3>
            <dl>
              <div><dt>Position</dt><dd className="mono">{fmtLat(ps.lat)} · {fmtLon(ps.lon)}</dd></div>
              {ps.note && <div className="wide"><dt>About</dt><dd>{ps.note}</dd></div>}
            </dl>
            <p className="mm-hint">Selected — its sunlight, Earth view and score are in the panel on the right.</p>
          </>}
        </aside>
      )}
    </div>
  )
}
