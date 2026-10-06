import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FollowButton from './FollowButton';
import { followLabelKey } from '../../utils/followLabel';
import { followUser, unfollowUser } from '../../services/postService';

vi.mock('../../services/postService', () => ({ followUser: vi.fn(), unfollowUser: vi.fn() }));

// Day 37: the follow button in friends / followers / following lists.
describe('FollowButton', () => {
  it('labels: Follow, Follow back (they follow you), Requested, Following', () => {
    expect(followLabelKey('none', false)).toBe('follow.follow');
    expect(followLabelKey('none', true)).toBe('follow.followBack');
    expect(followLabelKey('pending', true)).toBe('follow.requested');
    expect(followLabelKey('following', true)).toBe('follow.following');
  });

  it('Follow back -> Following; its name says who', async () => {
    followUser.mockResolvedValue({ data: { status: 'accepted' } });
    render(<FollowButton userId={7} name="bob" token="tok" followsYou />);
    await userEvent.click(screen.getByRole('button', { name: 'Follow back bob' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Following bob' })).toBeInTheDocument());
    expect(followUser).toHaveBeenCalledWith(7, 'tok');
  });

  it('a private account -> Requested; pressing it again cancels', async () => {
    followUser.mockResolvedValue({ data: { status: 'pending' } });
    unfollowUser.mockResolvedValue({ data: {} });
    render(<FollowButton userId={8} name="carol" token="tok" />);
    await userEvent.click(screen.getByRole('button', { name: 'Follow carol' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Requested carol' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow carol' })).toBeInTheDocument());
    expect(unfollowUser).toHaveBeenCalledWith(8, 'tok');
  });

  it('a failure says so and keeps the state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    followUser.mockRejectedValue({ response: { data: 'You are blocked' } });
    render(<FollowButton userId={9} name="dan" token="tok" />);
    await userEvent.click(screen.getByRole('button', { name: 'Follow dan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are blocked');
    expect(screen.getByRole('button', { name: 'Follow dan' })).toBeEnabled();
  });
});
