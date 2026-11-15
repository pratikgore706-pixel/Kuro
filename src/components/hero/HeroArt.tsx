/** Minimal scroll cue for the hero: a pill mouse glyph with a sinking dot, and the word SCROLL. */
export function ScrollCue({ className = '' }: { className?: string }) {
  return (
    <div className={'hv-scroll ' + className} aria-hidden="true">
      <span>SCROLL</span>
      <svg width="16" height="26" viewBox="0 0 16 26">
        <rect x="1" y="1" width="14" height="24" rx="7" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.2" />
        <circle className="hv-scroll-dot" cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    </div>
  )
}
