import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import api from '../api';
import { loadConfig } from './useEmailEnabled';
import { useFormGuard } from './useFormGuard';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./useEmailEnabled', () => ({ loadConfig: vi.fn() }));
vi.mock('./useTheme', () => ({ useTheme: () => ({ theme: 'dark' }) }));

const RELOAD = 'Please reload the page and try again.';
const NEEDED = 'Please complete the security check.';

// Renders the guard's honeypot (and widget box) like a form does, and hands
// the hook's result back to the test.
function mount(minMs) {
  const result = {};
  function Form() {
    Object.assign(result, useFormGuard(minMs));
    return <form>{result.honeypot}</form>;
  }
  const view = render(<Form />);
  return { result, ...view };
}

let tokens;
beforeEach(() => {
  tokens = 0;
  api.get.mockImplementation(async (url) => {
    if (url !== '/form-token') throw new Error(`unexpected GET ${url}`);
    tokens += 1;
    return { data: { token: `token-${tokens}` } };
  });
  api.post.mockResolvedValue({ data: 'ok' });
  loadConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: null });
  delete window.turnstile;
});

describe('useFormGuard', () => {
  it('login (no minimum): only the honeypot goes along; no token, no config', async () => {
    const { result } = mount(null);
    await act(() => result.guardedPost('/login', { email: 'a@b.co' }));
    expect(api.post).toHaveBeenCalledWith('/login', { email: 'a@b.co', website: '' });
    expect(api.get).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
  });

  it('renders a honeypot that people and screen readers never reach, and sends whatever a bot typed', async () => {
    const { result, container } = mount(null);
    const input = container.querySelector('input[name=website]');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(container.querySelector('.hp-field')).toHaveAttribute('aria-hidden', 'true');
    input.value = 'http://spam.example';
    await act(() => result.guardedPost('/login', {}));
    expect(api.post).toHaveBeenCalledWith('/login', { website: 'http://spam.example' });
  });

  it('fetches a form token when the form opens and waits out the minimum before sending', async () => {
    const { result } = mount(300);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    const started = Date.now();
    await act(() => result.guardedPost('/signup', { username: 'x' }));
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(api.post).toHaveBeenCalledWith('/signup', { username: 'x', website: '', formToken: 'token-1' });
  });

  it('a token that went stale is replaced once, quietly -- but not twice', async () => {
    const stale = { response: { status: 400, data: RELOAD } };
    api.post.mockRejectedValueOnce(stale).mockResolvedValueOnce({ data: 'ok' });
    const { result } = mount(0);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await act(() => result.guardedPost('/signup', {}));
    expect(api.post.mock.calls.map((c) => c[1].formToken)).toEqual(['token-1', 'token-2']);

    api.post.mockReset();
    api.post.mockRejectedValue(stale);
    await expect(result.guardedPost('/signup', {})).rejects.toBe(stale);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('other errors are passed straight on (no retry)', async () => {
    const taken = { response: { status: 400, data: 'Email or username already exists' } };
    api.post.mockRejectedValue(taken);
    const { result } = mount(0);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await expect(result.guardedPost('/signup', {})).rejects.toBe(taken);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('Turnstile off: Cloudflare\'s script is never added', async () => {
    mount(0);
    await waitFor(() => expect(loadConfig).toHaveBeenCalled());
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });

  it('Turnstile on: renders the widget; without a tick nothing is sent; with one the token goes along and is reset', async () => {
    loadConfig.mockResolvedValue({ turnstileSiteKey: 'site-key' });
    let options;
    window.turnstile = { render: vi.fn((el, o) => { options = o; return 'w1'; }), reset: vi.fn(), remove: vi.fn() };
    const { result, container } = mount(0);
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalled());
    expect(container.querySelector('.turnstile-box')).not.toBeNull();
    expect(options).toMatchObject({ sitekey: 'site-key', theme: 'dark' });

    await expect(result.guardedPost('/signup', {})).rejects.toMatchObject({ response: { status: 400, data: NEEDED } });
    expect(api.post).not.toHaveBeenCalled();

    act(() => options.callback('cf-token'));
    await act(() => result.guardedPost('/signup', {}));
    expect(api.post.mock.calls[0][1]).toMatchObject({ turnstileToken: 'cf-token' });
    expect(window.turnstile.reset).toHaveBeenCalledWith('w1');
    // Used up: the next attempt needs a new tick.
    await expect(result.guardedPost('/signup', {})).rejects.toMatchObject({ response: { data: NEEDED } });
  });
});
