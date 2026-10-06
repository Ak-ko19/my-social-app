import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForwardSheet from './ForwardSheet';
import { fetchConversations } from '../../services/messageService';

// Day 32: picking chats to forward a message to.
vi.mock('../../services/messageService', () => ({ fetchConversations: vi.fn() }));

const CHATS = [1, 2, 3, 4, 5, 6].map((n) => ({ conversation_id: n, username: n === 6 ? 'Tea club' : `friend${n}`, avatar_url: null, type: n === 6 ? 'group' : 'direct' }));

beforeEach(() => {
  fetchConversations.mockResolvedValue(CHATS);
});

function renderSheet(onSend = vi.fn()) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(<ForwardSheet open token="tok" onSend={onSend} onDone={onDone} onClose={onClose} />);
  return { onSend, onDone, onClose };
}

describe('ForwardSheet', () => {
  it('lists your chats and filters them by name', async () => {
    renderSheet();
    await screen.findByRole('checkbox', { name: 'friend1' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), { target: { value: 'TEA' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Tea club' })).toBeInTheDocument();
  });

  it('Send is off until a chat is picked, and at 5 the rest are disabled', async () => {
    renderSheet();
    await screen.findByRole('checkbox', { name: 'friend1' });
    expect(screen.getByRole('button', { name: 'Send (0)' })).toBeDisabled();
    for (const n of [1, 2, 3, 4, 5]) fireEvent.click(screen.getByRole('checkbox', { name: `friend${n}` }));
    expect(screen.getByRole('button', { name: 'Send (5)' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Tea club' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'friend5' }));
    expect(screen.getByRole('checkbox', { name: 'Tea club' })).toBeEnabled();
  });

  it('all sent: reports the count and closes', async () => {
    const onSend = vi.fn().mockResolvedValue({ forwarded: [{ conversation_id: 1 }, { conversation_id: 6 }], failed: [] });
    const { onDone, onClose } = renderSheet(onSend);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'friend1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tea club' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send (2)' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSend).toHaveBeenCalledWith([1, 6]);
    expect(onDone).toHaveBeenCalledWith(2);
  });

  it('some refused: stays open, names them, and keeps only those ticked', async () => {
    const onSend = vi.fn().mockResolvedValue({ forwarded: [{ conversation_id: 1 }], failed: [{ conversationId: 2, status: 403 }] });
    const { onDone, onClose } = renderSheet(onSend);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'friend1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'friend2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send (2)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't forward to: friend2");
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(1);
    expect(screen.getByRole('checkbox', { name: 'friend1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'friend2' })).toBeChecked();
  });

  it('every chat refused: names them', async () => {
    const onSend = vi.fn().mockRejectedValue({ response: { status: 429, data: { forwarded: [], failed: [{ conversationId: 3, status: 429 }] } } });
    const { onDone } = renderSheet(onSend);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'friend3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't forward to: friend3");
    expect(onDone).not.toHaveBeenCalled();
  });

  it('says so when the chats cannot be loaded', async () => {
    fetchConversations.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderSheet();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your chats");
  });
});
