import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Clapperboard, X } from 'lucide-react'
import type { ViewMode } from '../explorer/engine/ExplorerEngine'
import { GuideRover } from './compare/RoverFace'
import '../styles/compare.css'
import '../styles/explorer-guide.css'

/**
 * The Explorer guide, told by KURO in plain words. It walks the parts of the page that are on screen right now,
 * in the order a first visit uses them, and changes with the view (Globe, Pole, Drone, Rover): parts that are hidden
 * in the current view are skipped instead of pointing at nothing.
 */

type Views = ViewMode[]
interface Step {
  id: string
  /** Element(s) to spotlight, first visible one wins. None = a centred card. */
  sel?: string[]
  /** Only in these views (default: all). */
  views?: Views
  kicker: string
  title: string
  text: string
  /** Optional tips shown as a short list. */
  tips?: string[]
  /** Offer buttons to switch view from this step. */
  tryViews?: boolean
}

const ALL_VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'globe', label: 'Globe' }, { id: 'pole', label: 'Pole' }, { id: 'drone', label: 'Drone' }, { id: 'rover', label: 'Rover' },
]

const STEPS: Step[] = [
  {
    id: 'hello', kicker: 'Welcome', title: 'Hi, I’m KURO. Let me show you the Explorer.',
    text: 'This is a 3D model of the real Moon, made from NASA measurements. Here you pick a day to land, see which places are best on that day, and check two things every lander needs: sunlight for power, and Earth in the sky to send messages home.',
  },
  {
    id: 'date', sel: ['.lp'], kicker: 'Step 1 · When', title: 'Choose your landing day',
    text: 'Set the date and time you would land, and how many days the lander should work. The Sun and Earth move across the Moon’s sky, so the best place to land changes with the date.',
  },
  {
    id: 'rank', sel: ['.xp-rank'], kicker: 'Step 2 · Where', title: 'The best places for that day',
    text: 'These are the top places to land on your day, each with a score out of 100. Higher is better. Click a name to fly there.',
    tips: ['The score mixes four things: sunshine, contact with Earth, flat ground and safety.'],
  },
  {
    id: 'why', sel: ['.xp-rk-info'], kicker: 'Step 2 · Where', title: 'Why is a place good?',
    text: 'The little ⓘ button explains a place in everyday words: how much sun it gets, whether it can talk to Earth, and how flat the ground is. From there you can drive to it or compare it.',
  },
  {
    id: 'more', sel: ['.xp-planfoot'], kicker: 'Step 2 · Where', title: 'Every place, and what the ground shows',
    text: '“All sites” lists all 78 places, grouped by area. “Layers” changes what you see on the ground: the real photo, height, how steep it is, or where the sunlight falls.',
  },
  {
    id: 'views', sel: ['.xp-views-row'], kicker: 'Step 3 · Look around', title: 'Four ways to look',
    text: 'Globe shows the whole Moon. Pole shows the South Pole from above. Drone lets you fly low over a place. Rover puts you on the ground to drive. You can also press keys 1 to 4.',
    tryViews: true,
  },
  {
    id: 'move-globe', sel: ['.xp-stage'], views: ['globe', 'pole', 'map'], kicker: 'Step 3 · Look around', title: 'Moving the view',
    text: 'Drag to turn the Moon. Scroll (or pinch) to zoom in and out. The picture gets sharper as you get closer.',
    tips: ['Press F to fly back to your selected place, R to reset the view.'],
  },
  {
    id: 'move-drone', sel: ['.pad', '.xp-stage'], views: ['drone', 'surface'], kicker: 'Step 3 · Look around', title: 'Flying the drone',
    text: 'Use W A S D to fly, E or Space to go up, Q to go down, and the arrow keys to turn. The on-screen pad does the same with a mouse or finger.',
  },
  {
    id: 'rover-drive', sel: ['.pad'], views: ['rover'], kicker: 'Step 3 · On the ground', title: 'Driving the rover',
    text: 'Drag the round stick to drive, or use W and S to go forward and back, A and D to steer, and Space to brake. The curved arrows turn the camera. Drag on the ground to look around.',
  },
  {
    id: 'rover-hud', sel: ['.rover-hud', '.rh-edge'], views: ['rover'], kicker: 'Step 4 · Conditions', title: 'The rover’s dashboard',
    text: 'It shows the rover’s speed, how steep the ground is under its wheels, and the two things that matter most: Sun (power) and Earth link (radio). “Destination” lets the rover drive itself to a point you click.',
    tips: ['The arrow at the top hides this panel so you can see the ground. A small tab on the right brings it back.'],
  },
  {
    id: 'conditions', sel: ['.xp-panel', '.xp-right .xp-edge'], views: ['globe', 'pole', 'drone', 'map', 'surface'], kicker: 'Step 4 · Conditions', title: 'What it’s like at your place',
    text: 'For the place you picked: is the Sun up right now, is Earth in the sky, and how long until each one sets. Below that, how much sunlight and Earth contact the whole stay gets.',
    tips: ['The arrow at its top-left tucks the panel away to the right edge.'],
  },
  {
    id: 'time', sel: ['.xp-time'], kicker: 'Step 5 · Time', title: 'Watch the days go by',
    text: 'The gold bar shows when the Sun shines on your place, the blue bar when Earth is in view. Gaps mean darkness or no radio. Press play to watch time pass, or drag to jump to any moment.',
  },
  {
    id: 'sky', sel: ['.xp-skybtn'], kicker: 'Step 5 · Time', title: 'The sky from your place',
    text: 'Opens a picture of the sky as seen from the ground there: the hills on the horizon and the paths the Sun and Earth take across your stay.',
  },
  {
    id: 'tools', sel: ['.xp-toolbar'], kicker: 'Step 6 · Tools', title: 'Handy tools',
    text: 'From the top: measure a distance and height, open this guide, fly back to your place, reset the view, save a picture, copy a link to share this exact view, full screen, and the list of all keyboard keys.',
  },
  {
    id: 'bye', kicker: 'All set', title: 'You’re ready to explore.',
    text: 'A good first try: pick the number 1 place, open its ⓘ to see why it wins, then switch to Rover and look for the Sun and Earth from the ground.',
  },
]

