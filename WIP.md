# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 3 — Startup safety + small bugs
**Step:** 2 — Add security headers on the frontend (Vercel config).

## Done this Day
- Step 1 DONE (`5283798`): startup env check + PORT.

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include: after deploy, a rate-limit
  check from two networks (wrong logins on one must not lock the other),
  the only way to confirm Render's one-hop proxy setting.

## Plan
- `frontend/vercel.json`, for every path:
  - Content-Security-Policy:
    - default-src 'self'
    - script-src 'self' + sha256 of index.html's inline theme script
    - style-src 'self' https://fonts.googleapis.com
    - font-src 'self' https://fonts.gstatic.com
    - img-src 'self' data: blob: https://res.cloudinary.com
    - media-src 'self' blob: https://res.cloudinary.com
    - connect-src 'self' + API origin over https AND wss
    - worker-src 'self'; manifest-src 'self'; object-src 'none'
    - base-uri 'self'; form-action 'self'; frame-ancestors 'none'
    - upgrade-insecure-requests
  - X-Frame-Options DENY, X-Content-Type-Options nosniff,
    Referrer-Policy strict-origin-when-cross-origin,
    Permissions-Policy (microphone=(self) for voice; camera, geolocation,
    payment, usb off), Cross-Origin-Opener-Policy same-origin.
  - HSTS: Vercel already sends it on every deployment; not duplicated.
- Checked the bundle: no eval/new Function. motion's runtime <style>
  (popLayout) only in dead LikeButton.jsx → not used at runtime.
- `frontend/scripts/check-headers.cjs` (`npm run check:headers`, in CI
  after build): the CSP hash matches the built inline script(s), the
  connect-src has the .env.production API origin (https + wss), all
  headers present.
- Test the REAL production build with the REAL headers:
  - `e2e/serve-dist.cjs`: static server for frontend/dist applying
    vercel.json's headers and SPA rewrite; the only change is swapping
    the production API origin in connect-src for the local API.
  - `e2e-up.sh` gains `E2E_FRONTEND=dist` (build with local API URL,
    serve dist on :5173). Default unchanged (vite dev).
  - Run the full browser suite in dist mode: CSP violations surface as
    console errors, which fail every suite.
- Also check at the server level with curl that each header is sent.

## Progress
- [x] vercel.json headers
- [x] check-headers script + CI (mutation-checked: stale hash, missing wss)
- [x] Found + fixed a production trap: git stores index.html as LF but
  Windows checks it out CRLF, so a hash computed locally would be wrong on
  Vercel. frontend/.gitattributes pins index.html to LF; check:headers
  fails on CRLF.
- [x] serve-dist + e2e-up dist mode; positive control (broken hash →
  b9 fails with the CSP violation) proves violations are caught
- [x] FULL browser suite on the production build with real headers:
  ALL PASSED (20 suites / 321 checks + A3 222x3), 0 CSP violations
- [x] lint, check:i18n, build, check:headers green
- STEP 2 DONE

## Next step plan notes (Day 3 step 3, from read-only prep)
- Audit Low bugs left: #10 (upload failure → 400 + raw provider text) and
  #11 (PostCard linkPreview.url scheme). #12 = step 2.
- server.js's final error handler answers EVERY error with 400 +
  err.message. Callers: multer rejections (client errors, fine),
  Cloudinary failures (should be 502 + generic text), CORS rejection.
- Upload rejection messages ("Only JPEG…", "File too large", "You can
  attach up to 10 images") have no MY/AR entries in serverMessages.js.
