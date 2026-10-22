import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import api from './api';
import Login from './Login';
import { setLanguage } from './i18n';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }));

async function logIn() {
  render(<MemoryRouter><Login /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText(/email/i), 'dave@example.com');
  await userEvent.type(screen.getByLabelText(/password/i), 'a-fine-password-123');
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
  return screen.findByRole('alert');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Login errors', () => {
  it('a suspended account is told until when (Day 12)', async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: { message: 'This account is suspended', until: '2026-10-03T12:00:00Z' } } });
    const alert = await logIn();
    expect(alert.textContent).toMatch(/^Your account is suspended until .*2026.*\.$/);
    expect(alert.textContent).not.toMatch(/:\d\d:\d\d/); // no seconds
  });

  it('...in Arabic too', async () => {
    await setLanguage('ar');
    api.post.mockRejectedValue({ response: { status: 403, data: { message: 'This account is suspended', until: '2026-10-03T12:00:00Z' } } });
    render(<MemoryRouter><Login /></MemoryRouter>);
    const [email, password] = document.querySelectorAll('form input:not([name=website])');
    await userEvent.type(email, 'dave@example.com');
    await userEvent.type(password, 'a-fine-password-123');
    await userEvent.click(document.querySelector('form button[type=submit]'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/^حسابك موقوف مؤقتًا حتى .*2026.*.$/);
  });

  it('a banned account gets the server\'s message', async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: 'This account has been banned' } });
    expect((await logIn()).textContent).toBe('This account has been banned');
  });

  it('sends the honeypot along and disables the button while waiting', async () => {
    let finish;
    api.post.mockReturnValue(new Promise((resolve, reject) => { finish = reject; }));
    render(<MemoryRouter><Login /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(api.post).toHaveBeenCalledWith('/login', { email: 'a@example.com', password: 'secret-password', website: '' });
    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
    finish({ response: { status: 401, data: 'Invalid email or password' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: /log in/i })).toBeEnabled();
  });
});

// Day 77: two-factor authentication -- the code step after the password.
describe('Login with two-factor authentication', () => {
  function Where() {
    const location = useLocation();
    return <p data-testid="where">{location.pathname}{location.state?.recoveryCodeLogin !== undefined ? `?left=${location.state.recoveryCodeLogin}` : ''}</p>;
  }
  const SESSION = { token: 'tok', id: 4, username: 'dave', emailVerified: true, reactivated: false, language: 'en' };

  beforeEach(async () => {
    localStorage.clear();
    api.post.mockReset();
    await setLanguage('en');
  });

  async function toCodeStep() {
    api.post.mockResolvedValueOnce({ data: { twoFactorRequired: true, challengeToken: 'challenge-1' } });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.type(screen.getByLabelText(/email/i), 'dave@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a-fine-password-123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await screen.findByRole('heading', { name: 'Enter your code' });
  }

  it('asks for the code, sends it with the challenge, then logs in', async () => {
    await toCodeStep();
    expect(localStorage.getItem('token')).toBeNull();
    const input = screen.getByLabelText('6-digit code');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('dir', 'ltr');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6-digit code from your authenticator app.');
    api.post.mockResolvedValueOnce({ data: SESSION });
    await userEvent.type(input, '12x3 456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(api.post).toHaveBeenLastCalledWith('/login/2fa', { challengeToken: 'challenge-1', code: '123 456' });
    expect(await screen.findByTestId('where')).toHaveTextContent('/');
    expect(localStorage.getItem('token')).toBe('tok');
  });

  it("a new account's first login opens the first-run steps (Day 78)", async () => {
    await toCodeStep();
    api.post.mockResolvedValueOnce({ data: { ...SESSION, needsOnboarding: true } });
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/get-started');
  });

  it('a recovery code instead, then Settings > Two-factor with a notice', async () => {
    await toCodeStep();
    await userEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
    expect(screen.getByLabelText('Recovery code')).toHaveFocus();
    api.post.mockResolvedValueOnce({ data: { ...SESSION, recoveryCodesLeft: 4 } });
    await userEvent.type(screen.getByLabelText('Recovery code'), 'abcde-fghjk');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(api.post).toHaveBeenLastCalledWith('/login/2fa', { challengeToken: 'challenge-1', recoveryCode: 'abcde-fghjk' });
    expect(await screen.findByTestId('where')).toHaveTextContent('/settings/two-factor?left=4');
  });

  it('a wrong code stays on the step; an expired one goes back to the password', async () => {
    await toCodeStep();
    api.post.mockRejectedValueOnce({ response: { status: 400, data: 'That code is not right. Check that the time on your phone is correct and try again.' } });
    await userEvent.type(screen.getByLabelText('6-digit code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();

    api.post.mockRejectedValueOnce({ response: { status: 400, data: 'Your login has expired. Please log in again.' } });
    await userEvent.clear(screen.getByLabelText('6-digit code'));
    await userEvent.type(screen.getByLabelText('6-digit code'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Your login has expired. Please log in again.');
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });

  it('"Back to login" returns to the password step, and it all reads in Arabic', async () => {
    await toCodeStep();
    await userEvent.click(screen.getByRole('button', { name: 'Back to login' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await setLanguage('ar');
    api.post.mockResolvedValueOnce({ data: { twoFactorRequired: true, challengeToken: 'challenge-2' } });
    await userEvent.click(document.querySelector('form button[type=submit]'));
    expect(await screen.findByRole('heading', { name: 'أدخل الرمز' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحقّق' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'استخدام رمز استرداد بدلًا من ذلك' })).toBeInTheDocument();
  });
});
