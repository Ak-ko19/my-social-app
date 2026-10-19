import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { setLanguage } from '../../i18n';
import { fetchFollowingPage } from '../../services/messageService';
import MemberPicker from './MemberPicker';

vi.mock('../../services/messageService', () => ({ fetchFollowingPage: vi.fn() }));

const person = (id, username) => ({ id, username, avatar_url: null });

function Picker({ excludeIds }) {
  const [selected, setSelected] = useState([]);
  return <MemberPicker userId={1} token="tok" selectedIds={selected} onChange={setSelected} excludeIds={excludeIds} />;
}

beforeEach(async () => {
  fetchFollowingPage.mockReset();
  await setLanguage('en');
});

// Day 69: the people you follow, a page at a time, searched on the server.
describe('MemberPicker', () => {
  it('shows the first page and loads more', async () => {
    fetchFollowingPage
      .mockResolvedValueOnce({ users: [person(2, 'bob')], page: 1, hasMore: true })
      .mockResolvedValueOnce({ users: [person(3, 'carol')], page: 2, hasMore: false });
    render(<Picker />);
    await screen.findByRole('checkbox', { name: 'bob' });
    expect(fetchFollowingPage).toHaveBeenLastCalledWith(1, 'tok', { q: '', limit: 100 });
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('checkbox', { name: 'carol' });
    expect(fetchFollowingPage).toHaveBeenLastCalledWith(1, 'tok', { q: '', page: 2, limit: 100 });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('searches on the server; a pick stays picked while a search hides it; no matches says so', async () => {
    fetchFollowingPage.mockImplementation(async (userId, token, { q }) => ({
      users: [person(2, 'bob'), person(3, 'carol')].filter((p) => p.username.includes(q || '')),
      page: 1,
      hasMore: false
    }));
    render(<Picker />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'bob' }));
    await userEvent.type(screen.getByRole('searchbox'), 'car');
    await screen.findByRole('checkbox', { name: 'carol' });
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'bob' })).toBeNull());
    expect(fetchFollowingPage).toHaveBeenLastCalledWith(1, 'tok', { q: 'car', limit: 100 });
    await userEvent.clear(screen.getByRole('searchbox'));
    expect(await screen.findByRole('checkbox', { name: 'bob' })).toBeChecked();
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    await screen.findByText('No one you follow matches that.');
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('says to follow people first when you follow nobody; marks people already in the group', async () => {
    fetchFollowingPage.mockResolvedValueOnce({ users: [], page: 1, hasMore: false });
    const { unmount } = render(<Picker />);
    await screen.findByText(/Follow people first/);
    unmount();
    fetchFollowingPage.mockResolvedValueOnce({ users: [person(2, 'bob')], page: 1, hasMore: false });
    render(<Picker excludeIds={[2]} />);
    const bob = await screen.findByRole('checkbox', { name: /bob/ });
    expect(bob).toBeDisabled();
    expect(screen.getByText('In group')).toBeInTheDocument();
  });
});
