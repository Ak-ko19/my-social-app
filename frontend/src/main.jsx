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
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeProvider'
import { SocketProvider } from './context/SocketProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <SocketProvider>
        <App />
      </SocketProvider>
    </ThemeProvider>
  </StrictMode>,
)
