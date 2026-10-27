import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '../../i18n';
import { searchAsAdmin } from '../../services/adminService';
import AdminSearchPanel from './AdminSearchPanel';

vi.mock('../../services/adminService', () => ({ searchAsAdmin: vi.fn() }));

const at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const postHit = (id, extra = {}) => ({
  id, content: `cheap pills ${id}`, created_at: at, visibility: 'only_me', community_id: null, community_name: null, community_privacy: null,
  page_id: null, page_name: null, author_id: 7, author_username: 'bob', author_banned: false, ...extra
});
const show = () => render(<MemoryRouter><AdminSearchPanel token="tok" /></MemoryRouter>);

beforeEach(async () => {
  searchAsAdmin.mockReset();
  await setLanguage('en');
});

// Days 103-104: Admin > Search.
describe('AdminSearchPanel', () => {
  it('searches on submit (not as you type), lists posts with author, place and audience', async () => {
    searchAsAdmin.mockResolvedValue({ type: 'posts', page: 1, hasMore: false, results: [
      postHit(2, { community_id: 4, community_name: 'Secret club', community_privacy: 'private', visibility: 'public' }),
      postHit(1, { author_banned: true })
    ] });
    show();
    expect(screen.getByText(/Each search is recorded in the log/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search posts, comments or accounts' }), 'cheap pills');
    expect(searchAsAdmin).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(searchAsAdmin).toHaveBeenCalledWith('tok', { q: 'cheap pills', type: 'posts', page: 1 });
    const list = await screen.findByRole('list', { name: 'Results for “cheap pills”' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('in Secret club (private group)');
    expect(within(first).getByRole('link', { name: 'Open post' })).toHaveAttribute('href', '/posts/2');
    expect(second).toHaveTextContent('Only me');
    expect(second).toHaveTextContent('Banned');
  });

  it('too short is said at once; another kind searches the same words again; Load more appends', async () => {
    show();
    await userEvent.type(screen.getByRole('searchbox'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Type at least 2 characters.');
    expect(searchAsAdmin).not.toHaveBeenCalled();

    searchAsAdmin
      .mockResolvedValueOnce({ type: 'posts', page: 1, hasMore: false, results: [] })
      .mockResolvedValueOnce({ type: 'users', page: 1, hasMore: true, results: [{ id: 5, username: 'ana', email: 'ana@example.com', created_at: at, is_private: true, is_deactivated: false, is_admin: false, banned: true, banned_until: at }] })
      .mockResolvedValueOnce({ type: 'users', page: 2, hasMore: false, results: [{ id: 6, username: 'anabel', email: 'b@example.com', created_at: at, is_private: false, is_deactivated: true, is_admin: false, banned: false, banned_until: null }] });
    await userEvent.type(screen.getByRole('searchbox'), 'na');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Nothing found for “ana”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Accounts' }));
    expect(searchAsAdmin).toHaveBeenLastCalledWith('tok', { q: 'ana', type: 'users', page: 1 });
    const item = await screen.findByRole('listitem');
    expect(within(item).getByRole('link', { name: 'ana' })).toHaveAttribute('href', '/profile/5');
    expect(item).toHaveTextContent('ana@example.com');
    expect(item).toHaveTextContent('Suspended');
    expect(item).toHaveTextContent('Private account');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(searchAsAdmin).toHaveBeenLastCalledWith('tok', { q: 'ana', type: 'users', page: 2 });
    expect(await screen.findByText('Deactivated')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    searchAsAdmin.mockRejectedValue({ response: { status: 400, data: 'Search for 2 to 100 characters.' } });
    show();
    await userEvent.type(screen.getByRole('searchbox', { name: 'ابحث في المنشورات أو التعليقات أو الحسابات' }), 'xy');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));
    expect(await screen.findByText('ابحث عن 2 إلى 100 حرف.')).toBeInTheDocument();
  });
});
