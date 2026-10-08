import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import CloseFriendsScreen from './CloseFriendsScreen';
import StoriesRow from '../components/feed/StoriesRow';
import PostMenu from '../components/feed/PostMenu';
import { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.get.mockImplementation((url, opts) => {
    if (url === '/close-friends') return Promise.resolve({ data: { closeFriends: [{ id: 5, username: 'dana' }] } });
    const q = opts?.params?.q || '';
    const all = [{ id: 6, username: 'omar' }, { id: 7, username: 'lina' }];
    return Promise.resolve({ data: { candidates: all.filter((u) => u.username.includes(q)) } });
  });
});

// Day 47: close friends.
describe('Close friends screen', () => {
  const show = () => render(<MemoryRouter><CloseFriendsScreen /></MemoryRouter>);

  it('shows the list and your followers; add moves one over, remove takes one off', async () => {
    api.put.mockResolvedValue({ data: { closeFriend: true } });
    api.delete.mockResolvedValue({ data: { closeFriend: false } });
    show();
    expect(await screen.findByRole('heading', { name: 'On your list (1)' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add omar to close friends' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add omar to close friends' }));
    expect(api.put).toHaveBeenCalledWith('/close-friends/6', {}, H);
    expect(await screen.findByRole('heading', { name: 'On your list (2)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove dana from close friends' }));
    expect(api.delete).toHaveBeenCalledWith('/close-friends/5', H);
    expect(await screen.findByRole('heading', { name: 'On your list (1)' })).toBeInTheDocument();
  });

  it('searches your followers', async () => {
    show();
    await screen.findByRole('button', { name: 'Add lina to close friends' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search your followers' }), 'zz');
    expect(await screen.findByText('No followers match that name.')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByRole('heading', { name: 'الأصدقاء المقرّبون' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'إضافة omar إلى الأصدقاء المقرّبين' })).toHaveTextContent('إضافة');
  });
});

describe('Stories: share to close friends', () => {
  it('after picking a photo, asks who it is for', async () => {
    const onAddStory = vi.fn();
    const { container } = render(<StoriesRow tray={[]} onAddStory={onAddStory} onOpenGroup={() => {}} />);
    const file = new File(['x'], 's.png', { type: 'image/png' });
    await userEvent.upload(container.querySelector('input[type=file]'), file);
    expect(screen.getByRole('menuitem', { name: 'Your story' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close friends' }));
    await vi.waitFor(() => expect(onAddStory).toHaveBeenCalledWith(file, { closeFriends: true }));
  });

  it('a group with an unseen close-friends story gets the green ring', () => {
    const tray = [{ user_id: 2, username: 'dana', avatar_url: null, is_own: false, all_seen: false, stories: [{ id: 1, close_friends: true, seen: false }] }];
    render(<StoriesRow tray={tray} onAddStory={() => {}} onOpenGroup={() => {}} />);
    const ringed = [...document.querySelectorAll('[style]')].find((el) => el.getAttribute('style').includes('--color-close-friends'));
    expect(ringed).toBeTruthy();
  });
});

describe('PostMenu: switch a post to close friends', () => {
  it('offers it on your own post', async () => {
    const onChangeVisibility = vi.fn();
    render(<PostMenu post={{ id: 1, user_id: 1, username: 'me' }} visibility="public" onChangeVisibility={onChangeVisibility} />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make visible to close friends only' }));
    await vi.waitFor(() => expect(onChangeVisibility).toHaveBeenCalledWith('close_friends'));
  });
});
