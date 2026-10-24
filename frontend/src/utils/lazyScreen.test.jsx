import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Component, Suspense } from 'react';
import { lazyScreen } from './lazyScreen';
import { isChunkLoadError } from './chunkError';
import { setLanguage } from '../i18n';

const CHUNK_FAILED = () => new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/src/screens/X.jsx');
const Hello = () => <p>The screen</p>;

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

class Outer extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <p>Outer caught: {this.state.error.message}</p> : this.props.children; }
}

const show = (Screen) => render(<Outer><Suspense fallback={<p>Loading</p>}><Screen /></Suspense></Outer>);

beforeEach(async () => {
  await setLanguage('en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

// Day 80: a screen whose code can't be downloaded.
describe('lazyScreen', () => {
  it('offline: says so, then opens the screen by itself when the connection is back', async () => {
    setOnline(false);
    const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILED()).mockResolvedValue({ default: Hello });
    show(lazyScreen(load));
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This screen will open as soon as you\'re back online.');
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(await screen.findByText('The screen')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('offline: Try again tries again', async () => {
    setOnline(false);
    const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILED()).mockResolvedValue({ default: Hello });
    show(lazyScreen(load));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The screen')).toBeInTheDocument();
  });

  it('online: a new version is out, so it offers a reload', async () => {
    const load = vi.fn().mockRejectedValue(CHUNK_FAILED());
    show(lazyScreen(load));
    expect(await screen.findByRole('heading', { name: 'A new version is ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('any other crash still reaches the app error screen', async () => {
    const Broken = () => { throw new Error('boom'); };
    show(lazyScreen(() => Promise.resolve({ default: Broken })));
    expect(await screen.findByText('Outer caught: boom')).toBeInTheDocument();
  });

  it('knows a failed download from other errors', () => {
    expect(isChunkLoadError(CHUNK_FAILED())).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
