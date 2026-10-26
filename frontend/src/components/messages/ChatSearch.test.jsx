import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../api';
import ChatSearch from './ChatSearch';
import { setLanguage } from '../../i18n';

vi.mock('../../api', () => ({ default: { get: vi.fn() }, resolveImageUrl: (url) => url }));

const now = new Date().toISOString();
const result = (id, content, sender = 2) => ({ id, sender_id: sender, sender_username: sender === 1 ? 'me' : 'ana', type: 'text', content, created_at: now });
const show = (props = {}) => render(<ChatSearch conversationId={7} token="tok" userId={1} isGroup={false} onClose={vi.fn()} {...props} />);

beforeEach(async () => {
  api.get.mockReset();
  await setLanguage('en');
});

// Day 99: search inside a chat.
describe('ChatSearch', () => {
  it('waits for 2 characters, then lists matches with the words marked', async () => {
    api.get.mockResolvedValue({ data: { results: [result(9, 'The Tea House at 5'), result(3, 'tea time?', 1)], nextCursor: null } });
    show();
    const box = screen.getByRole('searchbox', { name: 'Search messages' });
    expect(box).toHaveFocus();
    await userEvent.type(box, 't');
    expect(screen.getByText('Type at least 2 characters.')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    await userEvent.type(box, 'ea');
    const list = await screen.findByRole('list', { name: '2 messages found' });
    expect(api.get).toHaveBeenLastCalledWith('/conversations/7/search', { headers: { Authorization: 'Bearer tok' }, params: { q: 'tea', cursor: undefined } });
    const items = within(list).getAllByRole('button');
    expect(items[0].querySelector('mark').textContent).toBe('Tea');
    expect(items[1]).toHaveTextContent('You');
  });

  it('says when nothing matches, and when the search failed', async () => {
    api.get.mockResolvedValueOnce({ data: { results: [], nextCursor: null } });
    show();
    await userEvent.type(screen.getByRole('searchbox'), 'zebra');
    expect(await screen.findByText('No messages found.')).toBeInTheDocument();
    api.get.mockRejectedValueOnce({ response: { status: 403, data: 'You are not a participant in this conversation' } });
    await userEvent.type(screen.getByRole('searchbox'), 's');
    expect((await screen.findByRole('alert')).textContent).toBe('You are not a participant in this conversation');
  });

  it('a result opens the messages around it, the match highlighted; back to results, back to the chat', async () => {
    const onClose = vi.fn();
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.endsWith('/context')
        ? { messageId: 9, messages: [result(8, 'before'), result(9, 'The Tea House at 5'), { ...result(10, null, 1), deleted_at: now }] }
        : { results: [result(9, 'The Tea House at 5')], nextCursor: null }
    }));
    show({ onClose });
    await userEvent.type(screen.getByRole('searchbox'), 'tea');
    await userEvent.click(await screen.findByRole('button', { name: /The Tea House at 5/ }));
    const around = await screen.findByRole('region', { name: 'Around this message' });
    expect(api.get).toHaveBeenLastCalledWith('/conversations/7/messages/9/context', { headers: { Authorization: 'Bearer tok' } });
    const current = within(around).getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'true');
    expect(current.map((li) => li.textContent)).toEqual([expect.stringContaining('The Tea House at 5')]);
    expect(current[0].querySelector('mark').textContent).toBe('Tea');
    expect(within(around).getByText('This message was deleted')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to results' }));
    expect(screen.getByRole('searchbox')).toHaveValue('tea');
    await userEvent.click(screen.getByRole('button', { name: 'Back to the chat' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('loads more results', async () => {
    api.get.mockResolvedValueOnce({ data: { results: [result(9, 'map one')], nextCursor: 'c2' } })
      .mockResolvedValueOnce({ data: { results: [result(4, 'map two')], nextCursor: null } });
    show();
    await userEvent.type(screen.getByRole('searchbox'), 'map');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('list', { name: '2 messages found' })).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith('/conversations/7/search', expect.objectContaining({ params: { q: 'map', cursor: 'c2' } }));
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: { results: [result(9, 'شاي'), result(8, 'شاي آخر')], nextCursor: null } });
    show();
    await userEvent.type(screen.getByRole('searchbox', { name: 'ابحث في الرسائل' }), 'شاي');
    expect(await screen.findByRole('list', { name: 'رسالتان' })).toBeInTheDocument();
  });
});
