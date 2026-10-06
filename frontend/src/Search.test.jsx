import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Search from './Search';
import { searchHashtags, searchPosts, searchUsers } from './services/searchService';

vi.mock('./services/searchService', () => ({ searchUsers: vi.fn(), searchPosts: vi.fn(), searchHashtags: vi.fn() }));
vi.mock('./hooks/useExplore', () => ({ useTrendingHashtags: () => ({ tags: [], loaded: true }) }));
vi.mock('./components/explore/PeopleYouMayKnow', () => ({ default: () => <p>suggestions</p> }));

// Day 42: search results with All / People / Posts / Hashtags tabs.
const person = (id, username) => ({ id, username, bio: null, avatar_url: null, is_following: false });
const USERS = [person(1, 'tea'), person(2, 'teashop'), person(3, 'tealover'), person(4, 'greentea')];
const TAGS = [{ tag: 'tea', post_count: 2, capped: false }, { tag: 'teatime', post_count: 500, capped: true }];
const post = (id, content) => ({ id, content, user_id: 9, username: 'bob', created_at: '2026-10-01T10:00:00Z', image_url: null, page: null });

beforeEach(() => {
  vi.clearAllMocks();
  searchUsers.mockResolvedValue(USERS);
  searchHashtags.mockResolvedValue(TAGS);
  searchPosts.mockImplementation((q, token, page = 1) => Promise.resolve(
    page === 1 ? { posts: [post(10, 'tea shop opened')], hasMore: true } : { posts: [post(11, 'older tea post')], hasMore: false }
  ));
});

function Location() {
  return <output data-testid="url">{useLocation().search}</output>;
}
const renderAt = (url = '/search') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/search" element={<><Search /><Location /></>} /></Routes>
  </MemoryRouter>
);
const box = () => screen.getByRole('searchbox', { name: 'Search people, posts or hashtags' });

describe('Search', () => {
  it('before searching: suggestions, no tabs; a search puts the query in the URL and shows All', async () => {
    renderAt();
    expect(screen.getByText('suggestions')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    await userEvent.type(box(), ' tea ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByTestId('url')).toHaveTextContent('?q=tea');
    expect(await screen.findByRole('tab', { name: 'All', selected: true })).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel');
    // Three people and a See all (there are four), both tags, the posts.
    const people = within(screen.getByRole('region', { name: 'People' })).getAllByRole('link').map((a) => a.textContent);
    expect(people).toEqual(['tea', 'teashop', 'tealover']);
    expect(within(panel).getByText('#teatime')).toBeInTheDocument();
    expect(within(panel).getByText('500+ posts')).toBeInTheDocument();
    expect(within(panel).getByText('2 posts')).toBeInTheDocument();
    expect(within(panel).getByText('tea shop opened')).toBeInTheDocument();
    expect(searchUsers).toHaveBeenCalledWith('tea', null);
  });

  it('See all opens the People tab with everyone, and the tab goes in the URL', async () => {
    renderAt('/search?q=tea');
    await userEvent.click(await screen.findByRole('button', { name: 'See all' }));
    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('url')).toHaveTextContent('?q=tea&type=people');
    expect(within(screen.getByRole('tabpanel')).getByText('greentea')).toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel')).queryByText('tea shop opened')).toBeNull();
  });

  it('a link to the Posts tab opens there; Load more adds the next page', async () => {
    renderAt('/search?q=tea&type=posts');
    expect(box()).toHaveValue('tea');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('older tea post')).toBeInTheDocument();
    expect(screen.getByText('tea shop opened')).toBeInTheDocument();
    expect(searchPosts).toHaveBeenLastCalledWith('tea', null, 2);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('the Hashtags tab says when nothing matches', async () => {
    searchHashtags.mockResolvedValue([]);
    renderAt('/search?q=tea&type=hashtags');
    expect(await screen.findByText('No matching hashtags.')).toBeInTheDocument();
  });

  it('a failed search offers Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    searchUsers.mockRejectedValueOnce(new Error('offline'));
    renderAt('/search?q=tea');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search failed');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('tea shop opened')).toBeInTheDocument();
  });

  it('just "#" searches people and posts without asking for tags', async () => {
    renderAt('/search?q=%23');
    await screen.findByRole('tab', { name: 'All', selected: true });
    await waitFor(() => expect(searchUsers).toHaveBeenCalled());
    expect(searchHashtags).not.toHaveBeenCalled();
  });

  it('a slow older search never replaces a newer one', async () => {
    let answerOld;
    searchUsers.mockImplementationOnce(() => new Promise((resolve) => { answerOld = resolve; }));
    renderAt();
    await userEvent.type(box(), 'old');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.clear(box());
    await userEvent.type(box(), 'new');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('tea shop opened')).toBeInTheDocument();
    answerOld([person(99, 'stale_result')]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('stale_result')).toBeNull();
    // ...and the newer results stay on screen.
    expect(screen.getByText('tea shop opened')).toBeInTheDocument();
  });
});
