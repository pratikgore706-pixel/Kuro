import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Radio, Sun, X } from 'lucide-react'
import { SITES } from '../data/sites'
import { rankReason } from '../engine/explain'
import { DAY, fmtDate, fmtDayShort, fmtTimeOfDay, parseTimeOfDay, startOfUtcDay } from '../engine/time'
import { useStore } from '../store'
import { GuideRover } from './compare/RoverFace'
import { useRanked } from './useRanked'
import '../styles/compare.css'

const STAYS = [7, 14, 30] as const
const SHOW = 5

/**
 * The Explorer's opening, in the same style as the Compare guide. Step 1: KURO asks when the lander touches
 * down. Step 2: the top sites for that landing, with score and rank. Picking one closes the dialog and the
 * page flies into the rover view at that site (onLand).
 */
export function LandingIntro({ onDone, onLand, onGuide }: { onDone: () => void; onLand: (siteId: string) => void; onGuide: () => void }) {
  const { landingMs, days, range, horizonsReady } = useStore()
  const { setLanding, setDays } = useStore()
  const ranked = useRanked()
  const [step, setStep] = useState(0)
  const [date, setDate] = useState(fmtDate(landingMs))
  const [time, setTime] = useState(fmtTimeOfDay(landingMs))
  const [stay, setStay] = useState<number>(STAYS.includes(days as 7) ? days : 14)
  const [err, setErr] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [talking, setTalking] = useState(true)
  const dateRef = useRef<HTMLInputElement>(null)
  const total = SITES.length

  useEffect(() => { if (step === 0) dateRef.current?.focus() }, [step])
  useEffect(() => { setTalking(true); const t = setTimeout(() => setTalking(false), 2200); return () => clearTimeout(t) }, [step, ranked === null])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onDone])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const day = Date.parse(date + 'T00:00:00Z'), t = parseTimeOfDay(time)
    if (!isFinite(day) || t === null) { setErr('Please give a date and a time, like 2027-03-03 and 14:30.'); return }
    const ms = startOfUtcDay(day) + t
    if (ms < range[0] || ms + stay * DAY > range[1]) {
      setErr(`I can only plan landings between ${fmtDate(range[0] + DAY)} and ${fmtDate(range[1] - stay * DAY)}.`); return
    }
    setErr(null)
    setDays(stay)
    setLanding(ms)
    setStep(1)
  }

  // the dialog fades out, then the page flies down to the rover
  const pick = (id: string) => { if (leaving) return; setLeaving(true); setTimeout(() => onLand(id), 320) }

  const list = ranked ? ranked.slice(0, more ? 10 : SHOW) : []
  const best = ranked?.[0]

  return createPortal(
    <div className={'cmpx-modal cg kg' + (leaving ? ' leaving' : '')} role="dialog" aria-modal="true" aria-labelledby="kg-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !leaving) onDone() }}>
      <div className="cg-box">
        <button className="cmpx-x" onClick={onDone} aria-label="Close and explore on my own"><X size={16} /></button>
        <div className="cg-talk" aria-live="polite">
          {step === 0 ? (
            <>
              <p className="cmpx-kicker">Hello <span className="mono">01 / 02</span></p>
              <h2 id="kg-title">Hi, I’m KURO.</h2>
              <div className="cg-body" key="s0">
                <p>Tell me <b>the day and time</b> you want your lander to touch down near the Moon’s South Pole. I’ll check all <b>{total} landing sites</b> and tell you which ones get the most sunlight and the best view of Earth.</p>
                <form className="kg-form" onSubmit={submit}>
                  <label><span>Landing date (UTC)</span>
                    <input ref={dateRef} type="date" value={date} min={fmtDate(range[0] + DAY)} max={fmtDate(range[1] - 121 * DAY)} onChange={(e) => setDate(e.target.value)} required />
                  </label>
                  <label><span>Time (UTC)</span>
                    <input type="time" step={60} value={time} onChange={(e) => setTime(e.target.value)} required />
                  </label>
                  <div className="kg-stay" role="radiogroup" aria-label="How long the lander stays">
                    <span>Stay</span>
                    {STAYS.map((d) => <button key={d} type="button" role="radio" aria-checked={stay === d} className={stay === d ? 'on' : ''} onClick={() => setStay(d)}>{d} days</button>)}
                  </div>
                  {err && <p className="kg-err" role="alert">{err}</p>}
                  <div className="cg-nav">
                    <div className="cg-dots" aria-hidden="true"><span className="on" /><span /></div>
                    <button type="button" className="cmpx-btn ghost" onClick={onGuide}>Show me around</button>
                    <button type="submit" className="cmpx-btn solid">Find my landing site <ArrowRight size={14} aria-hidden="true" /></button>
                  </div>
                </form>
                <p className="cg-note">Press Enter to search, or close this to explore on your own.</p>
              </div>
            </>
          ) : (
            <>
              <p className="cmpx-kicker">Where to land <span className="mono">02 / 02</span></p>
              <h2 id="kg-title">{best ? `${best.site.name} is the pick.` : 'Checking every site…'}</h2>
              <div className="cg-body" key="s1">
                {!ranked ? (
                  <div className="kg-wait" aria-busy="true">
                    <p>I’m reading the hills around each landing site, so I know when they block the Sun or Earth.</p>
                    <div className="kg-bar"><i style={{ width: `${(100 * Math.min(horizonsReady, total)) / total}%` }} /></div>
                    <p className="mono kg-count">{Math.min(horizonsReady, total)} of {total} sites</p>
                  </div>
                ) : (
                  <>
                    <p>For a landing on <b>{fmtDayShort(landingMs)} {new Date(landingMs).getUTCFullYear()}</b> and a {days}-day stay, these are the best of all {ranked.length} sites. <b>Pick one</b> and I’ll drive you there.</p>
                    <ol className="cg-rank kg-rank">
                      {list.map((r, i) => (
                        <li key={r.siteId}>
                          <button type="button" onClick={() => pick(r.siteId)} disabled={leaving} aria-label={`Rank ${i + 1}: ${r.site.name}, score ${r.score === null ? 'none' : Math.round(r.score)}. Land here`}>
                            <span className="cg-n">{String(i + 1).padStart(2, '0')}</span>
                            <span className="cg-nm">{r.site.name}</span>
                            <span className="cg-sc mono">{r.score === null ? '—' : Math.round(r.score)}<small>/100</small></span>
                            <span className="cg-why">
                              <span className="kg-stat sun"><Sun size={11} aria-hidden="true" />Sun {r.summary.sunPct.toFixed(0)}%</span>
                              <span className="kg-stat earth"><Radio size={11} aria-hidden="true" />Earth {r.summary.earthPct.toFixed(0)}%</span>
                              {rankReason(r, r.summary, r.slopeDeg, days)}
                            </span>
                            <ArrowRight className="kg-go" size={15} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <button type="button" className="kg-more" onClick={() => setMore(!more)}>{more ? 'Show the top 5' : 'Show the top 10'}</button>
                  </>
                )}
                <div className="cg-nav">
                  <div className="cg-dots" aria-hidden="true"><span /><span className="on" /></div>
                  <button type="button" className="cmpx-btn ghost" onClick={() => setStep(0)} disabled={leaving}><ArrowLeft size={14} aria-hidden="true" /> Change date</button>
                  {best && <button type="button" className="cmpx-btn solid" onClick={() => pick(best.siteId)} disabled={leaving}>Land at the best <ArrowRight size={14} aria-hidden="true" /></button>}
                </div>
                <p className="cg-note">Scores rank the sites for this date and stay. They narrow the search — they do not promise a safe landing.</p>
              </div>
            </>
          )}
        </div>
        <div className="cg-rover"><GuideRover talking={talking} /></div>
      </div>
    </div>
  , document.body)
}
