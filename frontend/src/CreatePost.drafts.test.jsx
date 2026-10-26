import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreatePost from './CreatePost';
import api from './api';
import { toLocalInputValue } from './services/draftService';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, resolveImageUrl: (url) => url }));

const show = (path = '/create-post') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/create-post" element={<CreatePost />} />
      <Route path="/drafts" element={<p>drafts screen</p>} />
      <Route path="/groups/:id" element={<p>group screen</p>} />
      <Route path="/" element={<p>home</p>} />
    </Routes>
  </MemoryRouter>
);
const sentForm = (call) => Object.fromEntries([...call[1].entries()].filter(([k]) => k !== 'images'));
const draft = {
  id: 7, content: 'Trail report', visibility: 'public', community_id: 3, community_name: 'Hikers', page_id: null, page_name: null,
  poll: null, media: [{ url: 'https://cdn/a.jpg', alt: null }, { url: 'https://cdn/b.jpg', alt: 'A trail sign' }], scheduled_for: null, last_error: null
};

beforeEach(() => {
  localStorage.setItem('token', 'tok');
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

// Day 45: drafts and scheduled posts in the composer.
describe('CreatePost: drafts', () => {
  it('"Save draft" keeps it for later -- even with no text, if it has a photo', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write something, add a photo or a poll before saving a draft.');
    expect(api.post).not.toHaveBeenCalled();

    await userEvent.upload(document.querySelector('input[type=file]'), new File(['x'], 'a.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('drafts screen')).toBeInTheDocument();
    expect(api.post.mock.calls[0][0]).toBe('/drafts');
    expect(sentForm(api.post.mock.calls[0])).toEqual({ content: '', visibility: 'public', scheduledFor: '', altTexts: JSON.stringify(['']) });
    expect(api.post.mock.calls[0][1].getAll('images')).toHaveLength(1);
  });

  it('schedules for later, checking the time first', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    show();
    await userEvent.type(screen.getByRole('textbox', { name: 'Post' }), 'Good morning');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Schedule for later' }));
    const picker = screen.getByLabelText('Date and time');
    expect(picker).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument();

    await userEvent.clear(picker);
    await userEvent.type(picker, toLocalInputValue(new Date(Date.now() + 2 * 60 * 1000)));
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a time at least 5 minutes from now.');

    const when = new Date(Date.now() + 3 * 60 * 60 * 1000);
    when.setSeconds(0, 0);
    await userEvent.clear(picker);
    await userEvent.type(picker, toLocalInputValue(when));
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await screen.findByText('drafts screen');
    expect(sentForm(api.post.mock.calls[0])).toEqual({ content: 'Good morning', visibility: 'public', scheduledFor: when.toISOString() });
  });

  it('opens a draft with its photos and group, and posts it as it is now', async () => {
    api.get.mockResolvedValue({ data: draft });
    api.put.mockResolvedValue({ data: draft });
    api.post.mockResolvedValue({ data: { id: 99 } });
    show('/create-post?draftId=7');
    expect(await screen.findByRole('heading', { name: 'Edit draft' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Post' })).toHaveValue('Trail report');
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
    expect(screen.queryByRole('group', { name: 'Who can see this?' })).toBeNull(); // a group post

    await userEvent.click(screen.getByRole('button', { name: 'Remove image 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('group screen')).toBeInTheDocument();
    expect(api.put.mock.calls[0][0]).toBe('/drafts/7');
    expect(sentForm(api.put.mock.calls[0])).toEqual({
      content: 'Trail report', communityId: '3', keepMedia: JSON.stringify(['https://cdn/b.jpg']), scheduledFor: '',
      // Day 95: the kept photo keeps its description.
      altTexts: JSON.stringify(['A trail sign'])
    });
    expect(api.post).toHaveBeenCalledWith('/drafts/7/publish', null, { headers: { Authorization: 'Bearer tok' } });
  });

  it('a scheduled draft opens with its time, in local time', async () => {
    const when = new Date(Date.now() + 26 * 60 * 60 * 1000);
    when.setSeconds(0, 0);
    api.get.mockResolvedValue({ data: { ...draft, community_id: null, community_name: null, scheduled_for: when.toISOString() } });
    show('/create-post?draftId=7');
    expect(await screen.findByRole('checkbox', { name: 'Schedule for later' })).toBeChecked();
    expect(screen.getByLabelText('Date and time')).toHaveValue(toLocalInputValue(when));
  });

  it("a draft that's gone says so", async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: 'Draft not found' } });
    show('/create-post?draftId=7');
    expect(await screen.findByRole('alert')).toHaveTextContent('This draft is gone');
    // (the header's back button says the same)
    await userEvent.click(screen.getAllByRole('button', { name: 'Back to drafts' }).at(-1));
    await waitFor(() => expect(screen.getByText('drafts screen')).toBeInTheDocument());
  });
});
