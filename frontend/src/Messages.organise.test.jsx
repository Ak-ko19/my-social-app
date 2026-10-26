import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Messages from './Messages';
import api from './api';
import { setLanguage } from './i18n';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, resolveImageUrl: (url) => url }));
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1, username: 'me' }) }));
vi.mock('./hooks/useSocket', () => ({ useSocket: () => ({ socket: null, connectionState: 'connected' }) }));

const chat = (id, extra = {}) => ({
  conversation_id: id, type: 'direct', other_user_id: id + 100, username: `friend${id}`, avatar_url: null,
  last_message: `hello ${id}`, last_message_at: new Date().toISOString(), unread_count: 0, muted: false, pinned: false, archived: false, ...extra
});
const show = (path = '/messages') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/messages" element={<Messages />} />
      <Route path="/messages/archived" element={<Messages archived />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(async () => {
  api.get.mockReset();
  api.put.mockReset();
  await setLanguage('en');
});

// Days 97-98: pinned and archived chats in the inbox.
describe('pinning and archiving chats', () => {
  it('a pinned chat shows a pin; its menu offers Unpin and Archive; archiving takes it off the list', async () => {
    api.get.mockResolvedValueOnce({ data: { conversations: [chat(1, { pinned: true }), chat(2)], nextCursor: null, archivedCount: 0 } })
      .mockResolvedValueOnce({ data: { conversations: [chat(2)], nextCursor: null, archivedCount: 1 } });
    api.put.mockResolvedValue({ data: { pinned: false, archived: true } });
    show();
    expect(await screen.findByRole('img', { name: 'Pinned' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More options for friend1' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Unpin', 'Archive']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }));
    expect(api.put).toHaveBeenCalledWith('/conversations/1/archive', { archived: true }, { headers: { Authorization: 'Bearer tok' } });
    // The list again from the server, with the way to the archived chats.
    expect(await screen.findByRole('button', { name: 'Archived chats (1)' })).toBeInTheDocument();
    expect(screen.queryByText('friend1')).toBeNull();
  });

  it("the server's refusal is said, and the list stays the server's", async () => {
    api.get.mockResolvedValue({ data: { conversations: [chat(4)], nextCursor: null, archivedCount: 0 } });
    api.put.mockRejectedValue({ response: { status: 400, data: 'You can pin up to 3 chats.' } });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'More options for friend4' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));
    expect((await screen.findByRole('alert')).textContent).toBe('You can pin up to 3 chats.');
    expect(api.put).toHaveBeenCalledWith('/conversations/4/pin', { pinned: true }, expect.anything());
  });

  it('Archived chats: its own title, back to Messages, Unarchive; empty says how archiving works', async () => {
    api.get.mockResolvedValueOnce({ data: { conversations: [chat(5, { archived: true })], nextCursor: null } })
      .mockResolvedValueOnce({ data: { conversations: [], nextCursor: null } });
    api.put.mockResolvedValue({ data: { pinned: false, archived: false } });
    show('/messages/archived');
    expect(await screen.findByRole('heading', { name: 'Archived chats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to messages' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/conversations', expect.objectContaining({ params: expect.objectContaining({ archived: '1' }) }));
    await userEvent.click(await screen.findByRole('button', { name: 'More options for friend5' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unarchive' }));
    expect(await screen.findByText(/No archived chats/)).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: { conversations: [chat(6)], nextCursor: null, archivedCount: 2 } });
    show();
    expect(await screen.findByRole('button', { name: 'المحادثات المؤرشفة (2)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'خيارات أخرى لـ friend6' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['تثبيت', 'أرشفة']);
  });
});
