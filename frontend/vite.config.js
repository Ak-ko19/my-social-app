import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Day 24: fonts are always separate files, never inlined as data: URIs
    // (the CSP's font-src is 'self' only; see vercel.json).
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined),
  },
  // Day 13: component and unit tests (Vitest + React Testing Library).
  // `npm test`; the browser suites in ../e2e cover whole flows.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
})
