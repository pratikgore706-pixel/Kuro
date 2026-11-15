/** Minimal scroll cue for the hero: a pill mouse glyph with a sinking dot, and the word SCROLL. */
export function ScrollCue({ className = '' }: { className?: string }) {
  // a see-through tab that slides in on arrival and fades as soon as the story starts (heroStory.ts fades .hv-scroll-pos)
  return (
    <div className={'hv-scroll ' + className} role="note" aria-label="Scroll down to begin the story">
      <svg className="hv-scroll-mouse" width="18" height="28" viewBox="0 0 18 28" aria-hidden="true">
        <rect x="1" y="1" width="16" height="26" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.3" />
        <circle className="hv-scroll-dot" cx="9" cy="8.5" r="2.2" fill="currentColor" />
      </svg>
      <span className="hv-scroll-txt">
        <b><span className="hv-scroll-desk">Scroll</span><span className="hv-scroll-touch">Swipe up</span> to begin the story</b>
        <small>Seven short chapters · about 2 minutes</small>
      </span>
      <svg className="hv-scroll-arrow" width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><path d="M6 1v13M1 9l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  )
}
