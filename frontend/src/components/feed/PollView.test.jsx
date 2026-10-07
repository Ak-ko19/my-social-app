import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PollView from './PollView';
import { fetchPost, votePoll } from '../../services/postService';

let mockToken = 'tok';
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: mockToken, userId: 2 }) }));
vi.mock('../../services/postService', () => ({ votePoll: vi.fn(), fetchPost: vi.fn() }));

const HOUR = 3600000;
const poll = (over = {}) => ({
  closes_at: new Date(Date.now() + 25 * HOUR).toISOString(),
  closed: false,
  total_votes: 3,
  my_vote: null,
  show_results: false,
  options: [{ id: 11, label: 'Tea', votes: null }, { id: 12, label: 'Coffee', votes: null }],
  ...over
});
const results = (over = {}) => poll({
  show_results: true,
  total_votes: 4,
  my_vote: 12,
  options: [{ id: 11, label: 'Tea', votes: 1 }, { id: 12, label: 'Coffee', votes: 3 }],
  ...over
});
const show = (p) => render(
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<PollView postId={7} poll={p} />} />
      <Route path="/login" element={<p>login screen</p>} />
    </Routes>
  </MemoryRouter>
);

describe('PollView (Day 44)', () => {
  beforeEach(() => {
    mockToken = 'tok';
    votePoll.mockReset();
    fetchPost.mockReset();
  });

  it('before voting: the options, the total and the time left -- no counts', () => {
    show(poll());
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Tea', 'Coffee']);
    expect(screen.getByText('3 votes · 1 day left')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('a vote shows the results: percentages, your vote, the leader', async () => {
    let answer;
    votePoll.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    show(poll());
    await userEvent.click(screen.getByRole('button', { name: 'Coffee' }));
    expect(votePoll).toHaveBeenCalledWith(7, 12, 'tok');
    // While it's sent: the choice is marked, nothing else can be tapped.
    expect(screen.getByRole('button', { name: 'Coffee' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Tea' })).toBeDisabled();
    answer(results());
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByLabelText('Your vote')).toBeInTheDocument();
    expect(screen.getByText('3 votes')).toBeInTheDocument(); // for screen readers
    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveClass('is-leading', 'is-mine');
    expect(items[0]).not.toHaveClass('is-leading');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('voted elsewhere meanwhile: says so, and shows where it stands', async () => {
    votePoll.mockRejectedValue({ response: { status: 409, data: 'You already voted in this poll' } });
    fetchPost.mockResolvedValue({ id: 7, poll: results({ my_vote: 11 }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    show(poll());
    await userEvent.click(screen.getByRole('button', { name: 'Tea' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You already voted in this poll');
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(fetchPost).toHaveBeenCalledWith(7, 'tok');
  });

  it('a failed vote leaves the options to try again', async () => {
    votePoll.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    show(poll());
    await userEvent.click(screen.getByRole('button', { name: 'Tea' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't vote. Please try again.");
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tea' })).toBeEnabled());
    expect(fetchPost).not.toHaveBeenCalled();
  });

  it('an ended poll: final results, or "ended" while its results are not loaded', () => {
    const past = new Date(Date.now() - HOUR).toISOString();
    const { unmount } = show(results({ closed: true, closes_at: past, my_vote: null }));
    expect(screen.getByText('4 votes · Final results')).toBeInTheDocument();
    unmount();
    show(poll({ closes_at: past }));
    expect(screen.getByText('3 votes · Poll ended')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('time left in days, hours, then minutes (rounded)', () => {
    const fresh = show(poll({ closes_at: new Date(Date.now() + 72 * HOUR - 5000).toISOString() }));
    expect(screen.getByText('3 votes · 3 days left')).toBeInTheDocument();
    fresh.unmount();
    const { unmount } = show(poll({ closes_at: new Date(Date.now() + 5.25 * HOUR).toISOString(), total_votes: 1 }));
    expect(screen.getByText('1 vote · 5 hours left')).toBeInTheDocument();
    unmount();
    show(poll({ closes_at: new Date(Date.now() + 90000).toISOString() }));
    expect(screen.getByText('3 votes · 2 minutes left')).toBeInTheDocument();
  });

  it('logged out: an option leads to the login screen', async () => {
    mockToken = null;
    show(poll());
    await userEvent.click(screen.getByRole('button', { name: 'Tea' }));
    expect(await screen.findByText('login screen')).toBeInTheDocument();
    expect(votePoll).not.toHaveBeenCalled();
  });
});
