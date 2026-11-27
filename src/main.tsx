import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './lib/install' // catches the browser's install offer as early as it comes
import { applyTheme, watchSystemTheme } from './lib/theme'

applyTheme()
watchSystemTheme()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// Offline support and Android notifications (production builds only, so dev reloads stay fresh).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
