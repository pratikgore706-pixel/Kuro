import { describe, expect, it } from 'vitest'
import fixture from './backend-parity.json'
import { backendOrder, PARITY_CASES, pyRound2, pySum, scoreBackend, summarizeStatuses, type Category, type Status } from './backendScore'

interface Case {
  id: string; sun: string; earth: string; stepSeconds: number; slopeDeg: number | null; roughnessM: number | null
  expected: { rank: number; overall: number | null; overallCompleteness: number; components: Record<Category, { score: number | null; completeness: number }> }
}
const cases = (fixture as { cases: Case[] }).cases

const run = (c: Case) => scoreBackend({ slopeDeg: c.slopeDeg, roughnessM: c.roughnessM, summary: summarizeStatuses(c.sun.split('') as Status[], c.earth.split('') as Status[], c.stepSeconds) })

describe('Python-compatible rounding', () => {
  it('rounds half to even at exact ties and normally otherwise', () => {
    expect(pyRound2(0.125)).toBe(0.12); expect(pyRound2(0.375)).toBe(0.38); expect(pyRound2(62.625)).toBe(62.62)
    expect(pyRound2(-0.125)).toBe(-0.12); expect(pyRound2(2.675)).toBe(2.67); expect(pyRound2(1 / 3)).toBe(0.33)
    expect(pyRound2(100)).toBe(100); expect(pyRound2(0)).toBe(0)
  })
})

describe('matches the KURO backend recommendation engine exactly', () => {
  it(`fixture has the backend's own test cases and ${cases.length} in total`, () => {
    expect(cases.length).toBe(PARITY_CASES)
    expect(cases.some((c) => c.id === 'backend-A')).toBe(true)
  })
  for (const c of cases) {
    it(c.id, () => {
      const r = run(c)
      expect(r.overall).toBe(c.expected.overall)
      expect(r.overallCompleteness).toBe(c.expected.overallCompleteness)
      for (const k of Object.keys(c.expected.components) as Category[]) {
        expect(r.components[k].score, k).toBe(c.expected.components[k].score)
        expect(r.components[k].completeness, k).toBe(c.expected.components[k].completeness)
      }
    })
  }
  it('orders candidates exactly as the backend ranks them', () => {
    const ordered = backendOrder(cases.map((c) => ({ c, result: run(c) })))
    expect(ordered.map((o) => o.c.id)).toEqual([...cases].sort((a, b) => a.expected.rank - b.expected.rank).map((c) => c.id))
  })
})

describe('Python-compatible summation', () => {
  it('matches CPython 3.12+ sum() on cases plain addition gets wrong', () => {
    expect(pySum(Array(10).fill(0.1))).toBe(1) // plain addition gives 0.9999999999999999
    expect(pySum([1e100, 1, -1e100])).toBe(1)
    expect(pySum([])).toBe(0)
  })
})
