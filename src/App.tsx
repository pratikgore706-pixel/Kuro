import { useEffect } from 'react'
import { HashRouter, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { loadEphemeris } from './engine/ephemeris'
import { loadMoonData } from './explorer/moonData'
import { Compare } from './pages/Compare'
import { ExplorerPage } from './explorer/ExplorerPage'
import { Landing } from './pages/Landing'
import { Methods } from './pages/Methods'
import { Mission } from './pages/Mission'
import { Reports } from './pages/Reports'
import { useStore } from './store'

// Hosts that do not pass #/paths through (embedded previews) can build with VITE_ROUTER=memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : HashRouter

function Workspace() {
  return (<div className="app"><TopBar /><Outlet /></div>)
}

export default function App() {
  const { ready, error, setReady, setError, setMoon } = useStore()
  useEffect(() => {
    loadMoonData().then(setMoon)
    loadEphemeris().then((e) => setReady([e.startMs, e.endMs])).catch((e: Error) => setError(e.message))
  }, [setReady, setError, setMoon])

  if (error) return <div className="boot" role="alert"><h1>KURO could not start</h1><p>{error}</p><p className="dim">The Sun and Earth table (data/ephemeris.bin) is required. Rebuild it with <code>python pipeline/ephemeris/build_ephemeris.py</code>.</p></div>
  if (!ready) return <div className="boot" aria-busy="true"><p className="mono dim">Loading ephemeris…</p></div>
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Workspace />}>
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/mission" element={<Mission />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/methods" element={<Methods />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </Router>
  )
}
