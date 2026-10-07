import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import DraftsScreen from './DraftsScreen';
import { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const inHours = (h) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
const base = { visibility: 'public', community_id: null, community_name: null, page_id: null, page_name: null, poll: null, media: [], last_error: null, created_at: inHours(-5), updated_at: inHours(-1) };
const DRAFTS = [
  { ...base, id: 1, content: 'Half-written thought', scheduled_for: null },
  { ...base, id: 2, content: '', media: [{ url: 'a' }, { url: 'b' }], scheduled_for: null, community_id: 3, community_name: 'Hikers', last_error: 'Join this group to post in it' },
  { ...base, id: 3, content: 'Tomorrow morning', scheduled_for: inHours(20) },
  { ...base, id: 4, content: 'In an hour', scheduled_for: inHours(1), poll: { options: ['a', 'b'], durationHours: 24 } }
];

const show = (path = '/drafts') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/drafts" element={<DraftsScreen />} />
      <Route path="/create-post" element={<p>composer</p>} />
    </Routes>
  </MemoryRouter>
);
const cards = () => screen.getAllByRole('listitem');

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: DRAFTS });
  api.post.mockReset();
  api.put.mockReset();
  api.delete.mockReset();
});

// Day 45: /drafts.
describe('Drafts screen', () => {
  it('two tabs with counts; drafts last edited first, scheduled soonest first', async () => {
    show();
    const drafts = await screen.findByRole('tab', { name: /Drafts/ });
    expect(drafts).toHaveAttribute('aria-selected', 'true');
    expect(drafts).toHaveTextContent('2');
    expect(cards().map((c) => c.querySelector('.draft-card-text').textContent)).toEqual(['Half-written thought', 'No text yet']);
    // The photo-only group draft that couldn't be posted says why.
    const failed = cards()[1];
    expect(within(failed).getByText('In Hikers')).toBeInTheDocument();
    expect(within(failed).getByText('2 photos')).toBeInTheDocument();
    expect(within(failed).getByText("Couldn't be posted at its time: Join this group to post in it")).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Scheduled/ }));
    expect(cards().map((c) => c.querySelector('.draft-card-text').textContent)).toEqual(['In an hour', 'Tomorrow morning']);
    expect(within(cards()[0]).getByText(/^Posts /)).toBeInTheDocument();
    expect(within(cards()[0]).getByText('Poll')).toBeInTheDocument();
  });

  it('arrow keys move between the tabs', async () => {
    show();
    const drafts = await screen.findByRole('tab', { name: /Drafts/ });
    drafts.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Scheduled/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Scheduled/ })).toHaveFocus();
  });

  it('"Post now" publishes it and links to the post', async () => {
    api.post.mockResolvedValue({ data: { id: 50 } });
    show();
    await screen.findAllByRole('listitem');
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Post now' }));
    expect(api.post).toHaveBeenCalledWith('/drafts/1/publish', null, { headers: { Authorization: 'Bearer tok' } });
    expect(await screen.findByRole('link', { name: 'View post' })).toHaveAttribute('href', '/posts/50');
    expect(cards()).toHaveLength(1);
  });

  it("a refused \"Post now\" stays, with the server's reason", async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: 'Post content cannot be empty' } });
    show();
    await screen.findAllByRole('listitem');
    await userEvent.click(within(cards()[1]).getByRole('button', { name: 'Post now' }));
    expect(await within(cards()[1]).findByRole('alert')).toHaveTextContent('Post content cannot be empty');
    expect(cards()).toHaveLength(2);
  });

  it('deletes after asking', async () => {
    api.delete.mockResolvedValue({ data: { deleted: true } });
    show();
    await screen.findAllByRole('listitem');
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete this draft?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(api.delete).toHaveBeenCalledWith('/drafts/1', { headers: { Authorization: 'Bearer tok' } });
    expect(screen.queryByText('Half-written thought')).toBeNull();
  });

  it('reschedules or moves back to drafts from the Scheduled tab', async () => {
    api.put.mockImplementation((url, body) => Promise.resolve({ data: { ...DRAFTS[3], scheduled_for: body.scheduledFor } }));
    show('/drafts?tab=scheduled');
    await screen.findAllByRole('listitem');
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Change time' }));
    const picker = screen.getByLabelText('Date and time');
    await userEvent.clear(picker);
    await userEvent.click(screen.getByRole('button', { name: 'Save time' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a date and time.');
    expect(api.put).not.toHaveBeenCalled();

    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Move to drafts' }));
    expect(api.put).toHaveBeenCalledWith('/drafts/4/schedule', { scheduledFor: null }, { headers: { Authorization: 'Bearer tok' } });
    expect(cards()).toHaveLength(1); // now under Drafts
  });

  it('empty tabs say what to do', async () => {
    api.get.mockResolvedValue({ data: [] });
    show();
    expect(await screen.findByText(/No drafts\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Scheduled/ }));
    expect(screen.getByText(/Nothing scheduled\./)).toBeInTheDocument();
  });

  it('a failed load can be retried', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    show();
    expect(await screen.findByText("Couldn't load your drafts.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(await screen.findByText('Half-written thought')).toBeInTheDocument();
  });

  it('in Arabic: tabs, counts, plural photos and the translated reason', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByRole('tab', { name: /المسودات/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(cards()[1]).getByText('صورتان')).toBeInTheDocument();
    expect(within(cards()[1]).getByText('تعذّر نشره في موعده: انضم إلى هذه المجموعة للنشر فيها')).toBeInTheDocument();
    expect(within(cards()[0]).getByRole('button', { name: 'انشر الآن' })).toBeInTheDocument();
  });
});
