import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FollowedHashtagsScreen from './FollowedHashtagsScreen';
import { fetchFollowedHashtags, unfollowHashtag } from '../services/hashtagService';
import { setLanguage } from '../i18n';

vi.mock('../services/hashtagService', () => ({ fetchFollowedHashtags: vi.fn(), unfollowHashtag: vi.fn() }));

const show = () => render(<MemoryRouter><FollowedHashtagsScreen /></MemoryRouter>);

beforeEach(async () => {
  fetchFollowedHashtags.mockReset();
  unfollowHashtag.mockReset();
  localStorage.setItem('token', 'tok');
  localStorage.setItem('userId', '5');
  await setLanguage('en');
});

// Days 107-108: Settings > Hashtags you follow.
describe('FollowedHashtagsScreen', () => {
  it('lists your hashtags, each opening its posts; Unfollow takes one off the list', async () => {
    fetchFollowedHashtags.mockResolvedValue({ hashtags: [{ tag: 'tea', followed_at: '2026-10-29T08:00:00Z' }, { tag: 'ရန်ကုန်', followed_at: '2026-10-28T08:00:00Z' }], max: 200 });
    unfollowHashtag.mockResolvedValue({ tag: 'tea', is_following: false });
    show();
    expect(await screen.findByRole('link', { name: '#tea' })).toHaveAttribute('href', '/hashtag/tea');
    expect(screen.getByRole('link', { name: '#ရန်ကုန်' })).toHaveAttribute('href', `/hashtag/${encodeURIComponent('ရန်ကုန်')}`);
    expect(screen.getByText('Public posts with these hashtags show up on your Home.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unfollow #tea' }));
    expect(unfollowHashtag).toHaveBeenCalledWith('tea', 'tok');
    expect(await screen.findAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: '#tea' })).not.toBeInTheDocument();
  });

  it('says how to follow one when there are none, in Arabic too; a failed load can be retried', async () => {
    await setLanguage('ar');
    fetchFollowedHashtags.mockResolvedValueOnce({ hashtags: [], max: 200 });
    const { unmount } = show();
    expect(await screen.findByText('لا تتابع أي وسم بعد. افتح وسمًا واضغط متابعة لترى منشوراته العامة في الرئيسية.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'الوسوم التي تتابعها' })).toBeInTheDocument();
    unmount();

    await setLanguage('en');
    fetchFollowedHashtags.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ hashtags: [{ tag: 'tea', followed_at: '2026-10-29T08:00:00Z' }], max: 200 });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    const list = await screen.findByRole('list');
    expect(within(list).getByRole('link', { name: '#tea' })).toBeInTheDocument();
  });
});