type Box = { x: number; y: number; w: number; h: number }

/** The first element of a step that is actually on screen, or null. */
function target(step: Step): HTMLElement | null {
  for (const s of step.sel ?? []) {
    const el = document.querySelector(s) as HTMLElement | null
    if (!el) continue
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    if (r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) return el
  }
  return null
}

export function ExplorerGuide({ mode, onClose, onScenic, onView }: { mode: ViewMode; onClose: () => void; onScenic: () => void; onView: (v: ViewMode) => void }) {
  const [id, setId] = useState('hello')
  const [tick, setTick] = useState(0)
  const [talking, setTalking] = useState(true)
  const [box, setBox] = useState<Box | null>(null)
  const [pop, setPop] = useState<{ x: number; y: number; side: 'below' | 'above' | 'right' | 'left' | 'centre' }>({ x: 0, y: 0, side: 'centre' })
  const popRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  // the steps that apply to this view and are on screen (re-checked when the view or layout changes)
  const steps = useMemo(() => STEPS.filter((s) => (!s.views || s.views.includes(mode)) && (!s.sel || target(s))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, tick])
  const i = Math.max(0, steps.findIndex((s) => s.id === id))
  const s = steps[i] ?? STEPS[0], last = i === steps.length - 1, centred = !s.sel
  const go = (k: number) => setId(steps[Math.max(0, Math.min(steps.length - 1, k))].id)

  // if the current step vanished (view changed), stay on the nearest one in the original order
  useEffect(() => {
    if (steps.some((x) => x.id === id)) return
    const at = STEPS.findIndex((x) => x.id === id)
    const next = steps.find((x) => STEPS.indexOf(x) >= at) ?? steps[steps.length - 1]
    if (next) setId(next.id)
  }, [steps, id])
  // layout settles a moment after a view switch
  useEffect(() => { const t = setTimeout(() => setTick((v) => v + 1), 350); return () => clearTimeout(t) }, [mode])
  useEffect(() => { setTalking(true); const t = setTimeout(() => setTalking(false), 1800); return () => clearTimeout(t) }, [id])

  const measure = useCallback(() => {
    const vw = innerWidth, vh = innerHeight, gap = 14
    const pw = popRef.current?.offsetWidth ?? 360, ph = popRef.current?.offsetHeight ?? 220
    const el = s.sel ? target(s) : null
    if (!el) { setBox(null); setPop({ x: (vw - pw) / 2, y: Math.max(12, (vh - ph) / 2), side: 'centre' }); return }
    const r = el.getBoundingClientRect(), pad = 6
    const b = { x: Math.max(4, r.left - pad), y: Math.max(4, r.top - pad), w: Math.min(vw - 8, r.width + pad * 2), h: Math.min(vh - 8, r.height + pad * 2) }
    setBox((o) => (o && o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h ? o : b))
    const cx = (x: number) => Math.max(12, Math.min(vw - pw - 12, x)), cy = (y: number) => Math.max(12, Math.min(vh - ph - 12, y))
    let p: typeof pop
    if (vw < 700) p = { x: 12, y: b.y + b.h / 2 > vh / 2 ? 12 : vh - ph - 12, side: 'centre' }
    else if (b.w > vw * 0.7 && b.h > vh * 0.6) p = { x: (vw - pw) / 2, y: (vh - ph) / 2, side: 'centre' }
    else if (b.h > vh * 0.4 || b.w < 70) p = b.x + b.w + gap + pw < vw ? { x: b.x + b.w + gap, y: cy(b.y + Math.min(40, b.h / 2 - 40)), side: 'right' } : { x: Math.max(12, b.x - gap - pw), y: cy(b.y + Math.min(40, b.h / 2 - 40)), side: 'left' }
    else if (b.y + b.h + gap + ph < vh - 8) p = { x: cx(b.x + b.w / 2 - pw / 2), y: b.y + b.h + gap, side: 'below' }
    else p = { x: cx(b.x + b.w / 2 - pw / 2), y: Math.max(12, b.y - gap - ph), side: 'above' }
    setPop((o) => (o.x === p.x && o.y === p.y && o.side === p.side ? o : p))
  }, [s])

  useLayoutEffect(() => { measure(); const t = setTimeout(measure, 80); return () => clearTimeout(t) }, [measure, tick])
  useEffect(() => {
    const onResize = () => { setTick((v) => v + 1); measure() }
    window.addEventListener('resize', onResize)
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); if (last) onClose(); else go(i + 1) }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); go(i - 1) }
    }
    window.addEventListener('keydown', k, true)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', k, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, onClose, i, last, steps])
  useEffect(() => { nextRef.current?.focus() }, [id])

  const n = steps.length
  return createPortal(
    <div className={'xg ct' + (centred ? ' centred' : '')} role="dialog" aria-modal="true" aria-labelledby="xg-title">
      <div className="ct-shade" onClick={onClose} />
      {box && <div className="ct-spot" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      <div ref={popRef} className={'ct-pop xg-pop ' + pop.side + (centred ? ' big' : '')} style={{ left: pop.x, top: pop.y }} key={s.id}>
        <button className="ct-x" onClick={onClose} aria-label="Close the guide"><X size={14} /></button>
        {centred ? (
          <div className="xg-hero">
            <div className="xg-rover"><GuideRover talking={talking} /></div>
            <div>
              <p className="xg-kicker">{s.kicker}</p>
              <h3 id="xg-title">{s.title}</h3>
            </div>
          </div>
        ) : (
          <div className="ct-head">
            <img src={`${import.meta.env.BASE_URL}compare/rover-front.webp`} alt="" />
            <div><p className="xg-kicker">{s.kicker}</p><h3 id="xg-title">{s.title}</h3></div>
          </div>
        )}
        <p className="ct-text">{s.text}</p>
        {s.tips && <ul className="xg-tips">{s.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
        {s.tryViews && (
          <div className="xg-try" role="group" aria-label="Try a view">
            <span>Try it:</span>
            {ALL_VIEWS.map((v) => <button key={v.id} className={mode === v.id ? 'on' : ''} aria-pressed={mode === v.id} onClick={() => onView(v.id)}>{v.label}</button>)}
          </div>
        )}
        <div className="ct-nav">
          <div className="xg-dots" aria-label={`Step ${i + 1} of ${n}`}>{steps.map((x, k) => <button key={x.id} className={k === i ? 'on' : k < i ? 'done' : ''} onClick={() => go(k)} aria-label={`Go to step ${k + 1}: ${x.title}`} />)}</div>
          {i === 0 && <button className="cmpx-btn ghost" onClick={onClose}>Skip</button>}
          {last && <button className="cmpx-btn ghost" onClick={onScenic}><Clapperboard size={13} aria-hidden="true" /> Camera tour</button>}
          {i > 0 && <button className="cmpx-btn ghost" onClick={() => go(i - 1)} aria-label="Back"><ArrowLeft size={14} /></button>}
          <button ref={nextRef} className="cmpx-btn solid" onClick={() => (last ? onClose() : go(i + 1))}>{i === 0 ? <>Show me <ArrowRight size={14} aria-hidden="true" /></> : last ? 'Start exploring' : <>Next <ArrowRight size={14} aria-hidden="true" /></>}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
