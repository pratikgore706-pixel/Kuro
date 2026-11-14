#!/usr/bin/env node
/**
 * KURO — fetch and prepare real NASA Moon data for the browser.
 *
 *   npm run fetch:moon            colour map + global elevation + South Pole elevation (~250 MB download, once)
 *   npm run fetch:moon -- --lite  colour map + global elevation only (~35 MB)
 *
 * Looks for source files in data/raw/ and in your Downloads folder first; downloads only what is missing.
 * Accepts either the NASA SVS / PGDA files below or the same LOLA grids from the NASA PDS Geosciences
 * archive (ldem_16.img, ldem_80s_80m.img) and the Moon Trek WAC mosaic (moontrek_wac_4k.jpg).
 * Writes compact files to public/moon/:
 *   color.jpg            LRO LROC WAC colour mosaic, 2048×1024 equirectangular   (NASA SVS CGI Moon Kit, 2025)
 *   global.u16           LOLA elevation, 2880×1440 equirectangular, uint16        (NASA SVS CGI Moon Kit ldem_16_uint)
 *   pole.i16             LOLA South Pole DEM 80–90°S, 1900×1900 at 320 m, int16 m (NASA PGDA product 90, Barker et al. 2023)
 *   pole_hi.i16          LOLA South Pole DEM, inner 2048×2048 at 80 m, int16 m    (same product, native resolution)
 *   manifest.json        sizes, units, projection and sources for every file above
 *
 * Nothing here is invented: every value written is a NASA measurement, resampled only by averaging.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { fromFile } from 'geotiff'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data', 'raw')
const OUT = join(ROOT, 'public', 'moon')
const LITE = process.argv.includes('--lite')

const SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720'
const PGDA = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp'
const PDS = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr'
/** Each role lists acceptable files in order of preference; the first one found locally or downloaded wins. */
const SOURCES = {
  color: [
    { kind: 'svs-color', url: `${SVS}/lroc_color_2k.jpg`, file: 'lroc_color_2k.jpg', mb: 0.4 },
    { kind: 'trek-wac', url: null, file: 'moontrek_wac_4k.jpg', mb: 1 },
  ],
  global: [
    { kind: 'pds-16', url: `${PDS}/cylindrical/img/ldem_16.img`, file: 'ldem_16.img', mb: 33 },
    { kind: 'svs-u16', url: `${SVS}/ldem_16_uint.tif`, file: 'ldem_16_uint.tif', mb: 30 },
  ],
  pole: [
    { kind: 'pgda-80', url: `${PGDA}/LDEM_80S_80MPP_ADJ.TIF`, file: 'LDEM_80S_80MPP_ADJ.TIF', mb: 150 },
    { kind: 'pds-80s', url: `${PDS}/polar/img/ldem_80s_80m.img`, file: 'ldem_80s_80m.img', mb: 115 },
  ],
}
const SEARCH = [RAW, join(homedir(), 'Downloads'), join(homedir(), 'OneDrive', 'Downloads')]

const log = (...a) => console.log('[kuro]', ...a)

const why = (e) => {
  const c = e?.cause
  return [e?.message, c?.code, c?.message].filter(Boolean).join(' — ')
}

async function viaFetch(url, dest, mb) {
  const res = await fetch(url, { headers: { 'User-Agent': 'KURO-data-fetch (NASA Space Apps 2026)' } })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || mb * 1e6
  let got = 0, last = 0
  const body = Readable.fromWeb(res.body)
  body.on('data', (c) => {
    got += c.length
    const pct = Math.floor((100 * got) / total)
    if (pct >= last + 10) { last = pct; process.stdout.write(`        ${pct}%\r`) }
  })
  await pipeline(body, createWriteStream(dest + '.part'))
  return got
}

/** Fallback: the curl that ships with Windows 10/11, macOS and Linux (uses the system's TLS and proxy settings). */
function viaCurl(url, dest) {
  const exe = process.platform === 'win32' ? 'curl.exe' : 'curl'
  const r = spawnSync(exe, ['-L', '--fail', '--retry', '2', '--connect-timeout', '20', '-o', dest + '.part', url], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.error) throw new Error(`${exe} not available (${r.error.message})`)
  if (r.status !== 0) throw new Error(`${exe} exited with code ${r.status}`)
  return statSync(dest + '.part').size
}

function findLocal({ file, mb }) {
  for (const dir of SEARCH) {
    for (const name of [file, file.toLowerCase(), file.toUpperCase()]) {
      const p = join(dir, name)
      if (existsSync(p) && statSync(p).size > mb * 0.9e6) return p
    }
  }
  return null
}

/** First acceptable source found on disk; otherwise try downloading each in turn. */
async function obtain(role) {
  for (const src of SOURCES[role]) {
    const p = findLocal(src)
    if (p) { log(`found   ${p}`); return { ...src, path: p } }
  }
  const errors = []
  for (const src of SOURCES[role]) {
    if (!src.url) continue
    try { return { ...src, path: await download(src) } } catch (e) { errors.push(e) }
  }
  const err = new Error(`no source available for the ${role} map`)
  err.manual = { role, errors: errors.flatMap((e) => e.manual?.errors ?? [e.message]) }
  throw err
}

