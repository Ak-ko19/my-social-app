import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useMediaMessages } from './useMediaMessages';
import { sendImageMessageRest, sendVoiceMessageRest } from '../services/messageService';

vi.mock('../services/messageService', () => ({ sendVoiceMessageRest: vi.fn(), sendImageMessageRest: vi.fn() }));

// A tiny stand-in for useConversationMessages' message state.
function useHarness() {
  const [messages, setMessages] = useState([]);
  const mergeMessages = (incoming) => setMessages((current) => {
    const key = (m) => (m.id != null ? `id:${m.id}` : `tmp:${m.client_temp_id}`);
    const byKey = new Map(current.map((m) => [key(m), m]));
    for (const m of incoming) {
      if (m.id != null && m.client_temp_id) byKey.delete(`tmp:${m.client_temp_id}`);
      byKey.set(key(m), m);
    }
    return [...byKey.values()];
  });
  const media = useMediaMessages({ conversationId: '4', conversationIdNum: 4, token: 'tok', currentUserId: 1, setMessages, mergeMessages });
  return { messages, ...media };
}

beforeEach(() => {
  sendVoiceMessageRest.mockReset();
  sendImageMessageRest.mockReset();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:local');
  globalThis.URL.revokeObjectURL = vi.fn();
});

// Day 71: voice notes and photos (split out of useConversationMessages).
describe('useMediaMessages', () => {
  it('a voice note: an optimistic bubble with progress, then the saved message', async () => {
    let finish;
    sendVoiceMessageRest.mockImplementation((conv, blob, tempId, token, { onUploadProgress }) => {
      onUploadProgress({ loaded: 1, total: 4 });
      return new Promise((resolve) => { finish = () => resolve({ id: 50, client_temp_id: tempId, type: 'voice', media_url: 'https://x/v.mp3' }); });
    });
    const { result } = renderHook(() => useHarness());
    act(() => result.current.sendVoiceMessage(new Blob(['a']), 3));
    expect(result.current.messages[0]).toMatchObject({ id: null, type: 'voice', status: 'sending', media_url: 'blob:local', duration_seconds: 3, _uploadProgress: 25 });
    await act(async () => finish());
    expect(result.current.messages).toEqual([expect.objectContaining({ id: 50, media_url: 'https://x/v.mp3' })]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
  });

  it('a failed photo stays (marked failed, file kept); a retry replaces it with a fresh send', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendImageMessageRest
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (conv, file, tempId) => ({ id: 60, client_temp_id: tempId, type: 'image' })); // the server echoes the temporary id
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    const { result } = renderHook(() => useHarness());
    act(() => result.current.sendImageMessage(file, { id: 7, sender_id: 2, content: 'hi' }));
    await waitFor(() => expect(result.current.messages[0].status).toBe('failed'));
    const failed = result.current.messages[0];
    expect(failed).toMatchObject({ type: 'image', _imageFile: file, reply_to_message_id: 7, reply_to: { id: 7, content: 'hi' } });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => result.current.retryImageSend(failed.client_temp_id, file, { id: 7, sender_id: 2, content: 'hi' }));
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual([60]));
    expect(sendImageMessageRest).toHaveBeenLastCalledWith('4', file, expect.any(String), 'tok', expect.objectContaining({ replyToMessageId: 7 }));
    expect(sendImageMessageRest.mock.calls[1][2]).not.toBe(failed.client_temp_id); // a new temporary id
  });
});
