import { expect, it } from 'vitest'
import { parseLatLon } from './Controls'
it('parses coordinates typed several ways', () => {
  expect(parseLatLon('-85.3, 30.1')).toEqual([-85.3, 30.1])
  expect(parseLatLon('85.3S 30.1E')).toEqual([-85.3, 30.1])
  expect(parseLatLon('85.3 S, 12 W')).toEqual([-85.3, -12])
  expect(parseLatLon('-84.79 330')).toEqual([-84.79, -30])
  expect(parseLatLon('Shackleton')).toBeNull()
  expect(parseLatLon('95, 10')).toBeNull()
})
