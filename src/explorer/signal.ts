import { useEffect, useState } from 'react'

/** A tiny observable value for data that changes many times a second (pointer readout, rover telemetry), so only the
 *  component that shows it re-renders — not the whole explorer page with its charts. */
export interface Signal<T> { get: () => T; set: (v: T) => void; sub: (f: (v: T) => void) => () => void }
export function signal<T>(init: T): Signal<T> {
  let v = init
  const subs = new Set<(v: T) => void>()
  return { get: () => v, set: (x) => { v = x; subs.forEach((f) => f(x)) }, sub: (f) => { subs.add(f); return () => { subs.delete(f) } } }
}
export function useSignal<T>(s: Signal<T>): T {
  const [v, set] = useState(s.get())
  useEffect(() => s.sub(set), [s])
  return v
}