const reach = new Map()
/** One quick connection test per server, so a blocked server costs seconds, not minutes. */
async function reachable(url) {
  const host = new URL(url).host
  if (!reach.has(host)) {
    reach.set(host, (async () => {
      try { await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); return true }
      catch (e) { log(`skip    ${host} is not reachable from this network (${why(e)})`); return false }
    })())
  }
  return reach.get(host)
}

async function download({ url, file, mb }) {
  const dest = join(RAW, file)
  if (!(await reachable(url))) { const e = new Error(`${new URL(url).host} not reachable`); e.manual = { url, dest, errors: [e.message] }; throw e }
  log(`fetch   ${url}  (~${mb} MB)`)
  const errors = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const got = await viaFetch(url, dest, mb)
      copyFileSync(dest + '.part', dest)
      log(`saved   ${file} (${(got / 1e6).toFixed(1)} MB)`)
      return dest
    } catch (e) {
      errors.push(why(e))
      log(`        attempt ${attempt} failed: ${why(e)}`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  try {
    log('        trying curl instead…')
    const got = viaCurl(url, dest)
    if (got < mb * 0.5e6) throw new Error(`only ${got} bytes received`)
    copyFileSync(dest + '.part', dest)
    log(`saved   ${file} (${(got / 1e6).toFixed(1)} MB) via curl`)
    return dest
  } catch (e) { errors.push(why(e)) }
  const err = new Error(`could not download ${file}`)
  err.manual = { url, dest, errors }
  throw err
}

/** Global LOLA elevation → 2880×1440 uint16, longitude −180…180, metres = value / 2 − 10000. */
async function buildGlobal(src) {
  let W, H, get
  if (src.kind === 'pds-16') {
    // PDS LDEM_16: 5760×2880 int16 LSB, height = DN × 0.5 m, longitude 0…360 east from the left edge
    const buf = readFileSync(src.path)
    W = 5760; H = 2880
    if (buf.length !== W * H * 2) throw new Error(`${src.file}: expected ${W * H * 2} bytes, found ${buf.length}`)
    const dn = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
    get = (row, col) => dn[row * W + ((col + W / 2) % W)] + 20000 // re-centre on longitude 0; DN + 20000 = (h + 10000) × 2
  } else {
    // SVS ldem_16_uint: 5760×2880 uint16 half-metres + 20000, longitude −180…180
    const img = await (await fromFile(src.path)).getImage()
    W = img.getWidth(); H = img.getHeight()
    const [d] = await img.readRasters()
    get = (row, col) => d[row * W + col]
  }
  const w = W / 2, h = H / 2, out = new Uint16Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    out[y * w + x] = Math.round((get(2 * y, 2 * x) + get(2 * y, 2 * x + 1) + get(2 * y + 1, 2 * x) + get(2 * y + 1, 2 * x + 1)) / 4)
  }
  writeFileSync(join(OUT, 'global.u16'), Buffer.from(out.buffer))
  let min = 65535, max = 0
  for (const v of out) { if (v < min) min = v; if (v > max) max = v }
  log(`global  ${w}×${h}, ${(min / 2 - 10000).toFixed(0)} … ${(max / 2 - 10000).toFixed(0)} m`)
  return {
    file: 'global.u16', type: 'uint16', width: w, height: h,
    projection: 'equirectangular, longitude −180…180 left→right, latitude 90…−90 top→bottom',
    heightMeters: 'value / 2 − 10000', referenceRadiusM: 1737400,
    minM: min / 2 - 10000, maxM: max / 2 - 10000, pixelDeg: 360 / w,
    source: src.kind === 'pds-16' ? 'NASA PDS LOLA GDR LDEM_16 (LRO-L-LOLA-4-GDR-V1.0, 1895 m/pix), 2×2 averaged' : 'NASA SVS CGI Moon Kit (ldem_16_uint, from LOLA gridded data), 2×2 averaged',
  }
}

