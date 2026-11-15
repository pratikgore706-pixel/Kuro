import { RAMPS, type LayerId } from './engine/glsl'
import type { ViewMode } from './engine/ExplorerEngine'

export interface LayerDef { id: LayerId; label: string; group: 'surface' | 'mission'; hint: string; ramp?: keyof typeof RAMPS; legend?: [string, string]; terrainOnly?: boolean; swatch?: string }

/** What the layer menu offers. Internally 'imagery' renders LRO imagery on the globe and map, and the real regolith in the terrain views. */
export const LAYERS: LayerDef[] = [
  { id: 'imagery', group: 'surface', label: 'Real Moon', hint: 'The Moon as it looks: LRO Wide Angle Camera mosaic from orbit, real terrain up close, lit by the true Sun.', swatch: 'linear-gradient(90deg,#3d3a35,#a8a296,#e6e1d6)' },
  { id: 'colour', group: 'surface', label: 'Colour relief', hint: 'LOLA elevation as colour, from the deepest basins (violet) to the highest peaks (gold).', ramp: 'elevation' },
  { id: 'slope', group: 'surface', label: 'Slope', hint: 'Surface slope from LOLA. Beyond about 15° is hazardous for most landers.', ramp: 'slope', legend: ['0°', '40°+'] },
  { id: 'sun', group: 'mission', label: 'Sunlit now', hint: 'How much of the Sun’s disc is visible at the chosen time. Terrain views include shadows cast by the terrain.', ramp: 'sun', legend: ['Dark', 'Full Sun'] },
  { id: 'earth', group: 'mission', label: 'Earth in view', hint: 'Where Earth is above the local horizon, so a direct radio link is possible.', ramp: 'earth', legend: ['Hidden', 'In view'] },
  { id: 'psr', group: 'mission', label: 'NASA shadowed regions', hint: 'NASA’s own map of permanently shadowed regions at the South Pole (LOLA team, 240 m), loaded live from Moon Trek. These craters never see the Sun. The ground beneath is lit evenly, and outlines are smoothed, so pits under about 1 km across are not drawn. The same outlines are drawn over “Sun over stay” so you can check KURO’s shadow tracing against NASA.', swatch: 'linear-gradient(90deg,#1b2a3a,#52c7ff,#c0f0ff)' },
  { id: 'sunStay', group: 'mission', label: 'Sun over stay', hint: 'Average share of the Sun visible across the whole stay, with terrain shadows. White outlines are NASA’s permanently shadowed regions: KURO should find no sunlight inside them.', ramp: 'stay', legend: ['0%', '100%'], terrainOnly: true },
  { id: 'earthStay', group: 'mission', label: 'Earth over stay', hint: 'Share of the stay with Earth above the terrain horizon.', ramp: 'earth', legend: ['0%', '100%'], terrainOnly: true },
]

export const isTerrainView = (m: ViewMode, mapKind: 'global' | 'pole') => m === 'pole' || m === 'drone' || m === 'rover' || m === 'surface' || (m === 'map' && mapKind === 'pole')
export const gradient = (r: keyof typeof RAMPS) => `linear-gradient(90deg, ${RAMPS[r].join(', ')})`
