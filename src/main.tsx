import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Test hook: `?e2e` exposes the store so browser smoke tests can drive state.
if (new URLSearchParams(window.location.search).has('e2e')) {
  import('./store/useStore').then((m) => {
    ;(window as unknown as { __store: unknown }).__store = m.useStore
  })
}

const isClassic = window.location.pathname.replace(/\/+$/, '') === '/classic'

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null
  } catch {
    return false
  }
}

// No WebGL → the island can't render; send visitors to the classic page.
if (!isClassic && !supportsWebGL()) {
  window.location.replace('/classic')
}

// Both routes are lazy so the /classic chunk never pulls in three.js.
const Page = isClassic
  ? lazy(() => import('./classic/ClassicPage'))
  : lazy(() => import('./App'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="h-full w-full bg-ink" />}>
      <Page />
    </Suspense>
  </StrictMode>,
)
