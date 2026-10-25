import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import api from '../../api';
import TimeZoneReporter from './TimeZoneReporter';

vi.mock('../../api', () => ({ default: { put: vi.fn() } }));
const auth = { token: 'tok', userId: 7 };
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  localStorage.clear();
});

// Day 84: the device's time zone, for the morning memories notification.
describe('TimeZoneReporter', () => {
  it('tells the server once per account and zone', async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const first = render(<TimeZoneReporter />);
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledWith('/profile/time-zone', { timeZone: zone }, { headers: { Authorization: 'Bearer tok' } }));
    await vi.waitFor(() => expect(localStorage.getItem('timeZoneReported')).toBe(`7:${zone}`));
    first.unmount();
    render(<TimeZoneReporter />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('nothing when logged out', async () => {
    auth.token = null;
    render(<TimeZoneReporter />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.put).not.toHaveBeenCalled();
    auth.token = 'tok';
  });
});
