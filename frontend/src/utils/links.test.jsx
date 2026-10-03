import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import { displayHost, firstLink, trimLink } from './links';
import { renderTextWithLinks } from './renderTextWithLinks';
import LinkPreviewCard from '../components/common/LinkPreviewCard';
import { clearLinkPreviewCache } from '../hooks/useLinkPreview';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

describe('link helpers (Day 19)', () => {
  it('trims sentence punctuation and unmatched closing brackets', () => {
    expect(trimLink('https://x.com/a.')).toBe('https://x.com/a');
    expect(trimLink('https://x.com/a?!')).toBe('https://x.com/a');
    expect(trimLink('https://x.com/a)')).toBe('https://x.com/a');
    expect(trimLink('https://en.wikipedia.org/wiki/Rust_(language)')).toBe('https://en.wikipedia.org/wiki/Rust_(language)');
    expect(trimLink('https://x.com/a).')).toBe('https://x.com/a');
  });

  it('finds the first safe link', () => {
    expect(firstLink('see (https://example.com/page). and http://two.example')).toBe('https://example.com/page');
    expect(firstLink('ကြည့်ပါ https://example.com/မြန်မာ ပါ')).toBe('https://example.com/%E1%80%99%E1%80%BC%E1%80%94%E1%80%BA%E1%80%99%E1%80%AC');
    expect(firstLink('no links here, javascript:alert(1), www.example.com')).toBeNull();
    expect(firstLink(null)).toBeNull();
  });

  it('shows hosts without www.', () => {
    expect(displayHost('https://www.example.com/a')).toBe('example.com');
    expect(displayHost('nope')).toBe('');
  });
});

describe('renderTextWithLinks', () => {
  const renderText = (text, opts) => render(<MemoryRouter><p>{renderTextWithLinks(text, opts)}</p></MemoryRouter>);

  it('turns web links into safe external links, punctuation outside', () => {
    renderText('Read https://example.com/a#part, then #news @bob');
    const link = screen.getByRole('link', { name: 'https://example.com/a#part' });
    expect(link).toHaveAttribute('href', 'https://example.com/a#part');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    // the URL's #fragment is not a hashtag; the real one still is
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://example.com/a#part', '/hashtag/news', '/profile/bob']);
    expect(document.querySelector('p').textContent).toBe('Read https://example.com/a#part, then #news @bob');
  });

  it('never links a javascript: URL', () => {
    renderText('javascript:alert(1) and data:text/html,x');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('messages: links only, no hashtags or mentions', () => {
    renderText('https://example.com #tag @bob', { tags: false });
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://example.com/']);
  });
});

describe('LinkPreviewCard', () => {
  beforeEach(() => clearLinkPreviewCache());

  it('shows site, title and description from the server, with no image', async () => {
    api.get.mockResolvedValue({ status: 200, data: { url: 'https://example.com/a', title: 'Example title', description: 'About it', siteName: null } });
    render(<LinkPreviewCard url="https://example.com/a" />);
    const card = await screen.findByRole('link');
    expect(card).toHaveAttribute('href', 'https://example.com/a');
    expect(card).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    expect(card).toHaveTextContent('example.com');
    expect(card).toHaveTextContent('Example title');
    expect(card).toHaveTextContent('About it');
    expect(card.querySelector('img')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/link-preview', { params: { url: 'https://example.com/a' }, headers: { Authorization: 'Bearer tok' } });
  });

  it('nothing to show (204) -> no card at all', async () => {
    api.get.mockResolvedValue({ status: 204, data: '' });
    const { container } = render(<LinkPreviewCard url="https://example.com/b" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('the same link shown twice asks the server once', async () => {
    api.get.mockResolvedValue({ status: 200, data: { url: 'https://example.com/c', title: 'C' } });
    render(<><LinkPreviewCard url="https://example.com/c" /><LinkPreviewCard url="https://example.com/c" /></>);
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('a server answer with an unsafe URL is not rendered', async () => {
    api.get.mockResolvedValue({ status: 200, data: { url: 'javascript:alert(1)', title: 'X' } });
    const { container } = render(<LinkPreviewCard url="https://example.com/d" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