/** South Pole LOLA DEM (polar stereographic, 80 m) → a 320 m regional overview and the native-resolution core. */
async function buildPole(src) {
  let W, H, ox, oy, rx, ry, get, keys = {}
  if (src.kind === 'pds-80s') {
    // PDS LDEM_80S_80M: 7600×7600 int16 LSB, height = DN × 0.5 m; projection offset 3799.5 px, 80 m/px, lon0 = 0
    const buf = readFileSync(src.path)
    W = H = 7600
    if (buf.length !== W * H * 2) throw new Error(`${src.file}: expected ${W * H * 2} bytes, found ${buf.length}`)
    const dn = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
    rx = 80; ry = -80; ox = -3800 * 80; oy = 3800 * 80
    get = (i) => dn[i] * 0.5
    keys = { label: 'MAP_PROJECTION_TYPE = POLAR STEREOGRAPHIC, CENTER_LATITUDE = -90, CENTER_LONGITUDE = 0, MAP_SCALE = 80 m/pix, LINE/SAMPLE_PROJECTION_OFFSET = 3799.5' }
  } else {
    const img = await (await fromFile(src.path)).getImage()
    W = img.getWidth(); H = img.getHeight()
    ;[ox, oy] = img.getOrigin(); [rx, ry] = img.getResolution()
    keys = img.getGeoKeys?.() ?? {}
    const nodata = img.getGDALNoData?.()
    const [d] = await img.readRasters()
    get = (i) => (d[i] === nodata ? NaN : d[i])
  }
  log(`pole    source ${W}×${H}, origin ${ox}, ${oy}, pixel ${rx}×${ry} m`)
  const ok = (v) => Number.isFinite(v) && Math.abs(v) < 20000

  const make = (name, x0, y0, n, step) => {
    const out = new Int16Array(n * n)
    let bad = 0
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let sum = 0, c = 0
      for (let j = 0; j < step; j++) for (let i = 0; i < step; i++) {
        const v = get((y0 + y * step + j) * W + x0 + x * step + i)
        if (ok(v)) { sum += v; c++ }
      }
      out[y * n + x] = c ? Math.round(sum / c) : -32768
      if (!c) bad++
    }
    writeFileSync(join(OUT, name), Buffer.from(out.buffer))
    log(`${name.padEnd(7)} ${n}×${n} at ${step * rx} m, ${bad} empty cells`)
    return { file: name, type: 'int16', width: n, height: n, noData: -32768, heightMeters: 'value', referenceRadiusM: 1737400, x0: ox + x0 * rx, y0: oy + y0 * ry, pixelM: step * rx }
  }
  const step = Math.max(1, Math.floor(W / 1900))
  const overview = make('pole.i16', 0, 0, Math.floor(W / step), step)
  const n2 = Math.min(2048, W)
  const core = make('pole_hi.i16', Math.floor((W - n2) / 2), Math.floor((H - n2) / 2), n2, 1)
  const common = {
    projection: 'south polar stereographic, true scale at the pole, sphere R = 1737.4 km, MOON_ME frame (DE421)',
    geoKeys: keys,
    source: src.kind === 'pds-80s' ? 'NASA PDS LOLA GDR LDEM_80S_80M (polar stereographic, 80 m/pix)' : 'NASA GSFC PGDA product 90, LDEM_80S_80MPP_ADJ (Barker et al. 2023, PSJ 4, 183)',
  }
  return { overview: { ...overview, ...common }, core: { ...core, ...common } }
}

async function main() {
  mkdirSync(RAW, { recursive: true }); mkdirSync(OUT, { recursive: true })
  const manifest = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : {}
  manifest.generated = new Date().toISOString()
  const problems = []

  try {
    const c = await obtain('color')
    const trek = c.kind === 'trek-wac'
    copyFileSync(c.path, join(OUT, trek ? 'color.jpg' : 'color.jpg'))
    manifest.color = trek
      ? { file: 'color.jpg', width: 4096, height: 2048, projection: 'equirectangular, −180…180', source: 'NASA Moon Trek, LRO WAC global mosaic (greyscale, 303 ppd source), stitched at 4096×2048' }
      : { file: 'color.jpg', width: 2048, height: 1024, projection: 'equirectangular, −180…180', source: 'NASA SVS CGI Moon Kit, LROC WAC colour (2025): 643/566/415 nm as RGB. Credit: NASA’s Scientific Visualization Studio' }
  } catch { log('imagery: no local colour map — the app loads the NASA Moon Trek LRO mosaic online instead (that is fine)') }

  try { manifest.global = await buildGlobal(await obtain('global')) } catch (e) { problems.push(e) }

  if (!LITE) {
    try {
      const p = await buildPole(await obtain('pole'))
      manifest.pole = p.overview
      manifest.poleHi = p.core
    } catch (e) { problems.push(e) }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
  log(`wrote public/moon/manifest.json (${['color', 'global', 'pole'].filter((k) => manifest[k]).join(', ') || 'nothing'})`)
  if (problems.some((e) => e.manual && e.manual.role !== 'color')) throw problems.find((e) => e.manual && e.manual.role !== 'color')
}

main().catch((e) => {
  console.error(`\n[kuro] failed: ${e.message}`)
  if (e.manual) {
    console.error(`[kuro] reasons: ${e.manual.errors.join(' | ')}`)
    console.error('\n[kuro] Download one of these in your web browser (any one per line is enough), leave it in your Downloads folder')
    console.error(`        or put it in ${RAW}, then run  npm run fetch:moon  again:`)
    for (const [role, list] of Object.entries(SOURCES)) console.error(`          ${role.padEnd(7)} ${list.filter((x) => x.url).map((x) => x.url).join('\n                  or ')}`)
  }
  process.exit(1)
})
