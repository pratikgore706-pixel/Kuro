import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { fmtDayShort } from '../../engine/time'
import type { RankedSite } from '../../services/api'
import { GuideRover } from './RoverFace'
import { guideLine } from './compareText'

/**
 * The rover guide that greets every visit to Compare: what the page is, how to use it, and today's ranking.
 * The rover is a fictional guide character; every ranking line comes from the computed scores.
 */
export function CompareGuide({ shown, total, landingMs, days, onClose }: { shown: RankedSite[]; total: number; landingMs: number; days: number; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [talking, setTalking] = useState(true)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => { setTalking(true); const t = setTimeout(() => setTalking(false), 2200); return () => clearTimeout(t) }, [step])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const ranked = [...shown].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const steps = [
    {
      kicker: 'Hello', title: 'Hi, I’m KURO.',
      body: <>
        <p>This page puts the <b>{shown.length} best landing spots</b> our model found side by side — out of the {total} South Pole sites it scored for a landing on <b>{fmtDayShort(landingMs)}</b> and a {days}-day stay.</p>
        <p>Each window is a live 3D view. I’m parked on every site, so you can see for yourself where the Sun is, where Earth is, and how the hills get in the way.</p>
      </>,
    },
    {
      kicker: 'How to use it', title: 'Four windows, one clock.',
      body: <ul className="cg-how">
        <li><b>Look around</b> — drag inside a window to turn the camera, scroll to zoom.</li>
        <li><b>Drive me</b> — point at a window and use W A S D. Only that rover moves.</li>
        <li><b>Move time</b> — the timeline at the top moves all four windows together. Press play and watch the Sun circle the sky.</li>
        <li><b>Swap</b> — the site name at the top of a window is a menu. Pick any other ranked site.</li>
        <li><b>Details</b> — opens the full explanation, in plain words and charts, of why a site wins or loses.</li>
      </ul>,
    },
    {
      kicker: 'Today’s ranking', title: ranked[0] ? `${ranked[0].site.name} is the pick.` : 'The ranking',
      body: <>
        <ol className="cg-rank">
          {ranked.map((r, i) => (
            <li key={r.siteId}>
              <span className="cg-n">{i + 1}</span>
              <span className="cg-nm">{r.site.name}</span>
              <span className="cg-sc mono">{r.score === null ? '—' : Math.round(r.score)}<small>/100</small></span>
              <span className="cg-why">{guideLine(r, shown)}</span>
            </li>
          ))}
        </ol>
        <p className="cg-note">Scores rank the sites for this date and stay. They narrow the search — they do not promise a safe landing.</p>
      </>,
    },
  ]
  const s = steps[step], last = step === steps.length - 1

  return (
    <div className="cmpx-modal cg" role="dialog" aria-modal="true" aria-labelledby="cg-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cg-box">
        <button ref={closeRef} className="cmpx-x" onClick={onClose} aria-label="Close the guide"><X size={16} /></button>
        <div className="cg-talk" aria-live="polite">
          <p className="cmpx-kicker">{s.kicker} <span className="mono">{String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span></p>
          <h2 id="cg-title">{s.title}</h2>
          <div className="cg-body" key={step}>{s.body}</div>
          <div className="cg-nav">
            <div className="cg-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
            {step > 0 && <button className="cmpx-btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={14} aria-hidden="true" /> Back</button>}
            <button className="cmpx-btn solid" onClick={() => (last ? onClose() : setStep(step + 1))}>{last ? 'Start comparing' : 'Next'} {!last && <ArrowRight size={14} aria-hidden="true" />}</button>
          </div>
        </div>
        <div className="cg-rover"><GuideRover talking={talking} /></div>
      </div>
    </div>
  )
}
