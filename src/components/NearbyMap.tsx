import { useEffect, useRef, useState } from 'react'
import { Grid3x3, Square } from 'lucide-react'
import { fmtDist, fmtOffset, type Site } from '../data/sites'
import { computeSeries, makeFrame, summarize } from '../engine/sky'
import { HOUR } from '../engine/time'
import { getMoonData, offsetLatLon } from '../explorer/moonData'
import { horizonFor, useEarthMargin } from '../hooks'
import { useStore } from '../store'

/** Cells per side (odd, so the site itself sits in the middle). */
const N = 9
const HALF = (N - 1) / 2
const SPACINGS: [number, string][] = [[250, '250 m'], [500, '500 m'], [1000, '1 km']]

interface Cell { e: number; n: number; lat: number; lon: number; sun: number; earth: number }
interface Result { key: string; cells: Cell[] }
type Metric = 'sun' | 'earth'


const BASE = [20, 23, 27], SUN = [220, 179, 107], EARTH = [143, 178, 217]
function cellColour(v: number, metric: Metric): string {
  const t = Math.max(0, Math.min(1, v / 100)), c = metric === 'sun' ? SUN : EARTH
  return `rgb(${BASE.map((b, i) => Math.round(b + (c[i] - b) * t)).join(',')})`
}

/**
 * "What if we land a little to the side?" — the same stay, recomputed for a 9 × 9 grid of points around the
 * site, each with its own LOLA terrain horizon. At the pole a few hundred metres can turn a dark spot into a
 * lit one, and this shows it directly. Computed on request, one point at a time, so the page stays responsive.
 */
export function NearbyMap({ site }: { site: Site }) {
  const landingMs = useStore((s) => s.landingMs)
  const days = useStore((s) => s.days)
  const moon = useStore((s) => s.moon)
  const margin = useEarthMargin()
  const [spacing, setSpacing] = useState(500)
  const [metric, setMetric] = useState<Metric>('sun')
  const [result, setResult] = useState<Result | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const run = useRef(0)

  const terrain = !!moon?.ok
  const key = `${site.lat.toFixed(5)},${site.lon.toFixed(5)}|${landingMs}|${days}|${spacing}|${margin}|${terrain ? 1 : 0}`

  // a different site, stay, spacing or antenna margin makes the old map wrong: drop it and stop any run
  useEffect(() => {
    run.current++
    setProgress(null)
    setResult((r) => (r && r.key === key ? r : null))
  }, [key])
  useEffect(() => () => { run.current++ }, [])

  const start = async () => {
    const id = ++run.current
    const data = getMoonData()
    const per = 2, stepMs = HOUR / per, n = Math.max(24, Math.round(days * 24 * per))
    const cells: Cell[] = []
    setResult(null)
    setProgress(0)
    for (let j = HALF; j >= -HALF; j--) {
      for (let i = -HALF; i <= HALF; i++) {
        const e = i * spacing, nn = j * spacing
        const [lat, lon] = offsetLatLon(site.lat, site.lon, e, nn)
        const m = summarize(computeSeries(makeFrame(lat, lon), horizonFor({ lat, lon }, data), landingMs, stepMs, n, margin))
        cells.push({ e, n: nn, lat, lon, sun: m.sunPct, earth: m.earthPct })
        // yield to the browser between points; give up quietly if the inputs changed meanwhile
        await new Promise((r) => setTimeout(r, 0))
        if (run.current !== id) return
        setProgress(cells.length)
      }
    }
    setResult({ key, cells })
    setProgress(null)
  }

  const cells = result?.cells ?? null
  const centre = cells ? cells[(N * N - 1) / 2] : null
  const vals = cells ? cells.map((c) => c[metric]) : []
  const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 0
  // the best square, rounded the way it is shown; among equals the one closest to the site
  const best = cells ? cells.reduce((b, c) => {
    const vc = Math.round(c[metric]), vb = Math.round(b[metric])
    return vc > vb || (vc === vb && Math.hypot(c.e, c.n) < Math.hypot(b.e, b.n)) ? c : b
  }, cells[0]) : null
  const noun = metric === 'sun' ? 'sunlight' : 'Earth in view'
  const reach = fmtDist(HALF * spacing)

  return (
    <section className="block nearby" aria-label="Sunlight and Earth view around the site">
      <h3 className="eyebrow">If you land a little to the side</h3>
      <p className="dim small">The same stay, recomputed on a {N} × {N} grid around {site.name}, each point with its own terrain horizon. North is up.</p>
      <div className="nb-ctl">
        <div className="seg" role="radiogroup" aria-label="Map shows">
          <button role="radio" aria-checked={metric === 'sun'} className={metric === 'sun' ? 'on' : ''} onClick={() => setMetric('sun')}>Sunlight</button>
          <button role="radio" aria-checked={metric === 'earth'} className={metric === 'earth' ? 'on' : ''} onClick={() => setMetric('earth')}>Earth</button>
        </div>
        <label className="nb-sp"><span>Square</span>
          <select value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} aria-label="Size of each square">
            {SPACINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {progress === null
          ? <button className="btn" onClick={start} disabled={!terrain} title={terrain ? undefined : 'Needs LOLA elevation (npm run fetch:moon)'}><Grid3x3 size={14} aria-hidden="true" /> {cells ? 'Map again' : 'Map nearby'}</button>
          : <button className="btn" onClick={() => { run.current++; setProgress(null) }}><Square size={12} aria-hidden="true" /> Stop</button>}
      </div>
      {!terrain && <p className="dim small">Needs NASA LOLA elevation: without terrain every nearby point would look the same.</p>}
      {progress !== null && (
        <div className="nb-prog" role="progressbar" aria-valuemin={0} aria-valuemax={N * N} aria-valuenow={progress} aria-label="Computing nearby points">
          <i style={{ width: `${(100 * progress) / (N * N)}%` }} /><span className="mono">{progress} of {N * N} points</span>
        </div>
      )}
      {cells && centre && best && (
        <>
          <div className="nb-wrap">
            <span className="nb-n mono" aria-hidden="true">N</span>
            <div className="nb-grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
              {cells.map((c) => {
                const here = c === centre
                const label = `${fmtOffset(c.e, c.n)}: ${noun} ${c[metric].toFixed(0)}%${here ? ' (the candidate site)' : ''}`
                return (
                  <span key={`${c.e},${c.n}`} role="img" className={'nb-cell' + (here ? ' here' : '') + (c === best && !here ? ' best' : '')} style={{ background: cellColour(c[metric], metric) }}
                    title={label} aria-label={label} />
                )
              })}
            </div>
          </div>
          <div className="nb-scale mono dim"><span>{reach} W</span><span>each square {fmtDist(spacing)}</span><span>{reach} E</span></div>
          <p className="nb-say">
            Within {reach}, {noun} ranges from <b>{lo.toFixed(0)}%</b> to <b>{hi.toFixed(0)}%</b> (here: {centre[metric].toFixed(0)}%).
            {Math.round(best[metric]) > Math.round(centre[metric]) ? <> Best spot nearby: <b>{fmtOffset(best.e, best.n)}</b> ({best[metric].toFixed(0)}%) — a few hundred metres can matter this much at the pole.</> : hi - lo < 2 ? ' This spot is about as good as its surroundings.' : ' This spot is already the best on the grid.'}
          </p>
        </>
      )}
    </section>
  )
}
