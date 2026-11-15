import { useState } from 'react'
import { Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SITES } from '../data/sites'
import { fmtUtc } from '../engine/time'
import { useStore } from '../store'
import { SiteStoryModal, scoreTone } from './SiteStoryModal'
import { useRanked } from './useRanked'

const TOP = 10

/**
 * The 78 candidate sites ranked for the landing date and stay chosen above: rank, name and score only.
 * Clicking a row selects the site; its Details button opens KURO's plain-language explanation.
 */
export function RankingPanel({ onFly }: { onFly: (id: string) => void }) {
  const siteId = useStore((s) => s.siteId)
  const select = useStore((s) => s.selectSite)
  const landingMs = useStore((s) => s.landingMs)
  const days = useStore((s) => s.days)
  const ready = useStore((s) => s.horizonsReady)
  const ranked = useRanked()
  const navigate = useNavigate()
  const [all, setAll] = useState(false)
  const [details, setDetails] = useState<string | null>(null)

  if (!ranked) {
    return (
      <section className="xp-rank" aria-label="Landing-site ranking" aria-busy="true">
        <header><h2>Best landing sites</h2><span className="xp-rank-days">{days} days</span></header>
        <div className="xp-rank-wait"><i style={{ width: `${(100 * Math.min(ready, SITES.length)) / SITES.length}%` }} /><span>Reading the hills around the landing sites: {Math.min(ready, SITES.length)} of {SITES.length}</span></div>
      </section>
    )
  }
  const di = details ? ranked.findIndex((r) => r.siteId === details) : -1
  const rows = all ? ranked : ranked.slice(0, TOP)
  const selIdx = ranked.findIndex((r) => r.siteId === siteId)
  return (
    <section className="xp-rank" aria-label="Landing-site ranking for this stay">
      <header>
        <h2>Best landing sites</h2>
        <span className="xp-rank-days">{days} days</span>
      </header>
      <p className="xp-rank-note">All {ranked.length} sites, scored for a landing on {fmtUtc(landingMs)} UTC.</p>
      <ol className="xp-rank-list xp-ranks">
        {rows.map((x, i) => {
          const on = x.siteId === siteId
          return (
            <li key={x.siteId} className={'xp-rk' + (on ? ' on' : '')}>
              <button className="xp-rk-pick" onClick={() => select(x.siteId)} aria-pressed={on} aria-label={`Rank ${i + 1}: ${x.site.name}, score ${x.score === null ? 'none' : Math.round(x.score)}. Select`}>
                <span className={'xp-rk-n mono' + (i === 0 ? ' top' : '')}>{String(i + 1).padStart(2, '0')}</span>
                <span className="xp-rk-nm">{x.site.name}</span>
                <span className={'xp-rk-sc mono ' + scoreTone(x.score)}>{x.score === null ? '—' : Math.round(x.score)}</span>
              </button>
              <button className="xp-rk-info" onClick={() => setDetails(x.siteId)} aria-label={`Details for ${x.site.name}`} title="Details">
                <Info size={15} aria-hidden="true" /><span>Details</span>
              </button>
            </li>
          )
        })}
      </ol>
      {!all && selIdx >= TOP && <p className="xp-rank-note">Selected: {ranked[selIdx].site.name}, rank {selIdx + 1}.</p>}
      <button className="xp-story-all" onClick={() => setAll(!all)} aria-expanded={all}>{all ? `Show only the top ${TOP}` : `Show all ${ranked.length} sites`}</button>
      {di >= 0 && (
        <SiteStoryModal ranked={ranked} index={di} days={days} onClose={() => setDetails(null)}
          onFly={(id) => { setDetails(null); onFly(id) }}
          onCompare={(id) => navigate(`/compare?site=${encodeURIComponent(id)}`)} />
      )}
    </section>
  )
}
