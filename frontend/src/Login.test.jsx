import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
