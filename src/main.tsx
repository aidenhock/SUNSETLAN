import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Test hook: `?e2e` exposes the store so browser smoke tests can drive state.
if (new URLSearchParams(window.location.search).has('e2e')) {
  import('./store/useStore').then((m) => {
    ;(window as unknown as { __store: unknown }).__store = m.useStore
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
