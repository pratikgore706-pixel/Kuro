import type { Chapter } from './storyScript'

// KURO's speech bubble. Every chapter's line is rendered up front; heroStory.ts picks the
// line, places the bubble beside the rover (tail pointing at it) and scales it in/out.
// Hidden on load. The lines are fictional narration by the KURO rover character.
export function RoverDialogue({ chapters, avatar }: { chapters: Chapter[]; avatar: string }) {
  const total = String(chapters.length).padStart(2, '0')
  return (
    <aside className="rdlg" aria-label="KURO rover says">
      <header className="rdlg-head">
        <span className="rdlg-avatar"><img src={avatar} alt="" /></span>
        <span className="rdlg-who"><b>KURO</b><small>Your lunar companion</small></span>
        <span className="rdlg-ch">Ch <span className="rdlg-ch-n">01</span> / {total}</span>
      </header>
      <div className="rdlg-lines">
        {chapters.map((c) => <p key={c.n} className="rdlg-line">{c.dialogue}</p>)}
      </div>
      <svg className="rdlg-tail" viewBox="0 0 22 14" aria-hidden="true"><path d="M5 -1 L1 13 L17 -1" /></svg>
    </aside>
  )
}
