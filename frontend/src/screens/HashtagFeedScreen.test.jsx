import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import HashtagFeedScreen from './HashtagFeedScreen';
import { fetchHashtag, fetchPostsByHashtag, followHashtag, unfollowHashtag } from '../services/hashtagService';
import { setLanguage } from '../i18n';

vi.mock('../services/hashtagService', () => ({ fetchPostsByHashtag: vi.fn(), fetchHashtag: vi.fn(), followHashtag: vi.fn(), unfollowHashtag: vi.fn() }));
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

// Days 107-108: Follow / Following (only when logged in).
describe('HashtagFeedScreen follow', () => {
  beforeEach(async () => {
    for (const fn of [fetchHashtag, followHashtag, unfollowHashtag]) fn.mockReset();
    localStorage.clear();
    await setLanguage('en');
  });

  it('is not offered when logged out', async () => {
    renderAt('/hashtag/tea');
    await screen.findByText('most liked');
    expect(fetchHashtag).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
  });

  it('follows and unfollows, saying what following does; a refusal shows its words', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('userId', '5');
    fetchHashtag.mockResolvedValue({ tag: 'tea', is_following: false });
    followHashtag.mockResolvedValueOnce({ tag: 'tea', is_following: true }).mockRejectedValueOnce({ response: { status: 400, data: 'You can follow up to 200 hashtags.' } });
    unfollowHashtag.mockResolvedValue({ tag: 'tea', is_following: false });
    renderAt('/hashtag/tea');
    const follow = await screen.findByRole('button', { name: 'Follow' });
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(follow);
    expect(followHashtag).toHaveBeenCalledWith('tea', 'tok');
    const following = await screen.findByRole('button', { name: 'Following' });
    expect(following).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Public posts with this hashtag show up on your Home.')).toBeInTheDocument();
    await userEvent.click(following);
    expect(unfollowHashtag).toHaveBeenCalledWith('tea', 'tok');
    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can follow up to 200 hashtags.');
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
  });
});
