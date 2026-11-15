import { ScrollCue } from '../components/hero/HeroArt'
import { mountHeroStory } from '../components/hero/heroStory'
import { RoverDialogue } from '../components/hero/RoverDialogue'
import { RoverTelemetry } from '../components/hero/RoverTelemetry'
import { CHAPTERS, CTA } from '../components/hero/storyScript'
import { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { SITES } from '../data/sites'

const SITE = SITES[0] // IM-2 Athena, Mons Mouton
const MISSION_DATE = SITE.eventMs
  ? new Date(SITE.eventMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
  : ''

// Resolved against BASE_URL (not a literal leading-slash path) so the build keeps working
// when served from a sub-path, same convention as the rest of the app (see engine/ephemeris.ts).
const HERO = `${import.meta.env.BASE_URL}hero/`
const STORY = `${HERO}story/`

const STARS_BG = {
  backgroundImage: `radial-gradient(1px 1px at 8% 16%, rgba(220,230,242,.75) 50%, transparent 100%), radial-gradient(1px 1px at 19% 61%, rgba(180,198,218,.65) 50%, transparent 100%), radial-gradient(1px 1px at 32% 28%, rgba(230,236,244,.6) 50%, transparent 100%), radial-gradient(1px 1px at 44% 76%, rgba(190,208,228,.7) 50%, transparent 100%), radial-gradient(1px 1px at 58% 12%, rgba(220,230,242,.65) 50%, transparent 100%), radial-gradient(1px 1px at 69% 54%, rgba(180,198,218,.6) 50%, transparent 100%), radial-gradient(1px 1px at 82% 23%, rgba(230,236,244,.7) 50%, transparent 100%), radial-gradient(1px 1px at 94% 71%, rgba(190,208,228,.65) 50%, transparent 100%), radial-gradient(1px 1px at 27% 88%, rgba(220,230,242,.55) 50%, transparent 100%), radial-gradient(1px 1px at 75% 87%, rgba(220,230,242,.55) 50%, transparent 100%)`,
  backgroundColor: '#020406',
  backgroundSize: '100% 100%',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
} as const

export function Landing() {
  const trackRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = trackRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    return mountHeroStory(el)
  }, [])

  return (
    <div className="landing">
      <div className="hv-track" ref={trackRef}>
      <section className="hv" aria-label="Thirteen hours — a real mission story">
        <div className="hv-stars" style={STARS_BG} />

        <header className="hv-nav">
          <Link to="/" className="hv-brand" aria-label="KURO home">
            <Brand size={20} />
            <span className="hv-brand-sub">Lunar South Pole Navigator</span>
          </Link>
          <nav aria-label="Primary">
            <Link to="/mission">Mission</Link>
            <Link to="/explorer">Explorer</Link>
            <a href="#technology">Technology</a>
            <Link to="/methods">Data</Link>
            <a href="#about">About</a>
          </nav>
        </header>

        <div className="hv-sun" aria-hidden="true"><span className="hv-sun-warm" /><span className="hv-sun-core" /></div>

        <div className="hv-earthwrap" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}hero/earth.png`} alt="" /></div>

        <div className="hv-head">
          <h1>thirteen<br />hours</h1>
          <p className="hv-eyebrow"><span className="hv-rule" />A real mission story</p>
        </div>

        <div className="hv-copy">
          <p>The mission was built for<br />ten days. The Moon gave<br />it thirteen hours.</p>
          <Link to="/mission" className="hv-explore">Explore the story <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>

        {/* scroll story: editorial chapters over the scene, faded in/out by heroStory.ts */}
        <div className="hv-story">
          {CHAPTERS.map((c) => (
            <article key={c.n} className={`hv-ch hv-ch--${c.side}`}>
              <p className="hv-ch-label"><span>{c.n}</span>{c.name}</p>
              <h2 className="hv-ch-title">{c.title}</h2>
              {c.paras.map((t, i) => <p key={i} className="hv-ch-p">{t}</p>)}
              {c.facts && (
                <dl className="hv-ch-facts">
                  {c.facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
                </dl>
              )}
              {c.note && <p className="hv-ch-note">{c.note}</p>}
              {c.n === '07' && (
                <div className="hv-cta">
                  <p>{CTA.text}</p>
                  <Link to={CTA.to} className="hv-cta-btn">{CTA.label} <ArrowRight size={16} aria-hidden="true" /></Link>
                </div>
              )}
            </article>
          ))}
        </div>

        <RoverTelemetry initial={CHAPTERS[0].telemetry} />
        <RoverDialogue chapters={CHAPTERS} avatar={`${STORY}rover-base.webp`} />

        <div className="hv-ground" aria-hidden="true">
          <div className="hv-land">
            <div className="hv-plain"><img className="hv-plain-img" src={`${STORY}plain.webp`} alt="" /></div>
            <img className="hv-mtn" src={`${STORY}mountains.webp`} alt="" />
          </div>
          <div className="hv-rover">
            <span className="hv-rover-shadow" />
            <img className="hv-rv" src={`${STORY}rover-base.webp`} alt="" />
            <img className="hv-rv hv-rv-blur" src={`${STORY}rover-blur.webp`} alt="" />
            <img className="hv-rv hv-face-green" src={`${STORY}face-green.webp`} alt="" />
            <img className="hv-rv hv-face-yellow" src={`${STORY}face-yellow.webp`} alt="" />
            <img className="hv-rv hv-face-red" src={`${STORY}face-red.webp`} alt="" />
          </div>
        </div>

        <div className="hv-mission mono">
          <span>{SITE.name.toUpperCase()}</span>
          <span>Mons Mouton, Lunar South Pole</span>
          <span>{MISSION_DATE}</span>
        </div>

        <ScrollCue className="hv-scroll-pos" />
      </section>
      </div>

      <footer className="lfoot" id="about">
        <Brand size={18} />
        <p>Built for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA. Ephemeris: JPL DE421. Imagery: NASA Moon Trek / LROC.</p>
      </footer>
    </div>
  )
}
