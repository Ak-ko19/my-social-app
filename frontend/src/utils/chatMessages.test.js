import { describe, expect, it } from 'vitest';
import { buildReplyPreview, localKey, sortByCreatedAt, syncQuotes } from './chatMessages';

// Day 71: the chat window's pure helpers.
describe('chat message helpers', () => {
  it('sorts by time; same millisecond: by id, a still-optimistic one last', () => {
    const t = '2026-01-01T10:00:00.000Z';
    const rows = [{ id: null, client_temp_id: 'x', created_at: t }, { id: 9, created_at: t }, { id: 3, created_at: t }, { id: 1, created_at: '2026-01-01T09:59:59.000Z' }];
    expect(rows.sort(sortByCreatedAt).map((m) => m.id)).toEqual([1, 3, 9, null]);
  });

  it('keys a message by its id, or by its temporary id until it has one', () => {
    expect(localKey({ id: 5, client_temp_id: 'x' })).toBe('id:5');
    expect(localKey({ id: null, client_temp_id: 'x' })).toBe('tmp:x');
  });

  it('builds a reply quote like the server does, and keeps quotes in step with the original', () => {
    expect(buildReplyPreview(null)).toBeNull();
    expect(buildReplyPreview({ id: 2, sender_id: 7, content: 'a'.repeat(200) })).toEqual({ id: 2, sender_id: 7, type: 'text', deleted: false, content: 'a'.repeat(120) });
    expect(buildReplyPreview({ id: 2, sender_id: 7, content: 'gone', deleted_at: 'x' }).content).toBeNull();
    const list = [{ id: 3, reply_to: { id: 2, content: 'old' } }, { id: 4, reply_to: { id: 9, content: 'other' } }, { id: 5 }];
    const synced = syncQuotes(list, 2, { deleted: true, content: null });
    expect(synced[0].reply_to).toEqual({ id: 2, content: null, deleted: true });
    expect(synced[1]).toBe(list[1]);
    expect(synced[2]).toBe(list[2]);
  });
});
