import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import api from '../../api';
import PrivacyToggle from './PrivacyToggle';
import { clearLocalSession } from '../../hooks/useAuth';

vi.mock('../../api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

beforeEach(() => {
  api.get.mockResolvedValue({ data: { is_private: false } });
});

describe('PrivacyToggle', () => {
  it('loads the setting while logged in', async () => {
    localStorage.setItem('token', 'tok');
    render(<PrivacyToggle />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/profile/me', { headers: { Authorization: 'Bearer tok' } }));
  });

  it('does not ask again when the session is cleared (logging out from Settings)', async () => {
    localStorage.setItem('token', 'tok');
    render(<PrivacyToggle />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    act(() => clearLocalSession());
    await new Promise((r) => setTimeout(r, 50));
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
