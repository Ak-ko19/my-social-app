import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import MemoriesScreen from './MemoriesScreen';
import MemoriesCard from '../components/feed/MemoriesCard';
import { setLanguage } from '../i18n';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 7, username: 'mira' }) }));
vi.mock('../components/feed/PostCard', () => ({ default: ({ post }) => <article>{post.content}</article> }));

const post = (id, content) => ({ id, content, user_id: 7, username: 'mira', created_at: '2025-10-25T09:00:00Z' });
const DATA = {
  date: '2026-10-25',
  memories: [
    { yearsAgo: 1, year: 2025, posts: [post(1, 'Hiking day'), post(2, 'Back home')] },
    { yearsAgo: 3, year: 2023, posts: [post(3, 'First post here')] }
  ]
};

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  localStorage.clear();
  await setLanguage('en');
});
afterEach(() => vi.restoreAllMocks());

// Days 83-84: Memories.
describe('Memories screen', () => {
  const show = () => render(<MemoryRouter><MemoriesScreen /></MemoryRouter>);

  it('asks for today in this device\'s time zone and shows one section per year', async () => {
    api.get.mockResolvedValue({ data: DATA });
    show();
    expect(await screen.findByRole('heading', { name: '1 year ago · 2025' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 years ago · 2023' })).toBeInTheDocument();
    expect(screen.getByText('Your posts from October 25 in earlier years. Only you can see this.')).toBeInTheDocument();
    expect(screen.getAllByRole('article').map((a) => a.textContent)).toEqual(['Hiking day', 'Back home', 'First post here']);
    const [, options] = api.get.mock.calls[0];
    expect(options.params.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('nothing today says so', async () => {
    api.get.mockResolvedValue({ data: { date: '2026-10-25', memories: [] } });
    show();
    expect(await screen.findByText(/^No memories today./)).toHaveAttribute('role', 'status');
  });

  it('a failed load offers to try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ data: DATA });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: '1 year ago · 2025' })).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: DATA });
    show();
    expect(await screen.findByRole('heading', { name: 'قبل سنة · 2025' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'قبل 3 سنوات · 2023' })).toBeInTheDocument();
  });
});

describe('"On this day" card on Home', () => {
  const showCard = () => render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<MemoriesCard token="tok" userId={7} />} />
        <Route path="/memories" element={<p>Memories screen</p>} />
      </Routes>
    </MemoryRouter>
  );

  it('shows the newest year and a first post, and opens Memories', async () => {
    api.get.mockResolvedValue({ data: DATA });
    showCard();
    expect(await screen.findByRole('heading', { name: 'On this day' })).toBeInTheDocument();
    expect(screen.getByText('You have memories from 1 year ago.')).toBeInTheDocument();
    expect(screen.getByText('“Hiking day”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'See your memories' }));
    expect(await screen.findByText('Memories screen')).toBeInTheDocument();
  });

  it('is not there without memories', async () => {
    api.get.mockResolvedValue({ data: { date: '2026-10-25', memories: [] } });
    const { container } = showCard();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.querySelector('.memories-card')).toBeNull();
  });

  it('hides for the rest of the day, and only that day', async () => {
    api.get.mockResolvedValue({ data: DATA });
    const first = showCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Hide for today' }));
    expect(screen.queryByRole('heading', { name: 'On this day' })).toBeNull();
    first.unmount();
    showCard();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'On this day' })).toBeNull();
    first.unmount();
    // Tomorrow it can come back.
    api.get.mockResolvedValue({ data: { ...DATA, date: '2026-10-26' } });
    showCard();
    expect(await screen.findAllByRole('heading', { name: 'On this day' })).not.toHaveLength(0);
  });
});
