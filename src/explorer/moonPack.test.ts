import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unpackGrid } from './moonData'

// The packed elevation files must give back exactly the original heights (only checked where both are present).
const dir = join(process.cwd(), 'public', 'moon')
const manifest = existsSync(join(dir, 'manifest.json')) ? JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) : {}
const grids = (['global', 'pole', 'poleHi'] as const).filter((k) => manifest[k]?.packed && existsSync(join(dir, manifest[k].file)) && existsSync(join(dir, manifest[k].packed.file)))

describe('packed Moon elevation', () => {
  it.skipIf(grids.length === 0)('unpacks to the original grids, value for value', async () => {
    for (const k of grids) {
      const d = manifest[k]
      const packed = readFileSync(join(dir, d.packed.file))
      const raw = readFileSync(join(dir, d.file))
      const out = await unpackGrid(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.length), d.width, d.height)
      expect(out).not.toBeNull()
      expect(Buffer.from(out!).equals(raw)).toBe(true)
    }
  }, 60000)
})
