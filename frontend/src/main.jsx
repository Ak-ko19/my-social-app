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
import { i18nReady } from './i18n'
import App from './App.jsx'
import LanguageRoot from './i18n/LanguageRoot'
import { ThemeProvider } from './context/ThemeProvider'
import { SocketProvider } from './context/SocketProvider'
import { HiddenWordsProvider } from './context/HiddenWordsProvider'
import ErrorBoundary from './components/common/ErrorBoundary'
import { installGlobalErrorReporting } from './utils/errorReporter'
import { startInstallListener } from './utils/installPrompt'

// Day 10: browser errors go to the admin error log (production builds).
installGlobalErrorReporting()
// Day 72: the browser's install offer comes once, early (see installPrompt).
startInstallListener()

// Wait for the saved language's strings (a separate chunk for Arabic)
// so the first paint is already in the right language.
i18nReady.finally(() => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <SocketProvider>
        <HiddenWordsProvider>
          <LanguageRoot>
            {/* Inside LanguageRoot, so the crash screen is translated and RTL. */}
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </LanguageRoot>
        </HiddenWordsProvider>
      </SocketProvider>
    </ThemeProvider>
  </StrictMode>,
))

// Production only -- registering in dev would have the service worker
// intercept and cache Vite's dev-server assets (which change on every hot
// reload), fighting HMR instead of helping. Registered after 'load' so it
// never competes with the app's own initial resource fetches.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed:', err));
  });
}
