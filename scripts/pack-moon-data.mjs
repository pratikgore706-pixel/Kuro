#!/usr/bin/env node
/**
 * Packs the elevation grids in public/moon for fast downloads, losslessly:
 * each row is stored as differences between neighbouring heights, split into low and high byte
 * planes, then gzip-compressed. The browser reverses this (src/explorer/moonData.ts), so every
 * height is exactly the same as in the original .u16 / .i16 file; only the download is about half.
 *
 * Run after `npm run fetch:moon`:  npm run pack:moon
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const dir = join(process.cwd(), 'public', 'moon')
const manifestPath = join(dir, 'manifest.json')
const m = JSON.parse(readFileSync(manifestPath, 'utf8'))

export function pack(raw, width, height) {
  const v = new Uint16Array(new Uint8Array(raw).buffer, 0, width * height)
  const n = width * height, planes = new Uint8Array(n * 2)
  for (let y = 0; y < height; y++) {
    let prev = 0
    for (let x = 0; x < width; x++) {
      const i = y * width + x, d = (v[i] - prev) & 0xffff
      prev = v[i]
      planes[i] = d & 0xff
      planes[n + i] = d >> 8
    }
  }
  return gzipSync(planes, { level: 9 })
}

let changed = false
for (const k of ['global', 'pole', 'poleHi']) {
  const d = m[k]
  if (!d) continue
  const src = join(dir, d.file)
  if (!existsSync(src)) { console.log(`${k}: ${d.file} not found, keeping the existing pack`); continue }
  const raw = readFileSync(src)
  if (raw.length !== d.width * d.height * 2) throw new Error(`${d.file}: size does not match ${d.width}×${d.height}`)
  const file = d.file.replace(/\.(u16|i16)$/, '.pack')
  const out = pack(raw, d.width, d.height)
  writeFileSync(join(dir, file), out)
  d.packed = { file, codec: 'row-delta byte-planes gzip', bytes: out.length }
  changed = true
  console.log(`${k}: ${(raw.length / 1e6).toFixed(1)} MB -> ${(out.length / 1e6).toFixed(1)} MB (${file})`)
}
if (changed) writeFileSync(manifestPath, JSON.stringify(m, null, 1) + '\n')
