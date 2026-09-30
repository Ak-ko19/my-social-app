import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { loadConfig } from './useEmailEnabled';
import { useTheme } from './useTheme';

// Day 11 bot protection, the browser side (see backend services/botProtection.js).
//
// - A honeypot input real users never see: a bot that fills in every field
//   fills this one too, and the server refuses the request.
// - For forms with a minimum fill time (minMs: signup, forgot password):
//   a signed form token is fetched when the form opens and sent with it.
//   If a fast person submits sooner than the server allows, we just wait
//   out the rest here, so they never see an error.
// - Same forms, only when the server has Turnstile keys (GET /config
//   turnstileSiteKey): Cloudflare's "are you human?" widget. Its script is
//   not even loaded otherwise.
const RELOAD = 'Please reload the page and try again.';
const TURNSTILE_NEEDED = 'Please complete the security check.';
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fetchToken() {
  return api.get('/form-token').then((res) => ({ token: res.data.token, receivedAt: Date.now() }));
}

let turnstileScript = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        turnstileScript = null;
        reject(new Error('Turnstile failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return turnstileScript;
}

// Rejects like a failed API call, so screens show it with serverErrorText.
const needCheck = () => Promise.reject(Object.assign(new Error(TURNSTILE_NEEDED), { response: { status: 400, data: TURNSTILE_NEEDED } }));

export function useFormGuard(minMs = null) {
  const honeypotRef = useRef(null);
  const tokenRef = useRef(null); // a promise of { token, receivedAt }
  const widgetBoxRef = useRef(null);
  const widgetRef = useRef(null); // Turnstile widget id
  const turnstileTokenRef = useRef('');
  const [siteKey, setSiteKey] = useState(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (minMs === null) return undefined;
    const pending = fetchToken();
    pending.catch(() => {}); // retried on submit
    tokenRef.current = pending;
    let active = true;
    loadConfig().then((config) => {
      if (active && config?.turnstileSiteKey) setSiteKey(config.turnstileSiteKey);
    });
    return () => {
      active = false;
    };
  }, [minMs]);

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !widgetBoxRef.current) return;
        widgetRef.current = turnstile.render(widgetBoxRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => { turnstileTokenRef.current = token; },
          'expired-callback': () => { turnstileTokenRef.current = ''; },
          'error-callback': () => { turnstileTokenRef.current = ''; }
        });
      })
      // Script blocked or offline: the server still asks for the check, so
      // the person sees "complete the security check" on submit.
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widgetRef.current !== null && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
      turnstileTokenRef.current = '';
    };
  }, [siteKey, theme]);

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
    const fields = { website, formToken: entry.token };
    if (siteKey) fields.turnstileToken = turnstileTokenRef.current;
    return fields;
  }

  // A Turnstile token works once: after any attempt, get a fresh one.
  function resetTurnstile() {
    turnstileTokenRef.current = '';
    if (widgetRef.current !== null && window.turnstile) window.turnstile.reset(widgetRef.current);
  }

  async function post(url, body) {
    if (siteKey && !turnstileTokenRef.current) return needCheck();
    try {
      return await api.post(url, { ...body, ...(await guardFields()) });
    } finally {
      if (siteKey) resetTurnstile();
    }
  }

  // api.post with the guard fields added. A token that expired while the
  // tab sat open (the server's "reload" answer) is replaced once, quietly --
  // unless Turnstile is on, where the person has to tick the box again.
  async function guardedPost(url, body) {
    try {
      return await post(url, body);
    } catch (err) {
      if (minMs === null || siteKey || err.response?.status !== 400 || err.response?.data !== RELOAD) throw err;
      tokenRef.current = fetchToken();
      return post(url, body);
    }
  }

  // Clipped rather than display:none (some bots skip hidden inputs);
  // aria-hidden and tabIndex -1 keep it away from screen readers and the
  // keyboard, autoComplete off from autofill.
  const honeypot = (
    <>
      <div className="hp-field" aria-hidden="true">
        <label>
          Website
          <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {siteKey && <div className="turnstile-box" ref={widgetBoxRef} />}
    </>
  );

  return { honeypot, guardedPost };
}
