import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FeedErrorState from './FeedErrorState';
import TrendingHashtags from '../explore/TrendingHashtags';
import { setLanguage } from '../../i18n';

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(async () => {
  await setLanguage('en');
});
afterEach(() => setOnline(true));

// Day 80: failed loads.
describe('FeedErrorState', () => {
  it("online: the screen's own message and Try again", () => {
    const retry = vi.fn();
    render(<FeedErrorState message="Failed to load feed" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load feed');
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offline: says so, and tries again by itself when the connection is back', async () => {
    setOnline(false);
    const retry = vi.fn();
    render(<FeedErrorState message="Failed to load feed" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline. This will load as soon as you're back online.");
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load feed');
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    setOnline(false);
    render(<FeedErrorState message="x" onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('أنت غير متصل بالإنترنت');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });
});

describe('TrendingHashtags', () => {
  const show = (props) => render(<MemoryRouter><TrendingHashtags tags={[]} loaded {...props} /></MemoryRouter>);

  it('nothing trending is said honestly', () => {
    show({});
    expect(screen.getByText('Nothing trending yet this week.')).toBeInTheDocument();
  });

  it('a failed load is not "nothing trending": it says so, with Try again', () => {
    const retry = vi.fn();
    show({ failed: true, onRetry: retry });
    expect(screen.queryByText('Nothing trending yet this week.')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load what's trending.");
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
