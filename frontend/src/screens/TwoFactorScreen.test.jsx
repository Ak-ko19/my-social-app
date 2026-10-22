import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import TwoFactorScreen from './TwoFactorScreen';
import { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1, username: 'alice' }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
const CODES = ['abcde-fghjk', 'mnpqr-stuvw', 'xyz23-45678', '9abcd-efghj', 'kmnpq-rstuv', 'wxyz2-34567', '89abc-defgh', 'jkmnp-qrstu', 'vwxyz-23456', '789ab-cdefg'];
const OFF = { enabled: false, enabledAt: null, recoveryCodesLeft: 0 };
const ON = { enabled: true, enabledAt: '2026-10-20T10:00:00Z', recoveryCodesLeft: 10 };

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  await setLanguage('en');
});
afterEach(() => vi.restoreAllMocks());

const show = () => render(<MemoryRouter><TwoFactorScreen /></MemoryRouter>);

// Day 77: Settings > Two-factor authentication.
describe('Two-factor authentication screen', () => {
  it('sets up: password, QR code and key, a code, then the recovery codes', async () => {
    api.get.mockResolvedValue({ data: OFF });
    api.post.mockImplementation((url) => Promise.resolve({
      data: url === '/2fa/setup' ? { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://x', qr: 'data:image/svg+xml;base64,PHN2Zy8+' } : { recoveryCodes: CODES }
    }));
    show();
    expect(await screen.findByText('Off')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set up' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Password'), 'my-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(api.post).toHaveBeenCalledWith('/2fa/setup', { password: 'my-password-1' }, H);

    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toHaveAttribute('src', 'data:image/svg+xml;base64,PHN2Zy8+');
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    const turnOn = screen.getByRole('button', { name: 'Turn on' });
    // Letters are dropped; only six digits enable the button.
    await userEvent.type(screen.getByLabelText('6-digit code'), '12a345');
    expect(turnOn).toBeDisabled();
    await userEvent.type(screen.getByLabelText('6-digit code'), '6');
    expect(turnOn).toBeEnabled();
    await userEvent.click(turnOn);
    expect(api.post).toHaveBeenCalledWith('/2fa/enable', { code: '123456' }, H);

    expect(await screen.findByText('Two-factor authentication is on.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Your recovery codes' });
    expect(list).toHaveAttribute('dir', 'ltr');
    expect(list.querySelectorAll('li')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'I saved my codes' }));
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('10 unused recovery codes left.')).toBeInTheDocument();
    expect(screen.queryByText('abcde-fghjk')).toBeNull();
  });

  it("shows the server's message when the code is wrong", async () => {
    api.get.mockResolvedValue({ data: OFF });
    api.post.mockImplementation((url) => (url === '/2fa/setup'
      ? Promise.resolve({ data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://x', qr: 'data:image/svg+xml;base64,PHN2Zy8+' } })
      : Promise.reject({ response: { status: 400, data: 'That code is not right. Check that the time on your phone is correct and try again.' } })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    await userEvent.type(screen.getByLabelText('Password'), 'my-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(await screen.findByLabelText('6-digit code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(screen.getByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument();
  });

  it('when on: low codes warning, new codes, and turning off with a recovery code', async () => {
    api.get.mockResolvedValue({ data: { ...ON, recoveryCodesLeft: 2 } });
    api.post.mockImplementation((url) => Promise.resolve({ data: url === '/2fa/recovery-codes' ? { recoveryCodes: CODES } : { ok: true } }));
    show();
    expect(await screen.findByText(/2 unused recovery codes left\. Get new ones before you run out\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Get new recovery codes' }));
    await userEvent.type(screen.getByLabelText('Password'), 'my-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Get new recovery codes' }));
    expect(api.post).toHaveBeenCalledWith('/2fa/recovery-codes', { password: 'my-password-1' }, H);
    expect(await screen.findByText('abcde-fghjk')).toBeInTheDocument();
    expect(screen.queryByText('Two-factor authentication is on.')).toBeNull(); // only right after turning it on
    await userEvent.click(screen.getByRole('button', { name: 'I saved my codes' }));
    expect(screen.getByText('10 unused recovery codes left.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await userEvent.type(screen.getByLabelText('Password'), 'my-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    await userEvent.type(screen.getByLabelText('Recovery code'), 'abcde-fghjk');
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(api.post).toHaveBeenCalledWith('/2fa/disable', { password: 'my-password-1', recoveryCode: 'abcde-fghjk' }, H);
    expect(await screen.findByRole('status')).toHaveTextContent('Two-factor authentication is off.');
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('a failed load can be retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: OFF });
    show();
    expect(await screen.findByText("Couldn't load two-factor authentication. Please try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Off')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: { ...ON, recoveryCodesLeft: 3 } });
    show();
    expect(await screen.findByRole('heading', { name: 'المصادقة الثنائية' })).toBeInTheDocument();
    expect(screen.getByText(/تبقّت 3 رموز استرداد غير مستخدمة\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إيقاف' })).toBeInTheDocument();
  });
});
