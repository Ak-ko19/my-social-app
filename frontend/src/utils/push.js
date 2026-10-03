import api from '../api';

// Day 22: web push on this device (backend services/pushService.js; the
// notifications themselves are shown by public/sw.js). Push needs the
// service worker, which only registers in production builds -- in
// `vite dev` the switch simply isn't offered.

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// The server's VAPID public key, or null when push is off there.
export async function fetchPushKey() {
  try {
    return (await api.get('/push/config')).data.publicKey || null;
  } catch {
    return null;
  }
}

function keyBytes(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const sameKey = (buffer, bytes) => {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

async function registration() {
  return pushSupported() ? navigator.serviceWorker.getRegistration() : null;
}

// This browser's subscription, or null.
export async function currentSubscription() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// Asks for permission, subscribes and tells the server. Rejects with
// err.code 'denied' | 'default' (permission not given) or 'unavailable'.
export async function enablePush(publicKey, token) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Object.assign(new Error('Notifications not allowed'), { code: permission });
  const reg = await registration();
  if (!reg) throw Object.assign(new Error('No service worker'), { code: 'unavailable' });
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Made for another server key (keys were rotated): start again.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/push/subscribe', sub.toJSON(), authHeaders(token));
  return sub;
}

// Stops push on this device (server first, best effort, then the browser).
export async function disablePush(token) {
  const sub = await currentSubscription();
  if (!sub) return;
  if (token) {
    await api.delete('/push/subscribe', { ...authHeaders(token), data: { endpoint: sub.endpoint } }).catch(() => {});
  }
  await sub.unsubscribe();
}
