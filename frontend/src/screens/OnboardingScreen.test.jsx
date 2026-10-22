import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import OnboardingScreen from './OnboardingScreen';
import i18n, { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 9, username: 'newbie' }) }));
vi.mock('../utils/compressImage', () => ({ compressImage: async (f) => f }));

const H = { headers: { Authorization: 'Bearer tok' } };

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.post.mockResolvedValue({ data: { onboarded_at: '2026-10-22T12:00:00Z' } });
  api.put.mockResolvedValue({ data: {} });
  api.get.mockResolvedValue({ data: [] });
  await setLanguage('en');
});
afterEach(() => vi.restoreAllMocks());

const show = () => render(
  <MemoryRouter initialEntries={['/get-started']}>
    <Routes>
      <Route path="/get-started" element={<OnboardingScreen />} />
      <Route path="/" element={<p>Home screen</p>} />
    </Routes>
  </MemoryRouter>
);

// Day 78: the first-run steps.
describe('Onboarding', () => {
  it('welcomes by name, and choosing Arabic switches the app and saves it on the account', async () => {
    show();
    expect(screen.getByRole('heading', { name: 'Welcome, newbie!' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Step 1 of 4' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'العربية' }));
    expect(await screen.findByRole('button', { name: 'التالي' })).toBeInTheDocument();
    expect(i18n.language).toBe('ar');
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledWith('/profile/language', { language: 'ar' }, H));
  });

  it('a photo is uploaded on its own and shown', async () => {
    api.put.mockResolvedValue({ data: { avatar_url: 'https://res.cloudinary.com/x/image/upload/v1/avatars/a.png' } });
    const { container } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Add a profile photo' })).toBeInTheDocument();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' });
    await userEvent.upload(container.querySelector('input[type=file]'), file);
    expect(api.put).toHaveBeenCalledWith('/profile/avatar', expect.any(FormData), H);
    expect(await screen.findByRole('status')).toHaveTextContent('Photo saved.');
    expect(screen.getByText('Choose another photo')).toBeInTheDocument();
  });

  it("a refused photo shows the server's reason and the steps go on", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.put.mockRejectedValue({ response: { status: 400, data: 'Choose a photo' } });
    const { container } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.upload(container.querySelector('input[type=file]'), new File(['x'], 'x.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a photo');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it('finishing tells the server and opens Home; Back goes back a card', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Welcome, newbie!' })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(api.post).toHaveBeenCalledWith('/profile/onboarding/done', {}, H);
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it('suggests people to follow, and following happens in place', async () => {
    api.get.mockResolvedValue({ data: [
      { id: 2, username: 'bob', avatar_url: null, reason: 'popular', follower_count: 1 },
      { id: 3, username: 'cara', avatar_url: null, reason: 'popular', follower_count: 0 }
    ] });
    api.post.mockResolvedValue({ data: { status: 'accepted' } });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Find people to follow' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Find people to follow' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('Popular · 1 follower')).toBeInTheDocument(); // one, not "1 followers"
    expect(screen.getByText('New to MySocialApp')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/users/suggestions', H);
    const [followBob] = screen.getAllByRole('button', { name: /^Follow/ });
    await userEvent.click(followBob);
    expect(api.post).toHaveBeenCalledWith('/users/2/follow', {}, H);
  });

  it('with nobody to suggest it says where to find people; then the tour', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/No suggestions yet./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Where to find things' })).toBeInTheDocument();
    for (const name of ['Home', 'Search', 'Messages', 'Menu']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Step 4 of 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
  });

  it('Skip ends the steps from anywhere, and a failed save still lets you in', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.post.mockRejectedValue(new Error('offline'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(api.post).toHaveBeenCalledWith('/profile/onboarding/done', {}, H);
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });
});
