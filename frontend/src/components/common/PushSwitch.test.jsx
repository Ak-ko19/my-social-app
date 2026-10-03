import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../api';
import PushSwitch from './PushSwitch';

vi.mock('../../api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok' }) }));

// Day 22. jsdom has no push, so a fake browser is put together per test:
// a service worker registration with a PushManager, and Notification.
const SERVER_KEY = 'BLRIMTfeudOQjnzatvruLB6C1PzbNn8xREqQRiouqQqaOEfyqik2__ZgaVbRCw2MGb33WDCl84U7jm-pTIviksA';
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(88, '=')), (c) => c.charCodeAt(0));

let pushManager;
let permission;
const makeSub = (key) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  options: { applicationServerKey: keyBytes(key).buffer },
  toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => { pushManager.current = null; return true; })
});

beforeEach(() => {
  permission = 'default';
  pushManager = {
    current: null,
    getSubscription: vi.fn(async () => pushManager.current),
    subscribe: vi.fn(async (opts) => { pushManager.current = makeSub(SERVER_KEY); pushManager.lastOptions = opts; return pushManager.current; })
  };
  window.PushManager = function PushManager() {};
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ pushManager }) } });
  window.Notification = { get permission() { return permission; }, requestPermission: vi.fn(async () => { permission = 'granted'; return permission; }) };
  api.get.mockResolvedValue({ data: { publicKey: SERVER_KEY } });
  api.post.mockResolvedValue({ data: { ok: true } });
  api.delete.mockResolvedValue({});
});
afterEach(() => {
  delete window.PushManager;
  delete window.Notification;
  delete navigator.serviceWorker;
});

describe('PushSwitch', () => {
  it('turns push on: asks permission, subscribes with the server key, tells the server', async () => {
    render(<PushSwitch />);
    const sw = await screen.findByRole('switch', { name: 'Push notifications on this device' });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    expect(window.Notification.requestPermission).toHaveBeenCalled();
    expect(pushManager.lastOptions.userVisibleOnly).toBe(true);
    expect(Array.from(pushManager.lastOptions.applicationServerKey)).toEqual(Array.from(keyBytes(SERVER_KEY)));
    expect(api.post).toHaveBeenCalledWith('/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }, { headers: { Authorization: 'Bearer tok' } });
  });

  it('turns push off: the server forgets this device, then the browser unsubscribes', async () => {
    permission = 'granted';
    pushManager.current = makeSub(SERVER_KEY);
    const sub = pushManager.current;
    render(<PushSwitch />);
    const sw = await screen.findByRole('switch');
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    expect(api.delete).toHaveBeenCalledWith('/push/subscribe', { headers: { Authorization: 'Bearer tok' }, data: { endpoint: sub.endpoint } });
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('notifications blocked for the site: says so, no switch', async () => {
    window.Notification.requestPermission = vi.fn(async () => { permission = 'denied'; return 'denied'; });
    render(<PushSwitch />);
    await userEvent.click(await screen.findByRole('switch'));
    expect(await screen.findByText(/Notifications are blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a subscription made for an old server key is replaced', async () => {
    permission = 'granted';
    const old = makeSub('BOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOldKeyBOlA');
    pushManager.current = old;
    // currently "off" for this server's key? It's on (a subscription exists): turn off and on again.
    render(<PushSwitch />);
    const sw = await screen.findByRole('switch');
    await waitFor(() => expect(sw).toBeEnabled());
    await userEvent.click(sw); // off
    pushManager.current = old; // the browser still had the old one
    old.unsubscribe.mockClear();
    await userEvent.click(sw); // on
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
  });

  it('nothing at all when the server has no push keys', async () => {
    api.get.mockResolvedValue({ data: { publicKey: null } });
    const { container } = render(<PushSwitch />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/push/config'));
    expect(container).toBeEmptyDOMElement();
  });

  it('nothing at all in a browser without push', () => {
    delete window.PushManager;
    const { container } = render(<PushSwitch />);
    expect(container).toBeEmptyDOMElement();
  });
});
