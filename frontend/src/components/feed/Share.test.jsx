import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../../api';
import PostCard from './PostCard';
import { setLanguage } from '../../i18n';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1, username: 'me' }) }));
vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  resolveImageUrl: (url) => url
}));

const now = new Date().toISOString();
const post = (extra) => ({ id: 7, user_id: 2, username: 'bob', content: 'Saturday hike', created_at: now, like_count: 0, reaction_counts: {}, can_share: true, share_count: 0, is_share: false, shared_post: null, ...extra });
const original = { id: 3, content: 'Sunset at Inle', created_at: now, user_id: 5, username: 'ana', avatar_url: null, page: null, media: [] };
const renderCard = (p) => render(<MemoryRouter><PostCard post={p} /></MemoryRouter>);

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  await setLanguage('en');
});

// Days 93-94: sharing a post to your own feed.
describe('sharing a post', () => {
  it('Share offers Share now, Write post and Copy link; Share now shares at once and counts it', async () => {
    api.post.mockResolvedValue({ data: { id: 50, is_share: true } });
    const { container } = renderCard(post({ share_count: 1 }));
    expect(container.querySelector('.post-card-stats').textContent).toContain('1 share');
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Share now (Public)', 'Write post', 'Copy link']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Share now (Public)' }));
    await screen.findByText('Shared!');
    expect(api.post).toHaveBeenCalledWith('/posts/7/share', { content: '', visibility: 'public' }, { headers: { Authorization: 'Bearer tok' } });
    expect(container.querySelector('.post-card-stats').textContent).toContain('2 shares');
  });

  it('Write post: your words and an audience, with the post shown', async () => {
    api.post.mockResolvedValue({ data: { id: 51, is_share: true } });
    renderCard(post());
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Write post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share post' });
    expect(within(dialog).getByText('Saturday hike')).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Say something about this (optional)'), 'Come along!');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Followers' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share' }));
    await screen.findByText('Shared!');
    expect(api.post).toHaveBeenCalledWith('/posts/7/share', { content: 'Come along!', visibility: 'followers' }, expect.anything());
    expect(screen.queryByRole('dialog', { name: 'Share post' })).toBeNull();
  });

  it("the server's refusal is shown in the dialog, which stays open", async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: 'Only posts that everyone can see can be shared.' } });
    renderCard(post());
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Write post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share post' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Only posts that everyone can see can be shared.');
  });

  it('a post not open to everyone: only the link is offered', async () => {
    renderCard(post({ can_share: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Copy link']);
  });

  it('a share shows the post it shares, which opens the original', () => {
    renderCard(post({ is_share: true, content: 'Look!', shared_post: original }));
    const shared = screen.getByRole('region', { name: 'Shared post by ana' });
    expect(within(shared).getByText('Sunset at Inle')).toBeTruthy();
    expect(within(shared).getByRole('link').getAttribute('href')).toBe('/posts/3');
  });

  it("a share whose original isn't available says so", () => {
    renderCard(post({ is_share: true, content: '', shared_post: null, can_share: false }));
    expect(screen.getByText("This content isn't available right now")).toBeTruthy();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    const { container } = renderCard(post({ share_count: 2, is_share: true, content: '', shared_post: null }));
    expect(container.querySelector('.post-card-stats').textContent).toContain('مشاركتان');
    expect(screen.getByText('هذا المحتوى غير متاح الآن')).toBeTruthy();
  });
});
