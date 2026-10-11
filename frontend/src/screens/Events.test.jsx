import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../api';
import EventsScreen from './EventsScreen';
import EventFormScreen from './EventFormScreen';
import EventScreen from './EventScreen';
import { setLanguage } from '../i18n';
import AR from '../i18n/locales/ar.json';
import { toLocalInputValue } from '../utils/localTime';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, resolveImageUrl: (u) => u }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const H = { headers: { Authorization: 'Bearer tok' } };
const HOUR = 60 * 60 * 1000;
const event = (extra = {}) => ({
  id: 5, name: 'Beach clean-up', description: 'Bring gloves', location: 'North pier', audience: 'public',
  starts_at: new Date(Date.now() + 48 * HOUR).toISOString(), ends_at: null, cancelled_at: null, has_ended: false,
  host_id: 2, host_username: 'bob', going_count: 3, interested_count: 1, my_response: null, is_host: false, ...extra
});
const routes = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/events" element={<EventsScreen />} />
      <Route path="/events/new" element={<EventFormScreen />} />
      <Route path="/events/:id" element={<EventScreen />} />
      <Route path="/events/:id/edit" element={<EventFormScreen />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  // Where a test lands on an event page without setting this up.
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/guests') ? { guests: [], page: 1, hasMore: false } : event()
  }));
});

// Day 55: events.
describe('Events list', () => {
  beforeEach(() => {
    api.get.mockImplementation((url, opts) => {
      if (opts.params.section === 'mine') {
        return Promise.resolve({ data: { events: [event({ my_response: 'going' })], page: opts.params.page, hasMore: opts.params.page === 1 } });
      }
      return Promise.resolve({ data: { events: [event({ id: 6, name: 'Book club' })], page: 1, hasMore: false } });
    });
  });

  it('your events first, with your answer; Load more; Discover tab', async () => {
    routes('/events');
    const link = await screen.findByRole('link', { name: /Beach clean-up/ });
    expect(link).toHaveAttribute('href', '/events/5');
    expect(within(link).getByText('Going')).toBeInTheDocument();
    expect(within(link).getByText('Hosted by bob · 3 going')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(api.get).toHaveBeenCalledWith('/events', { ...H, params: { section: 'mine', page: 2, limit: 20 } });
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    expect(await screen.findByRole('link', { name: /Book club/ })).toBeInTheDocument();
  });
});

describe('Create / edit an event', () => {
  it('sends the times as instants, from the local pickers', async () => {
    api.post.mockResolvedValue({ data: event({ id: 9 }) });
    routes('/events/new');
    await userEvent.type(screen.getByLabelText('Event name'), 'Picnic');
    const start = new Date(Date.now() + 30 * HOUR);
    start.setSeconds(0, 0);
    const startInput = screen.getByLabelText('Starts');
    await userEvent.clear(startInput);
    await userEvent.type(startInput, toLocalInputValue(start));
    await userEvent.click(screen.getByRole('radio', { name: /Followers/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(api.post).toHaveBeenCalledWith('/events', {
      name: 'Picnic', startsAt: start.toISOString(), endsAt: null, location: '', description: '', audience: 'followers'
    }, H);
  });

  it('an end before the start is caught before sending; the server\'s reason shows', async () => {
    routes('/events/new');
    await userEvent.type(screen.getByLabelText('Event name'), 'Picnic');
    const startValue = screen.getByLabelText('Starts').value;
    const before = new Date(new Date(startValue).getTime() - HOUR);
    await userEvent.type(screen.getByLabelText('Ends (optional)'), toLocalInputValue(before));
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The event must end after it starts.');
    expect(api.post).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Ends (optional)'));
    api.post.mockRejectedValueOnce({ response: { status: 400, data: 'The event must start in the future' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The event must start in the future');
  });

  it('editing loads the event; only its host may', async () => {
    api.get.mockResolvedValue({ data: event({ is_host: false }) });
    routes('/events/5/edit');
    expect(await screen.findByText('Only the host can edit this event.')).toBeInTheDocument();
  });
});

describe('Event page', () => {
  it('Going / Interested; pressing your answer again takes it back', async () => {
    api.get.mockImplementation((url) => (url.endsWith('/guests')
      ? Promise.resolve({ data: { guests: [{ id: 3, username: 'cat' }], page: 1, hasMore: false } })
      : Promise.resolve({ data: event() })));
    api.put.mockResolvedValue({ data: event({ my_response: 'going', going_count: 4 }) });
    api.delete.mockResolvedValue({ data: event({ my_response: null }) });
    routes('/events/5');
    expect(await screen.findByRole('heading', { name: 'Beach clean-up', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('North pier')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'cat' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    expect(api.put).toHaveBeenCalledWith('/events/5/response', { status: 'going' }, H);
    expect(await screen.findByRole('button', { name: 'Going', pressed: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Going' }));
    expect(api.delete).toHaveBeenCalledWith('/events/5/response', H);
  });

  it('the host cancels after asking; then the page says so and the answers go', async () => {
    api.get.mockImplementation((url) => (url.endsWith('/guests')
      ? Promise.resolve({ data: { guests: [], page: 1, hasMore: false } })
      : Promise.resolve({ data: event({ is_host: true }) })));
    api.post.mockResolvedValue({ data: event({ is_host: true, cancelled_at: new Date().toISOString() }) });
    routes('/events/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel event' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Cancel Beach clean-up?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel event' }));
    expect(api.post).toHaveBeenCalledWith('/events/5/cancel', {}, H);
    expect(await screen.findByText('The host cancelled this event.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Going' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeNull();
  });

  it('a deleted event: says so, with no Try again', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    routes('/events/5');
    expect(await screen.findByText('This event no longer exists.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockImplementation((url) => (url.endsWith('/guests')
      ? Promise.resolve({ data: { guests: [], page: 1, hasMore: false } })
      : Promise.resolve({ data: event() })));
    routes('/events/5');
    expect(await screen.findByRole('button', { name: AR.events.going })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(AR.events.goingCount_few.replace('{{count}}', '3')))).toBeInTheDocument();
    await setLanguage('en');
  });
});
