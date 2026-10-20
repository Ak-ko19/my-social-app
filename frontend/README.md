# MySocialApp -- web app

React + Vite. How to run the whole app, and what everything is: the
[README at the top of the repo](../README.md).

```bash
npm install
cp .env.example .env   # VITE_API_URL: the backend, e.g. http://localhost:3000
npm run dev            # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm test` | Component tests (Vitest + Testing Library) |
| `npm run lint` | ESLint |
| `npm run check:i18n` | Every string in English and Arabic, no untranslated UI text, logical (RTL-safe) CSS |
| `npm run build` then `npm run check:bundle` | The production build, and the first-download size budget |
| `npm run check:headers` | `vercel.json`'s security headers (CSP and the rest), against a build |

Where things are: screens in `src/screens/` (and a few top-level ones in
`src/`), components in `src/components/<area>/`, data hooks in
`src/hooks/`, API calls in `src/services/`, translations in
`src/i18n/locales/` (UI languages: English and Arabic).
