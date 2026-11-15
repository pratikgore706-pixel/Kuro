/**
 * The 78 candidate landing sites in 9 South Pole regions — the KURO problem statement's candidate set, exactly as
 * the KURO backend's terrain pipeline extracted them (kuro_backend_fast/documentation/terrain_extraction_report.csv,
 * every row SUCCESS). Generated: do not edit by hand. Ids are the backend's candidate ids, so results can be matched
 * one to one with the backend.
 */
import type { Site } from './sites'

/** The 9 regions in the backend's order, with the codes it uses in candidate ids. */
export const REGIONS = [
  {
    code: 'HW',
    name: 'Haworth'
  },
  {
    code: 'PCB',
    name: 'Peak Near Cabeus B'
  },
  {
    code: 'MMA',
    name: 'Malapert Massif'
  },
  {
    code: 'MMP',
    name: 'Mons Mouton Plateau'
  },
  {
    code: 'MMO',
    name: 'Mons Mouton'
  },
  {
    code: 'NR1',
    name: 'Nobile Rim 1'
  },
  {
    code: 'NR2',
    name: 'Nobile Rim 2'
  },
  {
    code: 'dGR2',
    name: 'de Gerlache Rim 2'
  },
  {
    code: 'SP',
    name: 'Slater Plain'
  }
] as const

export type RegionName = (typeof REGIONS)[number]['name']
const REGION_BY_CODE: Record<string, RegionName> = Object.fromEntries(REGIONS.map((r) => [r.code, r.name])) as Record<string, RegionName>

const SOURCE = 'KURO candidate registry (9 regions, 78 sites), backend terrain extraction'
const c = (id: string, code: string, num: string, lat: number, lon: number): Site => ({
  id, name: `${REGION_BY_CODE[code]} ${num}`, note: `Candidate ${id} in the ${REGION_BY_CODE[code]} region`,
  group: REGION_BY_CODE[code], lat, lon, source: SOURCE, precision: 'candidate',
})

