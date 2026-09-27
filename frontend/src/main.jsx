import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Loaded AFTER index.css deliberately: tokens.css and index.css both
// declare a handful of identically-named custom properties with different
// values (--color-surface, --color-text-muted, --color-border,
// --radius-sm/md/lg) -- custom properties aren't scoped per file, so
// whichever :root rule is later in the cascade wins globally, on every
// screen, old and new alike. This order means the new tokens.css values
// win for those specific names everywhere (a handful of old screens'
// borders/radii shift by a few px as a side effect), which is what the
// new components/ui/ primitives need to render with the actually-spec'd
// values -- see the "Replace it (rebrand)" decision this is part of.
import './styles/tokens.css'
import './styles/global.css'
import './styles/screens.css'
import './i18n'
import App from './App.jsx'
import LanguageRoot from './i18n/LanguageRoot'
import { ThemeProvider } from './context/ThemeProvider'
import { SocketProvider } from './context/SocketProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <SocketProvider>
        <LanguageRoot>
          <App />
        </LanguageRoot>
      </SocketProvider>
    </ThemeProvider>
  </StrictMode>,
)

// Production only -- registering in dev would have the service worker
// intercept and cache Vite's dev-server assets (which change on every hot
// reload), fighting HMR instead of helping. Registered after 'load' so it
// never competes with the app's own initial resource fetches.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed:', err));
  });
}
