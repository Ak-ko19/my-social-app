import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import HashtagFeedScreen from './HashtagFeedScreen';
import { fetchPostsByHashtag } from '../services/hashtagService';

vi.mock('../services/hashtagService', () => ({ fetchPostsByHashtag: vi.fn() }));
vi.mock('../components/feed/FeedList', () => ({
  default: ({ posts }) => <ul>{posts.map((p) => <li key={p.id}>{p.content}</li>)}</ul>
}));

// Day 40: a hashtag page's Top / Recent tabs.
const POSTS = {
  top: [{ id: 1, content: 'most liked' }, { id: 2, content: 'newest' }],
  recent: [{ id: 2, content: 'newest' }, { id: 1, content: 'most liked' }]
};

beforeEach(() => {
  fetchPostsByHashtag.mockImplementation((tag, token, { sort }) => Promise.resolve({ posts: POSTS[sort], hasMore: false }));
});

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}
const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/hashtag/:tag" element={<><HashtagFeedScreen /><Search /></>} /></Routes>
  </MemoryRouter>
);
const items = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('HashtagFeedScreen tabs', () => {
  it('opens on Top', async () => {
    renderAt('/hashtag/tea');
    expect(await screen.findByText('most liked')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
    expect(fetchPostsByHashtag).toHaveBeenCalledWith('tea', null, expect.objectContaining({ sort: 'top', page: 1 }));
    expect(items()).toEqual(['most liked', 'newest']);
  });

  it('Recent loads the newest first and goes in the URL', async () => {
    renderAt('/hashtag/tea');
    await screen.findByText('most liked');
    let answer;
    fetchPostsByHashtag.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    await userEvent.click(screen.getByRole('tab', { name: 'Recent' }));
    expect(screen.getByRole('tab', { name: 'Recent' })).toHaveAttribute('aria-selected', 'true');
    // While Recent loads, Top's posts are not left showing under it.
    expect(screen.queryAllByRole('listitem')).toEqual([]);
    answer({ posts: POSTS.recent, hasMore: false });
    await screen.findAllByRole('listitem');
    expect(items()).toEqual(['newest', 'most liked']);
    expect(fetchPostsByHashtag).toHaveBeenLastCalledWith('tea', null, expect.objectContaining({ sort: 'recent' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?sort=recent');
  });

  it('?sort=recent opens on Recent; arrow keys move between the tabs', async () => {
    renderAt('/hashtag/tea?sort=recent');
    await screen.findAllByRole('listitem');
    expect(items()).toEqual(['newest', 'most liked']);
    screen.getByRole('tab', { name: 'Recent' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
  });
});
