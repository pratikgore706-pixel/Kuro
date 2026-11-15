// Writes a Telemetry state into the RoverTelemetry DOM, touching only what changed.
import type { Level, Telemetry } from './storyScript'

const levelBattery = (v: number): Level => (v > 50 ? 'ok' : v > 20 ? 'warn' : 'crit')
const levelSolar = (v: number): Level => (v > 100 ? 'ok' : v > 25 ? 'warn' : 'crit')
const levelTemp = (v: number): Level => (v > -30 ? 'ok' : v > -50 ? 'warn' : 'crit')
const fmtTemp = (v: number) => `${Math.round(v) < 0 ? '−' : ''}${Math.abs(Math.round(v))} °C`

export function bindTelemetry(root: HTMLElement) {
  const cell = (k: string) => root.querySelector<HTMLElement>(`.rtel-cell[data-k="${k}"]`)
  const cells = ['battery', 'solar', 'temp', 'comm', 'drive', 'mode', 'traction', 'light'].map((k) => {
    const el = cell(k)
    return { k, el, v: el?.querySelector<HTMLElement>('.rtel-v') ?? null, text: '', level: '' }
  })
  const bar = root.querySelector<HTMLElement>('.rtel-bar > i')
  let barW = ''

  const set = (i: number, text: string, level: Level) => {
    const c = cells[i]
    if (c.v && c.text !== text) { c.v.textContent = text; c.text = text }
    if (c.el && c.level !== level) { c.el.dataset.level = level; c.level = level }
  }

  return (t: Telemetry) => {
    set(0, `${Math.round(t.battery)}%`, levelBattery(t.battery))
    set(1, `${Math.round(t.solar)} W`, levelSolar(t.solar))
    set(2, fmtTemp(t.temp), levelTemp(t.temp))
    set(3, t.comm[0], t.comm[1])
    set(4, t.drive[0], t.drive[1])
    set(5, t.mode[0], t.mode[1])
    set(6, t.traction[0], t.traction[1])
    set(7, t.light[0], t.light[1])
    const w = `${t.battery.toFixed(1)}%`
    if (bar && w !== barW) { bar.style.width = w; barW = w }
  }
}
