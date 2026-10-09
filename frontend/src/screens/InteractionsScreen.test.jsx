import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import InteractionsScreen from './InteractionsScreen';
import { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: { message_permission: 'everyone', comment_permission: 'followers' } });
  api.put.mockReset();
});
const show = () => render(<MemoryRouter><InteractionsScreen /></MemoryRouter>);

// Day 47: who can message / comment.
describe('Messages and comments settings', () => {
  it('shows the saved choices and saves a new one at once', async () => {
    api.put.mockResolvedValue({ data: { message_permission: 'following', comment_permission: 'followers' } });
    show();
    expect(await screen.findByRole('radio', { name: 'Everyone' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Your followers' })).toBeChecked();
    await userEvent.click(screen.getAllByRole('radio', { name: 'People you follow' })[0]);
    expect(api.put).toHaveBeenCalledWith('/profile/interactions', { messagePermission: 'following' }, H);
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('a failed save goes back to what was saved, and says so', async () => {
    api.put.mockRejectedValue(new Error('offline'));
    show();
    await userEvent.click(await screen.findByRole('radio', { name: 'No one new' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that. Please try again.");
    expect(screen.getByRole('radio', { name: 'Everyone' })).toBeChecked();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByRole('group', { name: 'من يمكنه مراسلتك' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'لا أحد جديد' })).toBeInTheDocument();
  });
});
