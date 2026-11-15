import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Columns2, Moon, Mountain, Navigation, Radio, Sun, TriangleAlert, X, Zap, type LucideIcon } from 'lucide-react'
import { siteStory, type StoryLine } from '../engine/explain'
import { RANKING_LABELS, RANKING_WEIGHTS, type ComponentScores, type RankedSite } from '../services/api'
import { GuideRover } from './compare/RoverFace'
import '../styles/compare.css'

const ICON: Record<StoryLine['kind'], LucideIcon> = { sun: Sun, earth: Radio, ground: Mountain, dark: Moon, both: Zap, warn: TriangleAlert }

export function scoreTone(score: number | null): string {
  if (score === null) return 'na'
  if (score >= 70) return 'good'
  if (score >= 45) return 'mid'
  return 'low'
}

/**
 * A site's details as a big pop-up: KURO explains in plain words why it ranks where it does, with the score's
 * make-up one click away, and two ways on: drive there in the rover, or compare it with other sites.
 */
export function SiteStoryModal({ ranked, index, days, onClose, onFly, onCompare }: {
  ranked: RankedSite[]; index: number; days: number
  onClose: () => void; onFly: (id: string) => void; onCompare: (id: string) => void
}) {
  const r = ranked[index]
  const next = index === 0 ? ranked[1] : ranked[index - 1]
  const story = siteStory(r, index, ranked.length, days, next)
  const [open, setOpen] = useState(false)
  const [talking, setTalking] = useState(true)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => { setTalking(true); const t = setTimeout(() => setTalking(false), 2400); return () => clearTimeout(t) }, [r.siteId])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return createPortal(
    <div className="cmpx-modal cg kg" role="dialog" aria-modal="true" aria-labelledby="ks-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cg-box ks-box">
        <button ref={closeRef} className="cmpx-x" onClick={onClose} aria-label="Close the details"><X size={16} /></button>
        <div className="cg-talk">
          <p className="cmpx-kicker">{index === 0 ? 'The best site' : 'Site details'} <span className="mono">Rank {String(index + 1).padStart(2, '0')} of {ranked.length}</span></p>
          <div className="ks-head">
            <div>
              <h2 id="ks-title">{r.site.name}</h2>
              <p className="ks-sub mono">{r.site.group} · {r.site.id} · {Math.abs(r.site.lat).toFixed(2)}°S {Math.abs(r.site.lon).toFixed(2)}°{r.site.lon < 0 ? 'W' : 'E'}</p>
            </div>
            <span className={'ks-score ' + scoreTone(r.score)}>{r.score === null ? '—' : Math.round(r.score)}<small>/100</small></span>
          </div>
          <div className="cg-body" key={r.siteId}>
            <p className="ks-say">{story.headline}</p>
            <ul className="ks-lines">
              {story.lines.map((l, i) => {
                const I = ICON[l.kind]
                return <li key={i} className={l.kind + (l.good ? ' good' : ' bad')}><I size={15} aria-hidden="true" /><span>{l.text}</span></li>
              })}
            </ul>
            <button className="ks-more" onClick={() => setOpen(!open)} aria-expanded={open}>How the score is made <ChevronDown size={13} aria-hidden="true" /></button>
            {open && (
              <div className="ks-why">
                {(Object.keys(RANKING_WEIGHTS) as (keyof ComponentScores)[]).map((k) => {
                  const v = r.componentScores[k], c = r.componentCompleteness[k]
                  const partial = v !== null && c !== null && c < 99.5
                  return (
                    <div key={k} className="ks-bar" title={`${RANKING_LABELS[k]} counts ${Math.round(RANKING_WEIGHTS[k] * 100)}% of the score`}>
                      <span>{RANKING_LABELS[k]}{partial && <sup>*</sup>}</span>
                      <i><b style={{ width: `${v ?? 0}%` }} className={scoreTone(v)} /></i>
                      <span className="mono">{v === null ? '—' : Math.round(v)}</span>
                    </div>
                  )
                })}
                {r.blockers.length > 0 && <p className="ks-fine">Score 0 by KURO’s rule: {r.blockers.join(' and ')} during this stay. The backend formula alone gives {r.backendScore === null ? '—' : Math.round(r.backendScore)}.</p>}
                <p className="ks-fine">Scored with the KURO backend’s formula. * Uses {Math.round(r.completenessPct)}% of the backend’s inputs: no roughness or hazard map at 80 m.</p>
              </div>
            )}
          </div>
          <div className="cg-nav">
            <button className="cmpx-btn ghost" onClick={() => onCompare(r.siteId)}><Columns2 size={14} aria-hidden="true" /> Compare with other sites</button>
            <button className="cmpx-btn solid" onClick={() => onFly(r.siteId)}><Navigation size={14} aria-hidden="true" /> Drive there</button>
          </div>
        </div>
        <div className="cg-rover"><GuideRover talking={talking} /></div>
      </div>
    </div>
  , document.body)
}
