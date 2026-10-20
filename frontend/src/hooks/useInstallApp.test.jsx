import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInstallApp } from './useInstallApp';
import { startInstallListener } from '../utils/installPrompt';

const offerInstall = (outcome = 'accepted') => {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
};
// jsdom lacks some of these, so they are defined rather than spied on.
const ua = (userAgent, platform = 'Win32', maxTouchPoints = 0) => {
  for (const [key, value] of Object.entries({ userAgent, platform, maxTouchPoints })) {
    Object.defineProperty(window.navigator, key, { configurable: true, get: () => value });
  }
};

beforeAll(() => startInstallListener());
afterEach(() => {
  window.dispatchEvent(new Event('appinstalled')); // forget any kept offer
  vi.restoreAllMocks();
  delete window.matchMedia;
});

// Day 72: "Install the app".
describe('useInstallApp', () => {
  it("nothing to offer until the browser offers it; then its own dialog, once", async () => {
    ua('Mozilla/5.0 (Windows NT 10.0) Chrome/130');
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.mode).toBeNull();
    let event;
    act(() => { event = offerInstall(); });
    expect(event.defaultPrevented).toBe(true); // no mini-infobar: the Menu offers it
    expect(result.current.mode).toBe('prompt');
    let outcome;
    await act(async () => { outcome = await result.current.install(); });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('accepted');
    expect(result.current.mode).toBeNull(); // the offer is used up
  });

  it('iPhone and iPad (no install event): how to add it from Safari', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1');
    expect(renderHook(() => useInstallApp()).result.current.mode).toBe('ios');
    ua('Mozilla/5.0 (Macintosh) Safari/605', 'MacIntel', 5); // iPadOS
    expect(renderHook(() => useInstallApp()).result.current.mode).toBe('ios');
  });

  it('already installed (running standalone): nothing to offer', () => {
    ua('Mozilla/5.0 (iPhone) Safari');
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const { result } = renderHook(() => useInstallApp());
    act(() => { offerInstall(); });
    expect(result.current.mode).toBeNull();
  });
});
