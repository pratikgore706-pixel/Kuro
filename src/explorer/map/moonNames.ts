/**
 * IAU-approved lunar feature names (USGS Gazetteer of Planetary Nomenclature, ~9,000 entries), loaded on demand
 * from public/names/moon-names.json. Coordinates: planetocentric latitude, east longitude −180…180.
 */
export interface MoonFeature {
  id: number
  name: string
  /** Gazetteer descriptor code, e.g. AA crater, ME mare, MO mons. */
  type: string
  lat: number
  lon: number
  /** Diameter or length, km. */
  km: number
  origin: string
}

export type Category = 'seas' | 'craters' | 'small' | 'mountains' | 'valleys' | 'landing'

/** Descriptor code → plain name (Latin term in brackets) and the map category it belongs to. */
export const TYPES: Record<string, { label: string; cat: Category }> = {
  ME: { label: 'Sea (mare)', cat: 'seas' }, OC: { label: 'Ocean (oceanus)', cat: 'seas' }, LC: { label: 'Lake (lacus)', cat: 'seas' },
  SI: { label: 'Bay (sinus)', cat: 'seas' }, PA: { label: 'Marsh (palus)', cat: 'seas' }, PL: { label: 'Plain (planitia)', cat: 'seas' },
  AL: { label: 'Albedo feature', cat: 'seas' },
  AA: { label: 'Crater', cat: 'craters' }, SF: { label: 'Satellite crater (lettered)', cat: 'small' },
  MO: { label: 'Mountain (mons / montes)', cat: 'mountains' }, PR: { label: 'Cape (promontorium)', cat: 'mountains' },
  DO: { label: 'Wrinkle ridge (dorsum)', cat: 'mountains' }, RU: { label: 'Scarp (rupes)', cat: 'mountains' },
  VA: { label: 'Valley (vallis)', cat: 'valleys' }, RI: { label: 'Rille (rima)', cat: 'valleys' }, CA: { label: 'Crater chain (catena)', cat: 'valleys' },
  ST: { label: 'Landing site (statio)', cat: 'landing' }, LF: { label: 'Landing-site feature', cat: 'landing' },
}
export const typeOf = (code: string) => TYPES[code] ?? { label: code, cat: 'craters' as Category }

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'seas', label: 'Seas & plains' },
  { id: 'craters', label: 'Craters' },
  { id: 'small', label: 'Small craters' },
  { id: 'mountains', label: 'Mountains & ridges' },
  { id: 'valleys', label: 'Valleys & rilles' },
  { id: 'landing', label: 'Landing sites' },
]

let cache: Promise<{ features: MoonFeature[]; source: string }> | null = null
export function loadMoonNames(base = import.meta.env.BASE_URL) {
  if (!cache) {
    cache = fetch(`${base}names/moon-names.json`).then((r) => {
      if (!r.ok) throw new Error(`moon-names.json: ${r.status}`)
      return r.json()
    }).then((j: { meta: { source: string }; features: [number, string, string, number, number, number, string][] }) => ({
      source: j.meta.source,
      features: j.features.map(([id, name, type, lat, lon, km, origin]) => ({ id, name, type, lat, lon, km, origin })),
    }))
    cache.catch(() => { cache = null })
  }
  return cache
}

/** Search: names that start with the query first, then names that contain it; bigger features first. */
export function searchNames(list: MoonFeature[], q: string, n = 8): MoonFeature[] {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return []
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const ns = norm(s)
  const starts: MoonFeature[] = [], has: MoonFeature[] = []
  for (const f of list) {
    const t = norm(f.name)
    if (t.startsWith(ns) || t.split(' ').some((w) => w.startsWith(ns))) starts.push(f)
    else if (t.includes(ns)) has.push(f)
  }
  return [...starts, ...has].sort((a, b) => (Number(norm(b.name).startsWith(ns)) - Number(norm(a.name).startsWith(ns))) || b.km - a.km).slice(0, n)
}

export const gazetteerUrl = (id: number) => `https://planetarynames.wr.usgs.gov/Feature/${id}`
