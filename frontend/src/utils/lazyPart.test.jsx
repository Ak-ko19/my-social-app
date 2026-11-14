import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Component } from 'react';
import { lazyPart } from './lazyPart';
import { setLanguage } from '../i18n';

const CHUNK_FAILED = () => new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/src/components/feed/X.jsx');
const Part = ({ label }) => <p>{label}</p>;

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

class Outer extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <p>Outer caught: {this.state.error.message}</p> : this.props.children; }
}

beforeEach(async () => {
  await setLanguage('en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

// Days 114-115: parts of a screen that load on a tap (comments, the share
// sheet, the report dialog, the story viewer).
describe('lazyPart', () => {
  it('loads the part with its props, needing no Suspense around it', async () => {
    const Lazy = lazyPart(() => Promise.resolve({ default: Part }));
    render(<Lazy label="The comments" />);
    expect(await screen.findByText('The comments')).toBeInTheDocument();
  });

  it('offline: one line in place (no heading), then opens by itself when back online', async () => {
    setOnline(false);
    const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILED()).mockResolvedValue({ default: Part });
    const Lazy = lazyPart(load);
    render(<><h1>Home</h1><Lazy label="The comments" /></>);
    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline");
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(await screen.findByText('The comments')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('offline: Try again tries again', async () => {
    setOnline(false);
    const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILED()).mockResolvedValue({ default: Part });
    const Lazy = lazyPart(load);
    render(<Lazy label="The sheet" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The sheet')).toBeInTheDocument();
  });

  it('online: offers a reload, and Close when the part can be closed', async () => {
    const onClose = vi.fn();
    const Lazy = lazyPart(() => Promise.reject(CHUNK_FAILED()));
    render(<Lazy label="The sheet" onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('A new version is ready');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no Close button for a part without onClose', async () => {
    const Lazy = lazyPart(() => Promise.reject(CHUNK_FAILED()));
    render(<Lazy label="The comments" />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('any other crash still reaches the app error screen', async () => {
    const Broken = () => { throw new Error('boom'); };
    const Lazy = lazyPart(() => Promise.resolve({ default: Broken }));
    render(<Outer><Lazy /></Outer>);
    expect(await screen.findByText('Outer caught: boom')).toBeInTheDocument();
  });
});
