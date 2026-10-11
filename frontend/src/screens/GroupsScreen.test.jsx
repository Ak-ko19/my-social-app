import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import GroupsScreen from './GroupsScreen';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
const group = (id, name, mine) => ({ id, name, privacy: 'public', member_count: 1, my_status: mine ? 'member' : null, my_role: mine ? 'member' : null });

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url, opts) => {
    const { section, page } = opts.params;
    if (section === 'mine') return Promise.resolve({ data: { groups: [group(3, 'Mine C', true)], page, hasMore: false } });
    if (section === 'discover') return Promise.resolve({ data: { groups: [group(13, 'Other C')], page, hasMore: false } });
    return Promise.resolve({
      data: {
        mine: [group(1, 'Mine A', true), group(2, 'Mine B', true)], mineHasMore: true,
        discover: [group(11, 'Other A'), group(12, 'Other B')], discoverHasMore: true
      }
    });
  });
});

// Day 50: your groups and the others each load a page at a time.
describe('Groups screen paging', () => {
  it('Load more under each section adds its next page', async () => {
    render(<MemoryRouter><GroupsScreen /></MemoryRouter>);
    expect(await screen.findByText('Mine A')).toBeInTheDocument();
    const [moreMine, moreOthers] = screen.getAllByRole('button', { name: 'Load more' });
    await userEvent.click(moreMine);
    expect(await screen.findByText('Mine C')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/communities', { ...H, params: { section: 'mine', page: 2 } });
    await userEvent.click(moreOthers);
    expect(await screen.findByText('Other C')).toBeInTheDocument();
    expect(screen.getByText('Mine A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('searching starts both sections over, and pages the search', async () => {
    render(<MemoryRouter><GroupsScreen /></MemoryRouter>);
    await screen.findByText('Mine A');
    await userEvent.type(screen.getByRole('searchbox'), 'run');
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/communities', { ...H, params: { q: 'run' } }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Load more' }))[0]);
    expect(api.get).toHaveBeenCalledWith('/communities', { ...H, params: { q: 'run', section: 'mine', page: 2 } });
  });
});
