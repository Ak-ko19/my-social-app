import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../api';
import AdminStoragePanel from './AdminStoragePanel';
import { setLanguage } from '../../i18n';
import AR from '../../i18n/locales/ar.json';

vi.mock('../../api', () => ({ default: { get: vi.fn() } }));

const MB = 1024 * 1024;
const report = (extra = {}) => ({
  database: { bytes: 430 * MB, limitBytes: 512 * MB, percent: 84, level: 'warn', tables: [{ name: 'posts', bytes: 200 * MB }, { name: 'messages', bytes: 90 * MB }] },
  cloudinary: { configured: true, plan: 'Free', creditsUsed: 24, creditsLimit: 25, percent: 96, level: 'alert', storageBytes: 3 * 1024 * MB, bandwidthBytes: 5 * MB, objects: 1200 },
  uploads: { files: 3, bytes: 6 * MB, topUploaders: [{ id: 2, username: 'bob', files: 2, bytes: 5 * MB }] },
  warnings: [{ source: 'database', level: 'warn' }, { source: 'cloudinary', level: 'alert' }],
  warnAt: 80,
  alertAt: 95,
  ...extra
});

beforeEach(() => api.get.mockReset());

// Day 57: Admin > Storage.
describe('Admin storage panel', () => {
  it('warns from 80 %, alerts from 95 %, with meters and the numbers', async () => {
    api.get.mockResolvedValue({ data: report() });
    render(<AdminStoragePanel token="tok" />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual([
      'Database is 84% full.',
      'Photos and voice (Cloudinary) is almost full: 96%. Act now.'
    ]);
    expect(screen.getByText('430 MB of 512 MB (84%)')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Database' })).toHaveAttribute('aria-valuenow', '84');
    expect(screen.getByText('24 of 25 credits (96%)')).toBeInTheDocument();
    expect(screen.getByText('3 GB')).toBeInTheDocument();
    expect(screen.getByText('posts')).toBeInTheDocument();
    expect(screen.getByText('3 files, 6 MB')).toBeInTheDocument();
    expect(screen.getByText('2 files, 5 MB')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/storage', { headers: { Authorization: 'Bearer tok' } });
  });

  it('Cloudinary not set up, or unreachable: says so; no warnings when all is fine', async () => {
    api.get.mockResolvedValue({ data: report({ cloudinary: { configured: false, level: 'unknown' }, warnings: [] }) });
    const { unmount } = render(<AdminStoragePanel token="tok" />);
    expect(await screen.findByText('Not set up on this server.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();
    api.get.mockResolvedValue({ data: report({ cloudinary: { configured: true, error: 'unavailable', level: 'unknown' }, warnings: [] }) });
    render(<AdminStoragePanel token="tok" />);
    expect(await screen.findByText("Couldn't reach Cloudinary just now.")).toBeInTheDocument();
  });

  it('a failed load can be retried; Refresh asks again', async () => {
    api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: report({ warnings: [] }) });
    render(<AdminStoragePanel token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('430 MB of 512 MB (84%)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: report() });
    render(<AdminStoragePanel token="tok" />);
    expect(await screen.findByText(`430 ${AR.admin.storage.unit.MB} من 512 ${AR.admin.storage.unit.MB} (84%)`)).toBeInTheDocument();
    await setLanguage('en');
  });
});