export const CANDIDATES: Site[] = [
  c('HW01', 'HW', '01', -86.7682, -20.514),
  c('HW02', 'HW', '02', -86.8076, -21.7194),
  c('HW03', 'HW', '03', -86.8596, -19.8934),
  c('HW04', 'HW', '04', -86.568, -21.4727),
  c('HW05', 'HW', '05', -86.6616, -30.5483),
  c('HW06', 'HW', '06', -87.0499, -24.2402),
  c('HW07', 'HW', '07', -86.9324, -23.0203),
  c('HW08', 'HW', '08', -86.924, -25.8094),
  c('HW09', 'HW', '09', -86.623, -26.0746),
  c('HW10', 'HW', '10', -86.5272, -14.8763),
  c('HW_K2023', 'HW', 'K2023', -86.9895, -24.2545),
  c('PCB01', 'PCB', '01', -83.7633, -69.9829),
  c('PCB02', 'PCB', '02', -83.6317, -67.6339),
  c('PCB03', 'PCB', '03', -83.563, -68.2009),
  c('PCB04', 'PCB', '04', -83.3691, -67.6646),
  c('PCB05', 'PCB', '05', -83.5388, -71.9419),
  c('MMA01', 'MMA', '01', -85.9425, -0.94365),
  c('MMA02', 'MMA', '02', -86.0153, 3.38206),
  c('MMA03', 'MMA', '03', -85.9577, -3.27827),
  c('MMA04', 'MMA', '04', -86.3098, -0.459283),
  c('MMA_K2023', 'MMA', 'K2023', -85.9919, 2.0564),
  c('MMP01', 'MMP', '01', -85.1114, 26.7102),
  c('MMP02', 'MMP', '02', -84.8055, 24.8871),
  c('MMP03', 'MMP', '03', -84.9683, 31.153),
  c('MMP04', 'MMP', '04', -84.6863, 20.8866),
  c('MMP05', 'MMP', '05', -84.4159, 28.2118),
  c('MMP06', 'MMP', '06', -84.5961, 30.4525),
  c('MMP07', 'MMP', '07', -84.6834, 37.3387),
  c('MMP08', 'MMP', '08', -84.2114, 40.81),
  c('MMP09', 'MMP', '09', -83.6844, 32.8848),
  c('MMP10', 'MMP', '10', -84.1383, 25.6422),
  c('MMP11', 'MMP', '11', -84.269, 36.6724),
  c('MMO01', 'MMO', '01', -85.416, 31.8506),
  c('MMO02', 'MMO', '02', -85.481, 29.5494),
  c('MMO03', 'MMO', '03', -85.4085, 30.4056),
  c('MMO04', 'MMO', '04', -85.4089, 28.15),
  c('MMO05', 'MMO', '05', -85.3439, 28.5944),
  c('MMO06', 'MMO', '06', -85.2614, 30.1862),
  c('MMO07', 'MMO', '07', -85.1953, 32.9287),
  c('MMO08', 'MMO', '08', -85.513, 35.7041),
  c('MMO09', 'MMO', '09', -85.4665, 33.0398),
  c('MMO10', 'MMO', '10', -85.4608, 31.4902),
  c('NR101', 'NR1', '01', -85.295, 36.9168),
  c('NR102', 'NR1', '02', -85.2606, 36.8888),
  c('NR103', 'NR1', '03', -85.5456, 37.5572),
  c('NR104', 'NR1', '04', -85.0173, 37.8745),
  c('NR105', 'NR1', '05', -85.0722, 37.555),
  c('NR106', 'NR1', '06', -85.1557, 36.986),
  c('NR107', 'NR1', '07', -85.1978, 37.1774),
  c('NR108', 'NR1', '08', -85.1027, 36.7514),
  c('NR109', 'NR1', '09', -85.0405, 37.4339),
  c('NR201', 'NR2', '01', -84.0539, 56.4813),
  c('NR202', 'NR2', '02', -84.1553, 59.8351),
  c('NR203', 'NR2', '03', -83.6871, 57.0082),
  c('NR204', 'NR2', '04', -83.7847, 57.683),
  c('NR205', 'NR2', '05', -83.6185, 59.0568),
  c('NR206', 'NR2', '06', -83.7805, 59.2824),
  c('NR207', 'NR2', '07', -83.9181, 59.3265),
  c('NR208', 'NR2', '08', -83.9064, 57.8114),
  c('NR2_K2023', 'NR2', 'K2023', -84.0737, 59.1974),
  c('dGR201', 'dGR2', '01', -88.3891, -68.8647),
  c('dGR202', 'dGR2', '02', -88.0371, -75.0441),
  c('dGR203', 'dGR2', '03', -88.1408, -71.6955),
  c('dGR204', 'dGR2', '04', -88.1377, -74.333),
  c('dGR205', 'dGR2', '05', -88.0646, -62.0736),
  c('dGR206', 'dGR2', '06', -87.9467, -62.0981),
  c('dGR2_K2023', 'dGR2', 'K2023', -88.45, -67.8591),
  c('SP01', 'SP', '01', -87.4783, 124.521),
  c('SP02', 'SP', '02', -87.3818, 126.513),
  c('SP03', 'SP', '03', -87.2825, 123.748),
  c('SP04', 'SP', '04', -87.1925, 123.034),
  c('SP05', 'SP', '05', -87.1818, 119.703),
  c('SP06', 'SP', '06', -87.073, 126.131),
  c('SP07', 'SP', '07', -87.1306, 127.857),
  c('SP08', 'SP', '08', -87.3275, 130.054),
  c('SP09', 'SP', '09', -87.1837, 133.344),
  c('SP10', 'SP', '10', -87.0319, 130.702),
  c('SP11', 'SP', '11', -86.9504, 126.675),
]
