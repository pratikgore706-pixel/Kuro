import { CANDIDATES, REGIONS } from './candidates'

/** A candidate site's region (one of the 9), or a reference-list group. */
export type SiteGroup = string

export interface Site {
  id: string
  name: string
  /** Short context shown under the name. */
  note: string
  group: SiteGroup
  /** Planetocentric latitude, °N positive. */
  lat: number
  /** East longitude, −180…180. */
  lon: number
  /** Landing / event date (UTC ms) where one exists — lets the user jump to "as it happened". */
  eventMs?: number
  /** Where the coordinates come from. */
  source: string
  /** 'candidate': one of the 78 candidate sites. 'surveyed': published lander position. 'feature': centre of a named feature. */
  precision: 'candidate' | 'surveyed' | 'feature' | 'user'
}

const NSSDC = 'NASA NSSDCA lunar impact & landing site table'
const IAU = 'IAU Gazetteer of Planetary Nomenclature (feature centre, rounded)'
const U = Date.UTC

/**
 * Reference places, not offered as landing choices: past landers and named features. Used only where KURO checks
 * itself against NASA/JPL Horizons (Methods page) and by the landing-page story (IM-2 Athena's real landing).
 * Every coordinate is a published value.
 */
export const REFERENCE_SITES: Site[] = [
  { id: 'im2', name: 'IM-2 Athena', note: 'Mons Mouton · landed on its side, 6 Mar 2025', group: 'South Pole', lat: -84.7906, lon: 29.1957, eventMs: U(2025, 2, 6, 17, 28), source: NSSDC, precision: 'surveyed' },
  { id: 'mouton', name: 'Mons Mouton', note: 'Artemis III candidate region', group: 'South Pole', lat: -84.6, lon: 31.0, source: IAU, precision: 'feature' },
  { id: 'malapert', name: 'Malapert', note: 'Near Artemis III “Malapert Massif” region', group: 'South Pole', lat: -84.9, lon: 12.9, source: IAU, precision: 'feature' },
  { id: 'nobile', name: 'Nobile', note: 'Near Artemis III “Nobile Rim” regions', group: 'South Pole', lat: -85.2, lon: 53.5, source: IAU, precision: 'feature' },
  { id: 'haworth', name: 'Haworth', note: 'Artemis III candidate region', group: 'South Pole', lat: -87.45, lon: -5.17, source: IAU, precision: 'feature' },
  { id: 'gerlache', name: 'de Gerlache', note: 'Near Artemis III “de Gerlache Rim 2” region', group: 'South Pole', lat: -88.5, lon: -87.1, source: IAU, precision: 'feature' },
  { id: 'shackleton', name: 'Shackleton', note: 'Crater at the pole · rim is a classic high-illumination target', group: 'South Pole', lat: -89.67, lon: 129.78, source: IAU, precision: 'feature' },
  { id: 'pole', name: 'South Pole', note: 'Geometric pole of the reference sphere', group: 'South Pole', lat: -90, lon: 0, source: 'Definition', precision: 'surveyed' },

  { id: 'im1', name: 'IM-1 Odysseus', note: 'Malapert A · first commercial landing, 22 Feb 2024', group: 'Commercial & CLPS', lat: -80.13, lon: 1.44, eventMs: U(2024, 1, 22, 23, 23), source: NSSDC, precision: 'surveyed' },
  { id: 'bg1', name: 'Blue Ghost M1', note: 'Mare Crisium · 2 Mar 2025', group: 'Commercial & CLPS', lat: 18.562, lon: 61.81, eventMs: U(2025, 2, 2, 8, 34), source: NSSDC, precision: 'surveyed' },

  { id: 'cy3', name: 'Chandrayaan-3', note: 'ISRO · Shiv Shakti point, 23 Aug 2023', group: 'International', lat: -69.3741, lon: 32.32, eventMs: U(2023, 7, 23, 12, 33), source: NSSDC, precision: 'surveyed' },
  { id: 'slim', name: 'SLIM', note: 'JAXA · near Shioli crater, 19 Jan 2024', group: 'International', lat: -13.316, lon: 25.251, eventMs: U(2024, 0, 19, 15, 20), source: NSSDC, precision: 'surveyed' },
  { id: 'ce6', name: "Chang'e 6", note: 'CNSA · far side, Apollo basin, 1 Jun 2024', group: 'International', lat: -41.6385, lon: -153.9852, eventMs: U(2024, 5, 1, 22, 23), source: NSSDC, precision: 'surveyed' },
  { id: 'ce4', name: "Chang'e 4", note: 'CNSA · far side, Von Kármán, 3 Jan 2019', group: 'International', lat: -45.4561, lon: 177.5885, eventMs: U(2019, 0, 3, 2, 26), source: NSSDC, precision: 'surveyed' },
  { id: 'ce3', name: "Chang'e 3", note: 'CNSA · Mare Imbrium · 14 Dec 2013', group: 'International', lat: 44.1214, lon: -19.5117, eventMs: U(2013, 11, 14, 13, 11), source: NSSDC, precision: 'surveyed' },

  { id: 'a11', name: 'Apollo 11', note: 'Mare Tranquillitatis · 20 Jul 1969', group: 'Apollo', lat: 0.67416, lon: 23.47314, eventMs: U(1969, 6, 20, 20, 17, 40), source: 'LROC (Wagner et al. 2017)', precision: 'surveyed' },
  { id: 'a15', name: 'Apollo 15', note: 'Hadley–Apennine · 30 Jul 1971', group: 'Apollo', lat: 26.13239, lon: 3.6333, eventMs: U(1971, 6, 30, 22, 16), source: 'LROC (Wagner et al. 2017)', precision: 'surveyed' },
  { id: 'a17', name: 'Apollo 17', note: 'Taurus–Littrow · 11 Dec 1972', group: 'Apollo', lat: 20.1911, lon: 30.7723, eventMs: U(1972, 11, 11, 19, 54), source: 'LROC (Wagner et al. 2017)', precision: 'surveyed' },
]

