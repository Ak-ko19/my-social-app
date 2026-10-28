import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostMenu from './PostMenu';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 2 }) }));

// B5 / Day 20: the owner's menu offers the audiences the post isn't using --
// and none at all for group or page posts (regression: the Day 20 rename of
// the menu keys briefly let them through).
const open = async (post, visibility) => {
  const onChangeVisibility = vi.fn();
  render(<PostMenu post={{ id: 1, user_id: 2, username: 'bob', ...post }} visibility={visibility} onChangeVisibility={onChangeVisibility} />);
  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  return onChangeVisibility;
};

describe('PostMenu audience items', () => {
  it('an "only me" post offers public and followers-only', async () => {
    const onChange = await open({}, 'only_me');
    expect(screen.queryByText('Make visible to only me')).toBeNull();
    await userEvent.click(screen.getByText('Make public'));
    expect(onChange).toHaveBeenCalledWith('public');
  });

  it('a public post offers followers-only and only me', async () => {
    await open({}, 'public');
    expect(screen.getByText('Make visible to followers only')).toBeInTheDocument();
    expect(screen.getByText('Make visible to only me')).toBeInTheDocument();
    expect(screen.queryByText('Make public')).toBeNull();
  });

  it.each([['page', { page: { id: 5, name: 'Cafe' } }], ['group', { community_id: 9 }]])('a %s post has none', async (kind, extra) => {
    await open(extra, 'public');
    for (const label of ['Make public', 'Make visible to followers only', 'Make visible to only me']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText('Edit post')).toBeInTheDocument();
  });
});

// Day 36: pinning to your profile -- offered only where the parent passes
// onTogglePin (your own posts tab), and it says Unpin on the pinned one.
describe('PostMenu pin item', () => {
  const openWith = async (post, onTogglePin) => {
    render(<PostMenu post={{ id: 1, user_id: 2, username: 'bob', ...post }} visibility="public" onTogglePin={onTogglePin} />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  };

  it('offers "Pin to profile" and calls back (after the sheet closes)', async () => {
    const onTogglePin = vi.fn();
    await openWith({}, onTogglePin);
    await userEvent.click(screen.getByText('Pin to profile'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it('says "Unpin from profile" on the pinned post', async () => {
    await openWith({ is_pinned: true }, vi.fn());
    expect(screen.getByText('Unpin from profile')).toBeInTheDocument();
    expect(screen.queryByText('Pin to profile')).toBeNull();
  });

  it('is not offered elsewhere (no onTogglePin)', async () => {
    await openWith({}, undefined);
    expect(screen.queryByText('Pin to profile')).toBeNull();
  });
});

// Days 107-108: a post a followed hashtag brought to Home -- "Unfollow #tag",
// first in the menu, only where Home passes onUnfollowedTag.
describe('PostMenu unfollow-hashtag item', () => {
  const post = { id: 1, user_id: 7, username: 'ann', via_hashtag: 'tea' };

  it('unfollows the tag and tells Home', async () => {
    const spy = vi.spyOn(await import('../../services/hashtagService'), 'unfollowHashtag');
    spy.mockResolvedValue({ tag: 'tea', is_following: false });
    const onUnfollowedTag = vi.fn();
    render(<PostMenu post={post} visibility="public" onUnfollowedTag={onUnfollowedTag} />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(items[1]).toBe('Unfollow #tea');
    await userEvent.click(screen.getByText('Unfollow #tea'));
    await vi.waitFor(() => expect(onUnfollowedTag).toHaveBeenCalledWith('tea'));
    expect(spy).toHaveBeenCalledWith('tea', 'tok');
    spy.mockRestore();
  });

  it('is not offered off Home, or for a post nothing tagged brought', async () => {
    const { unmount } = render(<PostMenu post={post} visibility="public" />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByText('Unfollow #tea')).toBeNull();
    unmount();
    render(<PostMenu post={{ ...post, via_hashtag: null }} visibility="public" onUnfollowedTag={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByText(/Unfollow #/)).toBeNull();
  });

  it('a failure is said on the card, and Home is not told', async () => {
    const spy = vi.spyOn(await import('../../services/hashtagService'), 'unfollowHashtag');
    spy.mockRejectedValue(new Error('down'));
    const onUnfollowedTag = vi.fn();
    render(<PostMenu post={post} visibility="public" onUnfollowedTag={onUnfollowedTag} />);
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(screen.getByText('Unfollow #tea'));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't unfollow. Please try again.");
    expect(onUnfollowedTag).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
