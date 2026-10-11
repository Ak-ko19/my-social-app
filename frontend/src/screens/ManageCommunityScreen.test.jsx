import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import ManageCommunityScreen from './ManageCommunityScreen';
import { setLanguage } from '../i18n';
import AR from '../i18n/locales/ar.json';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
const GROUP = { id: 5, name: 'Hikers', description: '', privacy: 'public', is_admin: true, is_member: true, member_count: 3 };
// Each list's pages, as the API pages them (Day 50).
let lists;
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  lists = {
    requests: [[]],
    members: [[{ id: 1, username: 'me', role: 'admin' }, { id: 7, username: 'troll', role: 'member' }], [{ id: 6, username: 'quiet', role: 'member' }]],
    bans: [[{ id: 9, username: 'spammer', avatar_url: null }], [{ id: 8, username: 'older', avatar_url: null }]]
  };
  api.get.mockImplementation((url, opts) => {
    if (url === '/communities/5') return Promise.resolve({ data: GROUP });
    const kind = url.match(/^\/communities\/5\/(requests|members|bans)$/)?.[1];
    if (!kind) return Promise.reject(new Error(url));
    const page = opts.params.page;
    const total = lists[kind].flat().length;
    return Promise.resolve({ data: { [kind]: lists[kind][page - 1] || [], page, hasMore: page < lists[kind].length, total } });
  });
  api.delete.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});
const show = () => render(
  <MemoryRouter initialEntries={['/groups/5/manage']}>
    <Routes><Route path="/groups/:id/manage" element={<ManageCommunityScreen />} /></Routes>
  </MemoryRouter>
);

// Day 50: Remove (and ban) and the banned list.
describe('Manage group: remove and ban', () => {
  it('Remove asks first; without the box ticked it only removes', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove troll' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Remove troll from the group?');
    expect(dialog).toHaveTextContent('They\'ll leave Hikers and can join again later.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(api.delete).toHaveBeenCalledWith('/communities/5/members/7', H);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('"Also ban them" turns it into Remove and ban', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove troll' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Also ban them/ }));
    expect(dialog).toHaveTextContent("can't join or ask to join again unless you unban them");
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove and ban' }));
    expect(api.post).toHaveBeenCalledWith('/communities/5/bans/7', {}, H);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('lists banned people, newest first, with Load more and Unban', async () => {
    lists.members = [lists.members[0]];
    show();
    expect(await screen.findByText('spammer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('older')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/communities/5/bans', { ...H, params: { page: 2, limit: 20 } });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Unban spammer' }));
    expect(api.delete).toHaveBeenCalledWith('/communities/5/bans/9', H);
  });

  it('empty: says nobody is banned', async () => {
    lists.bans = [[]];
    show();
    expect(await screen.findByText('Nobody is banned from this group.')).toBeInTheDocument();
  });

  it('members and requests page too; the headings count everyone', async () => {
    lists.bans = [[]];
    lists.requests = [[{ id: 20, username: 'asker1' }], [{ id: 21, username: 'asker2' }]];
    show();
    expect(await screen.findByRole('heading', { name: 'Join requests (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Members \(3\)/ })).toBeInTheDocument();
    const [moreRequests, moreMembers] = screen.getAllByRole('button', { name: 'Load more' });
    await userEvent.click(moreRequests);
    expect(await screen.findByText('asker2')).toBeInTheDocument();
    await userEvent.click(moreMembers);
    expect(await screen.findByText('quiet')).toBeInTheDocument();
    expect(screen.getByText('asker1')).toBeInTheDocument(); // added to, not replaced
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('Delete group: the name must be typed; then it goes, and so do you', async () => {
    render(
      <MemoryRouter initialEntries={['/groups/5/manage']}>
        <Routes>
          <Route path="/groups/:id/manage" element={<ManageCommunityScreen />} />
          <Route path="/groups" element={<p>All groups</p>} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete Hikers?');
    const confirm = within(dialog).getByRole('button', { name: 'Delete group' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Hikers');
    await userEvent.click(confirm);
    expect(api.delete).toHaveBeenCalledWith('/communities/5', H);
    expect(await screen.findByText('All groups')).toBeInTheDocument();
  });

  it("Delete group: the server's reason stays in the dialog", async () => {
    api.delete.mockRejectedValueOnce({ response: { status: 403, data: 'Only group admins can do that' } });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Hikers');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete group' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Only group admins can do that');
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    await userEvent.click(await screen.findByRole('button', { name: AR.groups.removeName.replace('{{name}}', 'troll') }));
    expect(screen.getByRole('checkbox', { name: AR.groups.alsoBan })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: AR.groups.banned })).toBeInTheDocument();
    await setLanguage('en');
  });
});
