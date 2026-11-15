import { useEffect, useMemo, useState } from 'react'
import { CirclePlay, Pause, RotateCcw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { isLite, onLiteChange, watchFrameRate } from '../perf'
import { CompareGuide } from '../components/compare/CompareGuide'
import { CompareTour } from '../components/compare/CompareTour'
import { CompareView } from '../components/compare/CompareView'
import { SiteDetails } from '../components/compare/SiteDetails'
import { DURATIONS, SPEEDS } from '../components/TimeBar'
import { SITES } from '../data/sites'
import { computeSeries, makeFrame, type Series } from '../engine/sky'
import { DAY, HOUR, fmtDate, fmtDayShort, startOfUtcDay } from '../engine/time'
import { horizonFor, useEarthMargin, warmHorizons } from '../hooks'
import { rankSites, stayStepCount } from '../services/api'
import { useStore } from '../store'
import '../styles/compare.css'

const SLOTS = 4
const fmtT = (ms: number) => new Date(ms).toISOString().slice(11, 16)

function useNarrow() {
  const q = '(max-width: 860px)'
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => { const m = window.matchMedia(q); const f = () => setN(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return n
}

/**
 * Compare: the best-ranked South Pole sites side by side, each as a live rover view on one shared clock.
 * The ranking is the Explorer's (same date, stay and antenna margin), so both pages always agree.
 */
export function CompareSites() {
  const { landingMs, days, cursorMs, playing, speed, range, moon } = useStore()
  const horizonsReady = useStore((st) => st.horizonsReady)
  const ready = horizonsReady >= SITES.length
  const { setLanding, setDays, setCursor, setPlaying, setSpeed, tick } = useStore()
  const margin = useEarthMargin()
  // one 3D view at a time (with tabs) on narrow screens, and on slow devices, where four would stutter
  const narrowScreen = useNarrow()
  const [lite, setLiteState] = useState(isLite)
  useEffect(() => { const off = onLiteChange(setLiteState); const stop = watchFrameRate(6000); return () => { off(); stop() } }, [])
  const narrow = narrowScreen || lite
  // #/compare?site=ID (the Explorer's "Compare with other sites") puts that site in the first window
  const [params] = useSearchParams()
  const [slots, setSlots] = useState<(string | null)[]>(() => {
    const first = params.get('site')
    return Array.from({ length: SLOTS }, (_, i) => (i === 0 && first && SITES.some((x) => x.id === first) ? first : null))
  })
  const [details, setDetails] = useState<string | null>(null)
  const [guide, setGuide] = useState(true)
  const [tour, setTour] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [introRun, setIntroRun] = useState(0)
  const [tabSlot, setTabSlot] = useState(0)

  // all 78 candidate sites; terrain horizons are traced in the background first so the page never freezes
  useEffect(() => { if (moon) warmHorizons(SITES, moon.ok ? moon : null) }, [moon])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => (ready ? rankSites(SITES, landingMs, days, margin) : []), [ready, landingMs, days, margin, moon])
  const rankOf = (id: string) => ranked.findIndex((x) => x.siteId === id) + 1

  // a slot the user has not swapped follows the ranking; swapped slots keep their site
  const shownIds = useMemo(() => {
    const fixed = new Set(slots.filter(Boolean) as string[])
    const free = ranked.map((r) => r.siteId).filter((id) => !fixed.has(id))
    let k = 0
    return slots.map((s) => s ?? free[k++]).filter(Boolean) as string[]
  }, [slots, ranked])
  const shown = useMemo(() => shownIds.map((id) => ranked.find((r) => r.siteId === id)!).filter(Boolean), [shownIds, ranked])

  const series = useMemo(() => {
    const n = stayStepCount(days), step = (days * DAY) / (n - 1)
    const out: Record<string, Series | null> = {}
    for (const r of shown) out[r.siteId] = computeSeries(makeFrame(r.site.lat, r.site.lon), horizonFor(r.site, moon), landingMs, step, n, margin)
    return out
  }, [shown, landingMs, days, margin, moon])

  const swap = (slot: number, id: string) => setSlots((s) => {
    const next = [...s]
    const other = shownIds.indexOf(id)
    if (other >= 0 && other !== slot) next[other] = shownIds[slot] // swapping in a site already on screen trades places
    next[slot] = id
    return next
  })

  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const step = (now: number) => { tick(Math.min(100, now - last)); last = now; raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, tick])

  const closeWelcome = () => { setGuide(false); setIntroRun((n) => (n === 0 ? 1 : n)) }
  const openDetails = (id: string) => { setPlaying(false); setDetails(id) }
  useEffect(() => {
    if (expanded === null) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !details && !tour) setExpanded(null) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [expanded, details, tour])

  const end = landingMs + days * DAY
  const elapsed = cursorMs - landingMs
  const elapsedTxt = `T+${Math.floor(elapsed / DAY)}d ${Math.floor((elapsed % DAY) / HOUR)}h`
  const detailR = details ? ranked.find((r) => r.siteId === details) : null
  const views = narrow ? [tabSlot] : shown.map((_, i) => i)
  const covered = !!details

  return (
    <main className={'cmpx' + (tour ? ' touring' : '')}>
      <header className="cmpx-bar">
        <div className="cmpx-title">
          <p className="cmpx-kicker">Compare</p>
          <h1>{ready ? `The top ${shown.length} landing sites, side by side` : `Reading the hills around the landing sites: ${Math.min(horizonsReady, SITES.length)} of ${SITES.length}`}</h1>
        </div>
        <div className="cmpx-when">
          <label className="cmpx-field"><span>Landing</span>
            <input type="date" value={fmtDate(landingMs)} min={fmtDate(range[0] + DAY)} max={fmtDate(range[1] - 121 * DAY)}
              onChange={(e) => { const t = Date.parse(e.target.value + 'T00:00:00Z'); if (isFinite(t)) setLanding(t + (landingMs - startOfUtcDay(landingMs))) }} />
          </label>
          <label className="cmpx-field"><span>Stay</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{DURATIONS.map(([d]) => <option key={d} value={d}>{d} days</option>)}</select>
          </label>
        </div>
        <div className="cmpx-clock">
          <button className="cmpx-btn icon" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={15} /> : <CirclePlay size={16} />}</button>
          <button className="cmpx-btn icon ghost" onClick={() => setCursor(landingMs)} aria-label="Back to landing"><RotateCcw size={14} /></button>
          <select className="cmpx-speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">{SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <div className="cmpx-scrub">
            <input type="range" min={landingMs} max={end} step={HOUR / 4} value={Math.min(Math.max(cursorMs, landingMs), end)} onChange={(e) => setCursor(Number(e.target.value))} aria-label="Time in the stay, shared by all four views" />
            <span className="mono">{elapsedTxt} · {fmtDayShort(cursorMs)} {fmtT(cursorMs)} UTC</span>
          </div>
        </div>
        <button className="cmpx-guide" onClick={() => { setExpanded(null); setTour(true) }} aria-label="Open the guide to every feature">
          <img src={`${import.meta.env.BASE_URL}compare/rover-front.webp`} alt="" /><span>Guide</span>
        </button>
      </header>

      {narrow && (
        <nav className="cmpx-tabs" aria-label="Choose a site">
          {shown.map((r, i) => <button key={r.siteId} className={i === tabSlot ? 'on' : ''} onClick={() => setTabSlot(i)}><span className="mono">{String(rankOf(r.siteId)).padStart(2, '0')}</span>{r.site.name}</button>)}
        </nav>
      )}

      <div className={'cmpx-grid n' + views.length + (expanded !== null && !narrow ? ' solo' : '')}>
        {views.map((slot) => {
          const r = shown[slot]
          if (!r) return null
          return (
            <CompareView key={narrow ? 'one' : slot} r={r} rank={rankOf(r.siteId)} options={ranked} series={series[r.siteId] ?? null} moon={moon}
              landingMs={landingMs} days={days} cursorMs={cursorMs} delay={narrow ? 0 : slot * 500}
              expanded={!narrow && expanded === slot} paused={covered || (!narrow && expanded !== null && expanded !== slot)}
              introRun={introRun} introDelay={narrow ? 0 : slot * 350}
              onSwap={(id) => swap(slot, id)} onDetails={() => openDetails(r.siteId)} onExpand={() => setExpanded(expanded === slot ? null : slot)} />
          )
        })}
      </div>

      {guide && ready && <CompareGuide shown={shown} total={ranked.length} landingMs={landingMs} days={days} onClose={closeWelcome} />}
      {tour && !guide && <CompareTour total={ranked.length} onClose={() => setTour(false)} onMeetKuro={() => { setTour(false); setGuide(true) }} />}
      {detailR && <SiteDetails r={detailR} rank={rankOf(detailR.siteId)} shown={shown.some((s) => s.siteId === detailR.siteId) ? shown : [...shown, detailR]} series={series} landingMs={landingMs} days={days} onClose={() => setDetails(null)} />}
    </main>
  )
}