/** IM-2 Athena's real landing (6 Mar 2025, Mons Mouton) — the landing page's story is built on it. */
export const ATHENA: Site = REFERENCE_SITES.find((x) => x.id === 'im2')!

/** The landing choices: the 78 candidate sites of the problem statement, in 9 regions. */
export const SITES: Site[] = CANDIDATES
export const GROUPS: SiteGroup[] = REGIONS.map((r) => r.name)

/** "500 m", "2.0 km" (sign ignored). */
export const fmtDist = (m: number) => (Math.abs(m) < 1000 ? `${Math.abs(m)} m` : `${(Math.abs(m) / 1000).toFixed(1)} km`)
/** "1.0 km N, 500 m E" — where a point is relative to a site, from metres east and north. */
export function fmtOffset(e: number, n: number): string {
  const parts: string[] = []
  if (n) parts.push(`${fmtDist(n)} ${n > 0 ? 'N' : 'S'}`)
  if (e) parts.push(`${fmtDist(e)} ${e > 0 ? 'E' : 'W'}`)
  return parts.length ? parts.join(', ') : 'the site itself'
}
export function fmtLat(lat: number, digits = 3) { return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'}` }
export function fmtLon(lon: number, digits = 3) { return `${Math.abs(lon).toFixed(digits)}°${lon < 0 ? 'W' : 'E'}` }

/** Deep link that opens the location in LROC QuickMap (ASU) with a labelled marker. */
/**
 * LROC QuickMap (Arizona State University, now hosted by Intuitive Machines), centred on the site with a marker.
 * Polar sites open in QuickMap's South Pole orthographic view (proj 17; x = ρ sin λ, y = ρ cos λ, metres), others in
 * its equidistant cylindrical view (proj 16; x = R·λ, y = R·φ). Both conventions were checked by opening the links.
 */
export function quickMapUrl(s: Site, halfKm = 40): string {
  const R = 1737400, D = Math.PI / 180, h = halfKm * 1000
  const label = encodeURIComponent(JSON.stringify({ label: s.name }))
  let proj = 16, x = R * s.lon * D, y = R * s.lat * D
  if (s.lat < -60) { const rho = R * Math.cos(s.lat * D); proj = 17; x = rho * Math.sin(s.lon * D); y = rho * Math.cos(s.lon * D) }
  const ext = [x - h, y - h, x + h, y + h].map((v) => v.toFixed(0)).join(',')
  return `https://quickmap.lroc.im-ldi.com/?proj=${proj}&prjExtent=${ext}&features=${s.lon.toFixed(5)}%2C${s.lat.toFixed(5)}%40%40${label}`
}

/** NASA Moon Trek (JPL), centred on the site. */
export function moonTrekUrl(s: Site): string {
  const w = 0.3 / Math.max(Math.cos((s.lat * Math.PI) / 180), 0.05), hgt = 0.3
  const e = [s.lon - w, s.lat - hgt, s.lon + w, s.lat + hgt].map((v) => v.toFixed(5)).join('%2C')
  return `https://trek.nasa.gov/moon/index.html#v=0.1&x=${s.lon.toFixed(5)}&y=${s.lat.toFixed(5)}&z=10&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&d=&locale=&b=moon&e=${e}&sfz=&w=`
}

/**
 * NASA/JPL Horizons API: the Sun's or Earth's apparent azimuth and elevation seen from the site (airless), hour by
 * hour across a stay. Opens Horizons' own plain-text table so anyone can compare it with KURO's numbers.
 */
export function horizonsUrl(s: Site, body: 'sun' | 'earth', startMs: number, days: number): string {
  const t = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
  const q = new URLSearchParams({
    format: 'text', COMMAND: body === 'sun' ? "'10'" : "'399'", OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${s.lon},${s.lat},0'`,
    START_TIME: `'${t(startMs)}'`, STOP_TIME: `'${t(startMs + days * 86400000)}'`, STEP_SIZE: `'${days > 20 ? 4 : 2} h'`,
    QUANTITIES: "'4'", ANG_FORMAT: "'DEG'", CSV_FORMAT: "'NO'",
  })
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${q.toString()}`
}

/** The candidate site closest to a point (great-circle distance on the sphere). */
export function nearestSite(lat: number, lon: number): Site {
  const D = Math.PI / 180
  let best = SITES[0], bd = Infinity
  for (const s of SITES) {
    const d = Math.acos(Math.min(1, Math.sin(lat * D) * Math.sin(s.lat * D) + Math.cos(lat * D) * Math.cos(s.lat * D) * Math.cos((lon - s.lon) * D)))
    if (d < bd) { bd = d; best = s }
  }
  return best
}
