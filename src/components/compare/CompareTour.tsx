import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'

interface Step { sel: string; title: string; text: string }

/** Every control on the Compare page, in reading order. The first window stands in for all four. */
const STEPS = (n: number): Step[] => [
  { sel: '.cmpx-title', title: 'The Compare page', text: 'The best landing spots our model found, side by side, each one live in 3D. Let me walk you round every control.' },
  { sel: '.cmpx-when', title: 'Landing date and stay', text: `Change the landing day or how long the lander stays, and all ${n} sites are scored again. The windows always show the best sites for exactly this landing.` },
  { sel: '.cmpx-clock', title: 'One clock for every window', text: 'Play, pause, rewind, pick a speed or drag the slider. All windows follow the same moment, so you can compare the light at every site at once.' },
  { sel: '.cmpx-grid > .cv', title: 'A live rover view', text: 'Real NASA terrain with the KURO rover parked on the site. Drag to swing the camera round and up or down, scroll to zoom. The gold and blue arcs in the sky are the Sun’s and Earth’s paths; both are drawn 3× larger than life so they are easy to spot.' },
  { sel: '.cmpx-grid > .cv .cv-rank', title: 'Rank', text: `Where this site places among all ${n} scored sites. Gold marks number one.` },
  { sel: '.cmpx-grid > .cv .cv-pick', title: 'Swap the site', text: 'Click the name to show any other ranked site in this window. Picking one that is already on screen swaps the two.' },
  { sel: '.cmpx-grid > .cv .cv-score', title: 'Score out of 100', text: 'Flat ground, safety, sunlight, Earth contact and power-plus-radio, mixed into one number. Details shows exactly how.' },
  { sel: '.cmpx-grid > .cv .cv-expand', title: 'Full size', text: 'Show one site across the whole page for easier driving and a sharper view. Double-clicking a window does the same; Esc brings all four back.' },
  { sel: '.cmpx-grid > .cv .cv-dialwrap', title: 'Sky map', text: 'A compass seen from above: north is up, the dashed ring is the horizon, the centre is straight overhead. Gold and blue lines are the Sun’s and Earth’s paths across the whole stay; the dots are where they are now (hollow when hidden).' },
  { sel: '.cmpx-grid > .cv .cv-sky', title: 'Right now in the sky', text: 'What the Sun and Earth are doing at the clock’s time: how high they are, which direction, and whether the hills hide them.' },
  { sel: '.cmpx-grid > .cv .cv-stay', title: 'The whole stay at a glance', text: 'Gold is sunlight, blue is Earth in view, gaps are darkness or radio silence. The white mark is the clock’s time.' },
  { sel: '.cmpx-grid > .cv .cv-pad', title: 'Drive and look', text: 'Hold the arrows to drive the rover. The curved arrows turn the camera left and right; − and + zoom. With the pointer over a window, W A S D work too.' },
  { sel: '.cmpx-grid > .cv .cv-tools', title: 'Camera tools', text: 'Replay the camera tour, or look through the rover’s own mast camera instead of following behind it.' },
  { sel: '.cmpx-grid > .cv .cv-det', title: 'Details', text: 'Opens the full explanation in plain words and charts: why this site wins or loses against the others, plus every number in the scenario lab.' },
  { sel: '.cmpx-guide', title: 'This guide', text: 'Open it again any time. You can also say hello to KURO’s welcome again from here.' },
]

type Box = { x: number; y: number; w: number; h: number }

export function CompareTour({ total, onClose, onMeetKuro }: { total: number; onClose: () => void; onMeetKuro: () => void }) {
  const steps = useMemo(() => STEPS(total), [total])
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [pop, setPop] = useState<{ x: number; y: number; side: 'below' | 'above' | 'left' }>({ x: 0, y: 0, side: 'below' })
  const popRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const measure = useCallback(() => {
    const el = document.querySelector(steps[i].sel) as HTMLElement | null
    if (!el) { setBox(null); return }
    const r = el.getBoundingClientRect(), pad = 6
    const b = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 }
    setBox((o) => (o && o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h ? o : b))
    const pw = popRef.current?.offsetWidth ?? 320, ph = popRef.current?.offsetHeight ?? 200, vw = window.innerWidth, vh = window.innerHeight, gap = 14
    const clampX = (x: number) => Math.max(12, Math.min(vw - pw - 12, x))
    const put = (v: { x: number; y: number; side: 'below' | 'above' | 'left' }) => setPop((o) => (o.x === v.x && o.y === v.y && o.side === v.side ? o : v))
    if (b.h > vh * 0.6) put({ x: clampX(b.x + b.w / 2 - pw / 2), y: Math.max(12, b.y + b.h / 2 - ph / 2), side: 'left' })
    else if (b.y + b.h + gap + ph < vh - 8) put({ x: clampX(b.x + b.w / 2 - pw / 2), y: b.y + b.h + gap, side: 'below' })
    else put({ x: clampX(b.x + b.w / 2 - pw / 2), y: Math.max(12, b.y - gap - ph), side: 'above' })
  }, [i, steps])

  useLayoutEffect(() => { measure(); const t = setTimeout(measure, 60); return () => clearTimeout(t) }, [measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setI((v) => Math.min(steps.length - 1, v + 1))
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', k, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', k, true) }
  }, [measure, onClose, steps.length])
  useEffect(() => { nextRef.current?.focus() }, [i])

  const s = steps[i], last = i === steps.length - 1
  return (
    <div className="ct" role="dialog" aria-modal="false" aria-labelledby="ct-title">
      <div className="ct-shade" onClick={onClose} />
      {box && <div className="ct-spot" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      <div ref={popRef} className={'ct-pop ' + pop.side} style={{ left: pop.x, top: pop.y }} key={i}>
        <button className="ct-x" onClick={onClose} aria-label="End the guide"><X size={14} /></button>
        <div className="ct-head">
          <img src={`${import.meta.env.BASE_URL}compare/rover-front.webp`} alt="" />
          <div><p className="mono">{String(i + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</p><h3 id="ct-title">{s.title}</h3></div>
        </div>
        <p className="ct-text">{s.text}</p>
        <div className="ct-nav">
          <div className="ct-bar"><i style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
          {last && <button className="cmpx-btn ghost" onClick={onMeetKuro}>Meet KURO</button>}
          {i > 0 && <button className="cmpx-btn ghost" onClick={() => setI(i - 1)} aria-label="Previous"><ArrowLeft size={14} /></button>}
          <button ref={nextRef} className="cmpx-btn solid" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Done' : <>Next <ArrowRight size={14} aria-hidden="true" /></>}</button>
        </div>
      </div>
    </div>
  )
}
