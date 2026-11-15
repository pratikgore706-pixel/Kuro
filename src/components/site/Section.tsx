import type { ReactNode } from 'react'

/** Editorial section: number + label column on the left, heading and content on the right. */
export function Section({ n, label, title, id, children }: { n: string; label: string; title: string; id?: string; children: ReactNode }) {
  return (
    <section className="kp-sec" id={id}>
      <div className="kp-sec-side reveal"><p className="kp-sec-n">{n}</p><p className="kp-sec-label">{label}</p></div>
      <div>
        <h2 className="reveal">{title}</h2>
        <div className="reveal d1">{children}</div>
      </div>
    </section>
  )
}
