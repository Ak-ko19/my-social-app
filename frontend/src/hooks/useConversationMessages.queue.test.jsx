import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConversationMessages } from './useConversationMessages';
import { fetchMessages, sendMessageRest } from '../services/messageService';
import { readOutbox } from '../utils/offlineStore';

vi.mock('../services/messageService', () => ({
  fetchMessages: vi.fn(),
  sendMessageRest: vi.fn(),
  markConversationRead: vi.fn(() => Promise.resolve()),
  deleteMessageRest: vi.fn(),
  editMessageRest: vi.fn(),
  setMessageReactionRest: vi.fn(),
  sendVoiceMessageRest: vi.fn(),
  sendImageMessageRest: vi.fn()
}));
// No live socket in these tests: sends go over REST.
vi.mock('./useSocket', () => ({ useSocket: () => ({ socket: null, connectionState: 'disconnected' }) }));

const setOnline = (value) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};
const open = () => renderHook(() => useConversationMessages('4', 'tok', 1));
const texts = (result) => result.current.messages.map((m) => `${m.content}:${m.status}`);

beforeEach(() => {
  fetchMessages.mockReset();
  sendMessageRest.mockReset();
  fetchMessages.mockResolvedValue({ messages: [], nextCursor: null });
  sendMessageRest.mockImplementation(async (conv, content, tempId) => ({ id: 100 + content.length, client_temp_id: tempId, conversation_id: 4, sender_id: 1, content, status: 'sent', created_at: new Date().toISOString() }));
});
afterEach(() => {
  setOnline(true);
  localStorage.clear();
  vi.restoreAllMocks();
});

// Day 72: messages written offline wait, and go by themselves later.
describe('useConversationMessages offline queue', () => {
  it('offline: a text waits (queued, kept on the device) and is sent when the connection is back', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => setOnline(false));
    act(() => result.current.sendMessage('see you at 5'));
    expect(texts(result)).toEqual(['see you at 5:queued']);
    expect(sendMessageRest).not.toHaveBeenCalled();
    await waitFor(() => expect(readOutbox(1, 4).map((m) => m.content)).toEqual(['see you at 5']));

    act(() => setOnline(true));
    await waitFor(() => expect(texts(result)).toEqual(['see you at 5:sent']));
    expect(sendMessageRest).toHaveBeenCalledTimes(1);
    expect(readOutbox(1, 4)).toEqual([]);
  });

  it('a reload keeps what waited; opening the chat online sends it, oldest first', async () => {
    const first = open();
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    act(() => setOnline(false));
    act(() => first.result.current.sendMessage('one'));
    act(() => first.result.current.sendMessage('two'));
    await waitFor(() => expect(readOutbox(1, 4)).toHaveLength(2));
    first.unmount();

    const again = open();
    await waitFor(() => expect(texts(again.result)).toEqual(['one:queued', 'two:queued']));
    act(() => setOnline(true));
    await waitFor(() => expect(again.result.current.messages.every((m) => m.status === 'sent')).toBe(true));
    expect(sendMessageRest.mock.calls.map((c) => c[1])).toEqual(['one', 'two']);
  });

  it("Don't send removes a waiting text, from the screen and the device", async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => setOnline(false));
    act(() => result.current.sendMessage('never mind'));
    const tempId = result.current.messages[0].client_temp_id;
    act(() => result.current.cancelQueued(tempId));
    expect(result.current.messages).toEqual([]);
    await waitFor(() => expect(readOutbox(1, 4)).toEqual([]));
    act(() => setOnline(true));
    expect(sendMessageRest).not.toHaveBeenCalled();
  });

  it('online, a send that fails with a server error is "failed" (Retry), not queued', async () => {
    sendMessageRest.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.sendMessage('hello'));
    await waitFor(() => expect(texts(result)).toEqual(['hello:failed']));
    expect(readOutbox(1, 4)).toEqual([]);
    // A server error has no reason to show: Retry is the answer.
    expect(result.current.messages[0]._error).toBeNull();
  });

  // Day 102: a refused send keeps the server's reason for the bubble.
  it('a refused send (429, 403) is failed with the reason the server gave', async () => {
    const reason = "New accounts can message up to 5 people who don't follow them in their first day. Please try again tomorrow.";
    sendMessageRest.mockRejectedValueOnce(Object.assign(new Error('429'), { response: { status: 429, data: reason } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.sendMessage('hi stranger'));
    await waitFor(() => expect(texts(result)).toEqual(['hi stranger:failed']));
    expect(result.current.messages[0]._error).toBe(reason);
  });
});
