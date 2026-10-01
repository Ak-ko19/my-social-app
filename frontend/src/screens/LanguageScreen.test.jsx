import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import api from '../api';
import LanguageScreen from './LanguageScreen';
import Login from '../Login';
import { chooseLanguage, pickedLanguage } from '../utils/languageChoice';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }));

// Day 16: the app language follows the account to every device.
beforeEach(() => {
  api.put.mockResolvedValue({ data: { language: 'my' } });
});

const logIn = () => {
  localStorage.setItem('token', 'tok');
  localStorage.setItem('userId', '1');
};
const screenEl = () => render(<MemoryRouter><LanguageScreen /></MemoryRouter>);

describe('Language screen', () => {
  it('logged in: switches the app and saves the choice to the account', async () => {
    logIn();
    screenEl();
    await userEvent.click(screen.getByRole('radio', { name: /မြန်မာ/ }));
    await waitFor(() => expect(i18n.language).toBe('my'));
    expect(api.put).toHaveBeenCalledWith('/profile/language', { language: 'my' }, { headers: { Authorization: 'Bearer tok' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('if the account can\'t be updated, the app still switches and says so quietly', async () => {
    logIn();
    api.put.mockRejectedValue(new Error('offline'));
    screenEl();
    await userEvent.click(screen.getByRole('radio', { name: /العربية/ }));
    await waitFor(() => expect(i18n.language).toBe('ar'));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر حفظ هذا في حسابك الآن');
  });

  it('logged out: this device now, and remembered for the next login here', async () => {
    screenEl();
    await userEvent.click(screen.getByRole('radio', { name: /မြန်မာ/ }));
    await waitFor(() => expect(i18n.language).toBe('my'));
    expect(api.put).not.toHaveBeenCalled();
    expect(pickedLanguage()).toBe('my');
  });
});

describe('Login and the account language', () => {
  const submit = async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const [email, password] = document.querySelectorAll('form input:not([name=website])');
    await userEvent.type(email, 'a@example.com');
    await userEvent.type(password, 'secret-password');
    await userEvent.click(document.querySelector('form button[type=submit]'));
  };
  const loginReply = (language) => ({ data: { token: 'new-token', id: 1, username: 'a', emailVerified: true, reactivated: false, language } });

  it('a new device takes the account\'s language', async () => {
    api.post.mockResolvedValue(loginReply('ar'));
    await submit();
    await waitFor(() => expect(i18n.language).toBe('ar'));
    expect(api.put).not.toHaveBeenCalled();
  });

  it('a device default is never written to the account', async () => {
    api.post.mockResolvedValue(loginReply(null));
    await submit();
    await waitFor(() => expect(localStorage.getItem('token')).toBe('new-token'));
    expect(api.put).not.toHaveBeenCalled();
    expect(i18n.language).toBe('en');
  });

  it('a language picked here while logged out wins at login and is saved to the account', async () => {
    await chooseLanguage('my', null);
    api.post.mockResolvedValue(loginReply('en'));
    await submit();
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/profile/language', { language: 'my' }, { headers: { Authorization: 'Bearer new-token' } }));
    expect(i18n.language).toBe('my');
    expect(pickedLanguage()).toBeUndefined(); // used up
  });

  it('nothing to do when they already match', async () => {
    api.post.mockResolvedValue(loginReply('en'));
    await submit();
    await waitFor(() => expect(localStorage.getItem('token')).toBe('new-token'));
    expect(api.put).not.toHaveBeenCalled();
    expect(i18n.language).toBe('en');
  });
});
