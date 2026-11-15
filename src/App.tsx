import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { HashRouter, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { loadEphemeris } from './engine/ephemeris'
import { loadMoonData } from './explorer/moonData'
import { Landing } from './pages/Landing'
import { useStore } from './store'

// Each page is its own download: the landing story loads without the 3D engine, and the 3D pages load only
// what they use.
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const Data = lazy(() => import('./pages/Data').then((m) => ({ default: m.Data })))
const ExplorerPage = lazy(() => import('./explorer/ExplorerPage').then((m) => ({ default: m.ExplorerPage })))
const CompareSites = lazy(() => import('./pages/CompareSites').then((m) => ({ default: m.CompareSites })))
const Mission = lazy(() => import('./pages/Mission').then((m) => ({ default: m.Mission })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Methods = lazy(() => import('./pages/Methods').then((m) => ({ default: m.Methods })))

// Hosts that do not pass #/paths through (embedded previews) can build with VITE_ROUTER=memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : HashRouter

const Loading = ({ label }: { label: string }) => <div className="boot" aria-busy="true"><p className="mono dim">{label}</p></div>

/** Pages that compute with the Sun and Earth table wait for it (about 1.5 MB, loaded once). */
function NeedsEphemeris({ children }: { children: ReactNode }) {
  const ready = useStore((s) => s.ready)
  const error = useStore((s) => s.error)
  if (error) return <div className="boot" role="alert"><h1>KURO could not start</h1><p>{error}</p><p className="dim">The Sun and Earth table (public/data/ephemeris.bin) is missing from this build.</p></div>
  if (!ready) return <Loading label="Loading the Sun and Earth table…" />
  return <>{children}</>
}

function Workspace() {
  // the 3D pages need the Moon's elevation; start it now if the landing page has not already
  useEffect(() => { startMoonData() }, [])
  return (
    <div className="app">
      <TopBar />
      <NeedsEphemeris><Suspense fallback={<Loading label="Loading…" />}><Outlet /></Suspense></NeedsEphemeris>
    </div>
  )
}

/** About and Data: long reading pages with the same left menu as the Explorer; the page itself scrolls. */
function DocLayout() {
  return (
    <div className="app app-doc">
      <TopBar />
      <Suspense fallback={<Loading label="Loading…" />}><Outlet /></Suspense>
    </div>
  )
}

let moonStarted = false
function startMoonData() {
  if (moonStarted) return
  moonStarted = true
  loadMoonData().then(useStore.getState().setMoon)
}

export default function App() {
  const { setReady, setError } = useStore()
  useEffect(() => {
    loadEphemeris().then((e) => setReady([e.startMs, e.endMs])).catch((e: Error) => setError(e.message))
    // on any other page, fetch the Moon data quietly once the page itself has finished loading,
    // so opening the Explorer later is instant
    const later = () => setTimeout(startMoonData, 2500)
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true })
  }, [setReady, setError])

  return (
    <Router>
      <Suspense fallback={<Loading label="Loading…" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<DocLayout />}>
            <Route path="/data" element={<NeedsEphemeris><Data /></NeedsEphemeris>} />
            <Route path="/about" element={<About />} />
          </Route>
          <Route element={<Workspace />}>
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/mission" element={<Mission />} />
            <Route path="/compare" element={<CompareSites />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/methods" element={<Methods />} />
          </Route>
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
