import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import PagesScreen from './PagesScreen';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
const pg = (id, name, extra = {}) => ({ id, name, category: 'business', follower_count: 1, is_following: false, is_owner: false, is_admin: false, ...extra });

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url, opts) => {
    const { section, page } = opts.params;
    if (section === 'owned') return Promise.resolve({ data: { pages: [pg(3, 'Run C', { is_admin: true })], page, hasMore: false } });
    if (section === 'discover') return Promise.resolve({ data: { pages: [pg(13, 'Other C')], page, hasMore: false } });
    return Promise.resolve({
      data: {
        owned: [pg(1, 'Run A', { is_owner: true, is_admin: true }), pg(2, 'Run B', { is_admin: true })], ownedHasMore: true,
        following: [pg(5, 'Liked A', { is_following: true })], followingHasMore: false,
        discover: [pg(11, 'Other A'), pg(12, 'Other B')], discoverHasMore: true
      }
    });
  });
});

// Day 53: pages you run (as owner or admin), follow, and the rest -- each
// loads a page at a time.
describe('Pages screen paging', () => {
  it('Load more under a section adds its next page; no Follow on pages you run', async () => {
    render(<MemoryRouter><PagesScreen /></MemoryRouter>);
    expect(await screen.findByText('Run B')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Follow Run B' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Follow Other A' })).toBeInTheDocument();
    const [moreRun, moreOthers] = screen.getAllByRole('button', { name: 'Load more' });
    await userEvent.click(moreRun);
    expect(await screen.findByText('Run C')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/pages', { ...H, params: { section: 'owned', page: 2 } });
    await userEvent.click(moreOthers);
    expect(await screen.findByText('Other C')).toBeInTheDocument();
    expect(screen.getByText('Run A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
