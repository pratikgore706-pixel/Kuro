import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif/400.css'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/inter'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/fonts.css'
import './styles/app.css'
import './styles/workspace.css'
import './styles/explorer.css'
import App from './App'
import { applyPerfClass } from './perf'

// low-end devices get the lighter look before the first paint (see perf.ts)
applyPerfClass()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
