import { useEffect, useRef } from 'react';
import api from '../api';

// Day 11 bot protection, the browser side (see backend services/botProtection.js).
//
// - A honeypot input real users never see: a bot that fills in every field
//   fills this one too, and the server refuses the request.
// - For forms with a minimum fill time (minMs: signup, forgot password):
//   a signed form token is fetched when the form opens and sent with it.
//   If a fast person submits sooner than the server allows, we just wait
//   out the rest here, so they never see an error.
const RELOAD = 'Please reload the page and try again.';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fetchToken() {
  return api.get('/form-token').then((res) => ({ token: res.data.token, receivedAt: Date.now() }));
}

export function useFormGuard(minMs = null) {
  const honeypotRef = useRef(null);
  const tokenRef = useRef(null); // a promise of { token, receivedAt }

  useEffect(() => {
    if (minMs === null) return;
    const pending = fetchToken();
    pending.catch(() => {}); // retried on submit
    tokenRef.current = pending;
  }, [minMs]);

  async function guardFields() {
    const website = honeypotRef.current?.value || '';
    if (minMs === null) return { website };
    let entry;
    try {
      entry = await tokenRef.current;
    } catch {
      entry = null;
    }
    if (!entry) {
      tokenRef.current = fetchToken();
      entry = await tokenRef.current;
    }
    // receivedAt is after the server stamped the token, so waiting minMs
    // from it (plus a little) always satisfies the server's minimum.
    const wait = entry.receivedAt + minMs + 100 - Date.now();
    if (wait > 0) await sleep(wait);
    return { website, formToken: entry.token };
  }

  // api.post with the guard fields added. A token that expired while the
  // tab sat open (the server's "reload" answer) is replaced once, quietly.
  async function guardedPost(url, body) {
    try {
      return await api.post(url, { ...body, ...(await guardFields()) });
    } catch (err) {
      if (minMs === null || err.response?.status !== 400 || err.response?.data !== RELOAD) throw err;
      tokenRef.current = fetchToken();
      return api.post(url, { ...body, ...(await guardFields()) });
    }
  }

  // Clipped rather than display:none (some bots skip hidden inputs);
  // aria-hidden and tabIndex -1 keep it away from screen readers and the
  // keyboard, autoComplete off from autofill.
  const honeypot = (
    <div className="hp-field" aria-hidden="true">
      <label>
        Website
        <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );

  return { honeypot, guardedPost };
}
