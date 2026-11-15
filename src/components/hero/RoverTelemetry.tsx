import { useState } from 'react'
import type { Telemetry } from './storyScript'

// KURO mission-instrument panel (upper left). Values are SIMULATED, illustrative readings
// for the fictional KURO rover — not Athena data — and the panel says so. heroStory.ts
// writes the live values straight into the DOM (see telemetryView.ts), so scrolling never
// re-renders React; only the expand toggle does.
export function RoverTelemetry({ initial }: { initial: Telemetry }) {
  const [open, setOpen] = useState(false)
  const t = initial
  return (
    <section className={`rtel${open ? ' is-open' : ''}`} aria-label="KURO rover telemetry, simulated">
      <header className="rtel-head">
        <span className="rtel-title">KURO telemetry</span>
        <span className="rtel-sim">Simulated · illustrative</span>
        <button type="button" className="rtel-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? '− Less' : '+ More'}
        </button>
      </header>
      <dl className="rtel-grid">
        <div className="rtel-cell" data-k="battery">
          <dt>Battery</dt>
          <dd><b className="rtel-v">{Math.round(t.battery)}%</b><i className="rtel-bar"><i style={{ width: `${t.battery}%` }} /></i></dd>
        </div>
        <div className="rtel-cell" data-k="solar"><dt>Solar input</dt><dd><b className="rtel-v">{Math.round(t.solar)} W</b></dd></div>
        <div className="rtel-cell" data-k="temp"><dt>System temp</dt><dd><b className="rtel-v">{Math.round(t.temp)} °C</b></dd></div>
        <div className="rtel-cell" data-k="comm"><dt>Comms</dt><dd><i className="rtel-dot" /><b className="rtel-v">{t.comm[0]}</b></dd></div>
      </dl>
      <dl className="rtel-grid rtel-extra">
        <div className="rtel-cell" data-k="drive"><dt>Drive</dt><dd><i className="rtel-dot" /><b className="rtel-v">{t.drive[0]}</b></dd></div>
        <div className="rtel-cell" data-k="mode"><dt>Power mode</dt><dd><i className="rtel-dot" /><b className="rtel-v">{t.mode[0]}</b></dd></div>
        <div className="rtel-cell" data-k="traction"><dt>Traction</dt><dd><i className="rtel-dot" /><b className="rtel-v">{t.traction[0]}</b></dd></div>
        <div className="rtel-cell" data-k="light"><dt>Illumination</dt><dd><i className="rtel-dot" /><b className="rtel-v">{t.light[0]}</b></dd></div>
      </dl>
    </section>
  )
}
