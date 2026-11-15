import { useMemo } from 'react'
import { Radio, Sun as SunIcon } from 'lucide-react'
import { SITES } from '../data/sites'
import { rankReason } from '../engine/explain'
import { fmtHours } from '../engine/time'
import { useEarthMargin } from '../hooks'
import { RANKING_LABELS, RANKING_MAX_LAT, RANKING_WEIGHTS, rankSites, type ComponentScores } from '../services/api'
import { useStore } from '../store'

const TOP_N = 5

function scoreTone(score: number | null): string {
  if (score === null) return 'na'
  if (score >= 70) return 'good'
  if (score >= 45) return 'mid'
  return 'low'
}

/**
 * Candidate sites scored for the landing date and stay chosen in the time bar: the named South Pole sites plus
 * any custom sites the user added south of 80°S. Click a row to select the site; the selected row shows why it
 * scored what it did.
 */
export function RankingPanel() {
  const siteId = useStore((s) => s.siteId)
  const select = useStore((s) => s.selectSite)
  const landingMs = useStore((s) => s.landingMs)
  const days = useStore((s) => s.days)
  const moon = useStore((s) => s.moon)
  const custom = useStore((s) => s.custom)
  const margin = useEarthMargin()

  const candidates = useMemo(() => [...SITES.filter((s) => s.group === 'South Pole'), ...custom.filter((s) => s.lat <= RANKING_MAX_LAT)], [custom])
  // Recomputed only when the date, stay, candidates, antenna margin or loaded terrain change — not on every
  // re-render (e.g. while the cursor plays through the stay). `moon` is listed because rankSites reads the
  // loaded terrain through getMoonData().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rankSites(candidates, landingMs, days, margin), [candidates, landingMs, days, margin, moon])
  const terrainReady = !!moon?.pole

  return (
    <section className="xp-rank" aria-label="Landing-site ranking for this stay">
      <header>
        <h2>Best sites for this landing</h2>
        <span className="xp-rank-days">{days} days</span>
      </header>
      <p className="xp-rank-note">
        {terrainReady ? 'South Pole sites scored out of 100 with the KURO backend’s formula, for the date above. Click one to see why.' : 'Scored on sunlight and Earth only. Install LOLA elevation for slope and safety.'}
      </p>
      <ol className="xp-rank-list">
        {ranked.map((r, i) => {
          const on = r.siteId === siteId
          const top = i < TOP_N && r.score !== null
          return (
            <li key={r.siteId}>
              <button className={'xp-rank-row' + (on ? ' on' : '') + (top ? ' top' : '')} onClick={() => select(r.siteId)} aria-pressed={on} aria-expanded={on} title={rankReason(r, r.summary, r.slopeDeg, days)}>
                <span className={'xp-rank-n' + (top ? ' top' : '')}>{i + 1}</span>
                <span className="xp-rank-body">
                  <span className="nm">{r.site.name}</span>
                  <span className="xp-rank-stats mono">
                    <span className="stat" title="Sunlight available (share of the Sun's disc in view)"><SunIcon size={11} aria-hidden="true" />{r.summary.sunPct.toFixed(0)}%</span>
                    <span className="stat" title={`Earth in view${margin ? ` (at least ${margin}° above the hills)` : ''}`}><Radio size={11} aria-hidden="true" />{r.summary.earthPct.toFixed(0)}%</span>
                    {r.blockers.length > 0 && <span className="stat blocker">{r.blockers.join(', ')}</span>}
                  </span>
                </span>
                <span className={'xp-rank-score ' + scoreTone(r.score) + (r.blockers.length ? ' blocked' : '')} title="Overall score out of 100">{r.score === null ? '—' : Math.round(r.score)}</span>
              </button>
              {on && (
                <div className="xp-rank-why">
                  <p className="why-say">{rankReason(r, r.summary, r.slopeDeg, days)}</p>
                  {(Object.keys(RANKING_WEIGHTS) as (keyof ComponentScores)[]).map((k) => {
                    const v = r.componentScores[k], c = r.componentCompleteness[k]
                    const partial = v !== null && c !== null && c < 99.5
                    return (
                      <div key={k} className="why-row" title={`${RANKING_LABELS[k]} counts ${Math.round(RANKING_WEIGHTS[k] * 100)}% of the score${partial ? `; ${Math.round(c!)}% of its inputs are available, so it counts for less` : ''}`}>
                        <span>{RANKING_LABELS[k]}{partial && <sup aria-label={`${Math.round(c!)}% of inputs available`}>*</sup>}</span>
                        <i><b style={{ width: `${v ?? 0}%` }} className={scoreTone(v)} /></i>
                        <span>{v === null ? '—' : Math.round(v)}</span>
                      </div>
                    )
                  })}
                  {r.blockers.length > 0 && <p className="blocker">Score 0 by KURO’s rule: {r.blockers.join(' and ')} during this stay. The backend formula alone gives {r.backendScore === null ? '—' : Math.round(r.backendScore)}.</p>}
                  <p className="why-fine">
                    Slope {r.slopeDeg === null ? 'unknown' : `${r.slopeDeg.toFixed(1)}°`}, longest dark {fmtHours(r.summary.longestDarkH)}, longest radio gap {fmtHours(r.summary.longestOutageH)}.
                    {' '}* Uses {Math.round(r.completenessPct)}% of the backend’s inputs: no roughness or hazard map at 80 m.
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
