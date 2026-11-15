/** Shared between the Moon map and its raster worker (no worker code here, so the page bundle stays clean). */
export type RasterKind = 'global' | 'poleWide' | 'poleMid' | 'poleHi'
export type RasterLayer = 'relief' | 'elevation' | 'slope' | 'photo'
export interface RasterRequest { id: number; kind: RasterKind; layer: RasterLayer }
export interface RasterResult { id: number; kind: RasterKind; layer: RasterLayer; bitmap: ImageBitmap | null; min: number; max: number; error?: string }
/** Extent of each polar raster, metres from the pole (a square ±E on the south polar stereographic plane). */
export const POLE_EXTENT: Record<Exclude<RasterKind, 'global'>, number> = { poleWide: 608000, poleMid: 304000, poleHi: 81920 }
/** Ground metres per map pixel of each polar raster. */
export const POLE_PIXEL: Record<Exclude<RasterKind, 'global'>, number> = { poleWide: 1216000 / 2048, poleMid: 320, poleHi: 80 }
