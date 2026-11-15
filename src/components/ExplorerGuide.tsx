import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import '../styles/compare.css'

interface Step { sel: string; title: string; text: string }

/** The Explorer, one part at a time, in the order a first visit uses it. */
const STEPS: Step[] = [
  { sel: '.xp-stage', title: 'The Explorer', text: 'The Moon in 3D, built from NASA laser-altimeter heights and orbiter photos. Drag to turn it, scroll to zoom. Let me show you around.' },
  { sel: '.lp', title: 'When do you land?', text: 'Pick the landing date, the time and how long the lander stays. Every site is scored again for exactly this landing.' },
  { sel: '.xp-rank', title: 'The best landing sites', text: 'All 78 candidate sites, ranked for your date. Click a name to select it; the score out of 100 mixes sunlight, Earth contact, flat ground and safety.' },
  { sel: '.xp-rk-info', title: 'Details', text: 'Opens a site’s story in plain words: why it ranks where it does, plus buttons to drive there or compare it with other sites.' },
  { sel: '.xp-planfoot', title: 'All sites and layers', text: 'Browse all 78 sites by region, or change what the surface shows: real photos, height, slope, or sunlight across your stay.' },
  { sel: '.xp-views-row', title: 'Four ways to look', text: 'Globe for the whole Moon, Pole for the South Pole terrain, Drone to fly low over a site, Rover to drive on the ground. Keys 1 to 4 switch too.' },
  { sel: '.xp-toolbar', title: 'Tools', text: 'Measure distances and heights, go back to the selected site, save a picture, copy a link to this exact view, and see every keyboard control.' },
  { sel: '.xp-right', title: 'Site conditions', text: 'What the selected site is like right now: where the Sun and Earth are, when they next rise or set, and how much light and radio contact the whole stay gets.' },
  { sel: '.xp-time', title: 'Time', text: 'The bands show sunlight (gold) and Earth in view (blue) across the stay. Press play or drag to move time; hover the graph for exact numbers.' },
  { sel: '.xp-skybtn', title: 'Sky chart', text: 'The sky seen from the site: the hills around it, and the paths of the Sun and Earth across your stay.' },
]

type Box = { x: number; y: number; w: number; h: number }

/** A spotlight tour of the Explorer's controls, told by KURO (same look as the Compare page's guide). */
export function ExplorerGuide({ onClose, onScenic }: { onClose: () => void; onScenic: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [pop, setPop] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const popRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const measure = useCallback(() => {
    const el = document.querySelector(STEPS[i].sel) as HTMLElement | null
    const vw = window.innerWidth, vh = window.innerHeight, gap = 14
    const pw = popRef.current?.offsetWidth ?? 330, ph = popRef.current?.offsetHeight ?? 200
    const clampX = (x: number) => Math.max(12, Math.min(vw - pw - 12, x))
    const clampY = (y: number) => Math.max(12, Math.min(vh - ph - 12, y))
    if (!el || el.getBoundingClientRect().width === 0) { setBox(null); setPop({ x: (vw - pw) / 2, y: (vh - ph) / 2 }); return }
    const r = el.getBoundingClientRect(), pad = 6
    const b = { x: Math.max(4, r.left - pad), y: Math.max(4, r.top - pad), w: Math.min(vw - 8, r.width + pad * 2), h: Math.min(vh - 8, r.height + pad * 2) }
    setBox((o) => (o && o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h ? o : b))
    // beside a tall element, under or over a short one, centred over a huge one
    let p: { x: number; y: number }
    if (b.w > vw * 0.7 && b.h > vh * 0.6) p = { x: (vw - pw) / 2, y: (vh - ph) / 2 }
    else if (b.h > vh * 0.45) p = b.x + b.w + gap + pw < vw ? { x: b.x + b.w + gap, y: clampY(b.y + 40) } : { x: Math.max(12, b.x - gap - pw), y: clampY(b.y + 40) }
    else if (b.y + b.h + gap + ph < vh - 8) p = { x: clampX(b.x + b.w / 2 - pw / 2), y: b.y + b.h + gap }
    else p = { x: clampX(b.x + b.w / 2 - pw / 2), y: Math.max(12, b.y - gap - ph) }
    setPop((o) => (o.x === p.x && o.y === p.y ? o : p))
  }, [i])

  useLayoutEffect(() => { measure(); const t = setTimeout(measure, 60); return () => clearTimeout(t) }, [measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); setI((v) => Math.min(STEPS.length - 1, v + 1)) }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); setI((v) => Math.max(0, v - 1)) }
    }
    window.addEventListener('keydown', k, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', k, true) }
  }, [measure, onClose])
  useEffect(() => { nextRef.current?.focus() }, [i])

  const s = STEPS[i], last = i === STEPS.length - 1
  return createPortal(
    <div className="kg ct" role="dialog" aria-modal="false" aria-labelledby="xg-title">
      <div className="ct-shade" onClick={onClose} />
      {box && <div className="ct-spot" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      <div ref={popRef} className="ct-pop" style={{ left: pop.x, top: pop.y }} key={i}>
        <button className="ct-x" onClick={onClose} aria-label="End the guide"><X size={14} /></button>
        <div className="ct-head">
          <img src={`${import.meta.env.BASE_URL}compare/rover-front.webp`} alt="" />
          <div><p className="mono">{String(i + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</p><h3 id="xg-title">{s.title}</h3></div>
        </div>
        <p className="ct-text">{s.text}</p>
        <div className="ct-nav">
          <div className="ct-bar"><i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
          {last && <button className="cmpx-btn ghost" onClick={onScenic}>Scenic tour</button>}
          {i > 0 && <button className="cmpx-btn ghost" onClick={() => setI(i - 1)} aria-label="Previous"><ArrowLeft size={14} /></button>}
          <button ref={nextRef} className="cmpx-btn solid" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Done' : <>Next <ArrowRight size={14} aria-hidden="true" /></>}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
