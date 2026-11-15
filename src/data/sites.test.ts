import { describe, expect, it } from 'vitest'
import { ATHENA, GROUPS, nearestSite, REFERENCE_SITES, SITES } from './sites'

describe('landing sites: exactly the 78 candidates of the problem statement', () => {
  it('78 sites in 9 regions, with the backend’s ids and the expected count per region', () => {
    expect(SITES).toHaveLength(78)
    expect(GROUPS).toHaveLength(9)
    expect(new Set(SITES.map((s) => s.id)).size).toBe(78)
    const per = Object.fromEntries(GROUPS.map((g) => [g, SITES.filter((s) => s.group === g).length]))
    expect(per).toEqual({ Haworth: 11, 'Peak Near Cabeus B': 5, 'Malapert Massif': 5, 'Mons Mouton Plateau': 11, 'Mons Mouton': 10, 'Nobile Rim 1': 9, 'Nobile Rim 2': 9, 'de Gerlache Rim 2': 7, 'Slater Plain': 11 })
  })
  it('every site is a South Pole candidate inside the polar terrain data, none user-made', () => {
    for (const s of SITES) {
      expect(s.lat).toBeLessThan(-83); expect(s.lat).toBeGreaterThan(-89)
      expect(s.lon).toBeGreaterThanOrEqual(-180); expect(s.lon).toBeLessThanOrEqual(180)
      expect(s.precision).toBe('candidate')
    }
    expect(SITES.find((s) => s.id === 'MMA01')).toMatchObject({ lat: -85.9425, lon: -0.94365, group: 'Malapert Massif', name: 'Malapert Massif 01' })
    expect(SITES.find((s) => s.id === 'HW_K2023')?.name).toBe('Haworth K2023')
  })
  it('the old catalogue is kept only as reference, and the landing story still finds IM-2 Athena', () => {
    expect(SITES.some((s) => REFERENCE_SITES.some((r) => r.id === s.id))).toBe(false)
    expect(ATHENA.name).toBe('IM-2 Athena'); expect(ATHENA.eventMs).toBeDefined()
  })
  it('double-click picks the nearest candidate', () => {
    for (const s of SITES.slice(0, 20)) expect(nearestSite(s.lat + 0.001, s.lon).id).toBe(s.id)
  })
})
