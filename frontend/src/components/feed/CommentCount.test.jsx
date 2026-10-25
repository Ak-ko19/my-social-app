import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const post = (extra) => ({ id: 7, user_id: 2, username: 'bob', content: 'Saturday hike', created_at: new Date().toISOString(), like_count: 0, reaction_counts: {}, ...extra });
const comment = (id) => ({ id, user_id: 2, username: 'bob', content: `comment ${id}`, created_at: new Date().toISOString(), parent_comment_id: null, like_count: 0, liked_by_me: false });
const stats = (container) => container.querySelector('.post-card-stats').textContent;

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  await setLanguage('en');
});

// Day 85: the comment count on the card, before the comments are opened.
describe('comment count on a post card', () => {
  it('says how many before they are opened', () => {
    const { container } = render(<MemoryRouter><PostCard post={post({ comment_count: 12 })} /></MemoryRouter>);
    expect(stats(container)).toContain('12 comments');
  });

  it('one is "1 comment", none says nothing', () => {
    const one = render(<MemoryRouter><PostCard post={post({ comment_count: 1 })} /></MemoryRouter>);
    expect(stats(one.container)).toContain('1 comment');
    one.unmount();
    const none = render(<MemoryRouter><PostCard post={post({ comment_count: 0 })} /></MemoryRouter>);
    expect(stats(none.container)).not.toMatch(/comment/i);
  });

  it('once opened and all loaded, the list is the count (with one just added)', async () => {
    api.get.mockResolvedValue({ data: { comments: [comment(1), comment(2)], nextCursor: null } });
    api.post.mockResolvedValue({ data: comment(3) });
    const { container } = render(<MemoryRouter><PostCard post={post({ comment_count: 2 })} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await screen.findByText('comment 2');
    expect(stats(container)).toContain('2 comments');
    await userEvent.type(screen.getByRole('textbox', { name: /comment/i }), 'third');
    await userEvent.keyboard('{Enter}');
    await screen.findByText('comment 3');
    expect(stats(container)).toContain('3 comments');
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    const { container } = render(<MemoryRouter><PostCard post={post({ comment_count: 2 })} /></MemoryRouter>);
    expect(stats(container)).toContain('تعليقان');
  });
});
