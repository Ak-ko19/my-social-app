import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import ActivityScreen from './ActivityScreen';
import { setLanguage } from '../i18n';
import AR from '../i18n/locales/ar.json';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
const at = '2026-10-09T10:00:00Z';
const LIKES = [
  { kind: 'post', reaction: 'love', created_at: at, comment_id: null, post_id: 4, post_content: 'Sunset', post_author: 'bob' },
  { kind: 'comment', reaction: null, created_at: at, comment_id: 9, comment_content: 'so true', comment_author: 'dana', post_id: 5, post_content: 'Coffee', post_author: 'bob' }
];
const COMMENTS = [{ id: 7, content: 'Great shot', created_at: at, is_reply: false, post_id: 4, post_content: 'Sunset', post_author: 'bob' }];
const SEARCHES = [{ id: 3, query: 'tea', searched_at: at }];

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.get.mockImplementation((url, opts) => {
    if (url === '/activity/likes') return Promise.resolve({ data: { items: LIKES, hasMore: opts.params.page === 1 } });
    if (url === '/activity/comments') return Promise.resolve({ data: { items: COMMENTS, hasMore: false } });
    if (url === '/search/history') return Promise.resolve({ data: SEARCHES });
    return Promise.reject(new Error(url));
  });
  api.delete.mockResolvedValue({ data: {} });
});
const show = (path = '/activity') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/activity" element={<ActivityScreen />} /></Routes>
  </MemoryRouter>
);

// Day 48: the activity log.
describe('Activity screen', () => {
  it('likes: reactions and comment likes, each removable, with load more', async () => {
    show();
    expect(await screen.findByRole('link', { name: "You reacted Love to bob's post" })).toHaveAttribute('href', '/posts/4');
    expect(screen.getByRole('link', { name: "You liked dana's comment" })).toBeInTheDocument();
    expect(screen.getByText('“so true”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Remove your reaction to bob's post" }));
    expect(api.delete).toHaveBeenCalledWith('/posts/4/like', H);
    await userEvent.click(screen.getByRole('button', { name: "Unlike dana's comment" }));
    expect(api.delete).toHaveBeenCalledWith('/comments/9/like', H);
    expect(screen.queryByRole('link', { name: /You liked dana/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(api.get).toHaveBeenCalledWith('/activity/likes', { ...H, params: { page: 2, limit: 20 } });
  });

  it('comments: delete asks first', async () => {
    show('/activity?tab=comments');
    expect(await screen.findByRole('link', { name: "You commented on bob's post" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Delete your comment on bob's post" }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(api.delete).toHaveBeenCalledWith('/comments/7', H);
    expect(await screen.findByText(/Your comments show up here/)).toBeInTheDocument();
  });

  it('searches: remove one, or clear all after asking', async () => {
    show('/activity?tab=searches');
    expect(await screen.findByRole('link', { name: 'tea' })).toHaveAttribute('href', '/search?q=tea');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all searches' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear' }));
    expect(api.delete).toHaveBeenCalledWith('/search/history', expect.anything());
    expect(await screen.findByText('No recent searches.')).toBeInTheDocument();
  });

  it('arrow keys move between tabs', async () => {
    show();
    const likes = await screen.findByRole('tab', { name: /Likes/ });
    likes.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Comments/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    const love = AR.reactions.love;
    expect(await screen.findByRole('link', { name: `تفاعلت بـ«${love}» مع منشور bob` })).toHaveAttribute('href', '/posts/4');
    expect(screen.getByRole('tab', { name: /الإعجابات/ })).toHaveAttribute('aria-selected', 'true');
  });
});
