import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import MutedUsersScreen from './MutedUsersScreen';
import PostMenu from '../components/feed/PostMenu';
import { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

// Day 47: muting a person.
describe('Muted accounts screen', () => {
  const show = () => render(<MemoryRouter><MutedUsersScreen /></MemoryRouter>);

  it('lists them, says what muting does, and unmutes', async () => {
    api.get.mockResolvedValue({ data: { mutedUsers: [{ id: 5, username: 'noisy' }, { id: 6, username: 'loud' }], hasMore: false } });
    api.delete.mockResolvedValue({ data: { muted: false } });
    show();
    expect(await screen.findByText('noisy')).toBeInTheDocument();
    expect(screen.getByText(/They aren't told\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unmute noisy' }));
    expect(api.delete).toHaveBeenCalledWith('/users/5/mute', H);
    expect(screen.queryByText('noisy')).toBeNull();
    expect(screen.getByText('loud')).toBeInTheDocument();
  });

  it('an empty list explains where to mute from', async () => {
    api.get.mockResolvedValue({ data: { mutedUsers: [], hasMore: false } });
    show();
    expect(await screen.findByText(/You haven't muted anyone/)).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: { mutedUsers: [{ id: 5, username: 'noisy' }], hasMore: false } });
    show();
    expect(await screen.findByRole('heading', { name: 'الحسابات المكتومة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء كتم noisy' })).toHaveTextContent('إلغاء الكتم');
  });
});

describe('PostMenu: mute the author', () => {
  const open = async (props) => {
    render(<PostMenu post={{ id: 1, user_id: 7, username: 'bob' }} visibility="public" {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  };

  it("offers \"Mute bob\" on someone else's post; their posts leave the list", async () => {
    api.post.mockResolvedValue({ data: { muted: true } });
    const onMuted = vi.fn();
    await open({ onMuted });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mute bob' }));
    await vi.waitFor(() => expect(onMuted).toHaveBeenCalledWith(7));
    expect(api.post).toHaveBeenCalledWith('/users/7/mute', {}, H);
  });

  it('a failure is shown, and nothing is removed', async () => {
    api.post.mockRejectedValue(new Error('offline'));
    const onMuted = vi.fn();
    await open({ onMuted });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mute bob' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work. Please try again.");
    expect(onMuted).not.toHaveBeenCalled();
  });

  it('not on your own post', async () => {
    render(<PostMenu post={{ id: 1, user_id: 1, username: 'me' }} visibility="public" />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: /^Mute/ })).toBeNull();
  });
});
