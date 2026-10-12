import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import api from './api';
import Notifications from './Notifications';
import { setLanguage } from './i18n';

vi.mock('./api', () => ({ default: { get: vi.fn(), put: vi.fn() }, resolveImageUrl: (url) => url }));

const me = { actor_id: 1, actor_username: 'alice', actor_avatar_url: null, is_read: false, created_at: '2026-10-07T09:00:00Z' };

beforeEach(() => {
  localStorage.setItem('token', 'tok');
  api.get.mockResolvedValue({
    data: {
      notifications: [
        { ...me, id: 2, type: 'scheduled_failed', post_id: null, comment_id: null, post_content: null },
        { ...me, id: 1, type: 'scheduled_post', post_id: 5, comment_id: null, post_content: 'Good morning' }
      ]
    }
  });
});

const show = () => render(<MemoryRouter><Notifications /></MemoryRouter>);

// Day 45: notifications about your own scheduled posts.
describe('Notifications: scheduled posts', () => {
  it('says what happened, in English', async () => {
    show();
    expect(await screen.findByText('Your scheduled post was published')).toBeInTheDocument();
    expect(screen.getByText("Your scheduled post couldn't be published. It's back in your drafts.")).toBeInTheDocument();
    expect(screen.getByText('“Good morning”')).toBeInTheDocument();
  });

  it('...and in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByText('نُشر منشورك المجدول')).toBeInTheDocument();
    expect(screen.getByText('تعذّر نشر منشورك المجدول. أُعيد إلى مسوداتك.')).toBeInTheDocument();
  });
});

// Day 50: groups -- a request to join one you run; you were let in.
describe('Notifications: groups', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        notifications: [
          { ...me, id: 5, actor_username: 'dana', type: 'group_request', post_id: null, comment_id: null, community_id: 12, community_name: 'Night Owls' },
          { ...me, id: 6, type: 'group_approved', post_id: null, comment_id: null, community_id: 13, community_name: 'Trail Runners' }
        ]
      }
    });
  });
  const showWithGroups = () => render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Routes>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/groups/:id/manage" element={<p>Manage page</p>} />
        <Route path="/groups/:id" element={<p>Group page</p>} />
      </Routes>
    </MemoryRouter>
  );

  it('names the group; a request opens Manage group', async () => {
    await setLanguage('en');
    showWithGroups();
    expect((await screen.findByText('dana', { selector: 'strong' })).parentElement).toHaveTextContent('dana asked to join Night Owls');
    expect(screen.getByText('Trail Runners', { selector: 'strong' }).parentElement).toHaveTextContent("You're now a member of Trail Runners");
    await userEvent.click(screen.getByRole('button', { name: 'Review requests to join Night Owls' }));
    expect(await screen.findByText('Manage page')).toBeInTheDocument();
  });

  it('being let in opens the group', async () => {
    await setLanguage('en');
    showWithGroups();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Trail Runners' }));
    expect(await screen.findByText('Group page')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    showWithGroups();
    expect((await screen.findByText('dana', { selector: 'strong' })).parentElement).toHaveTextContent('طلب dana الانضمام إلى Night Owls');
    expect(screen.getByRole('button', { name: 'فتح Trail Runners' })).toBeInTheDocument();
  });
});

// Day 53: made an admin of a page.
describe('Notifications: pages', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: { notifications: [{ ...me, id: 9, actor_username: 'olga', type: 'page_admin', post_id: null, comment_id: null, page_id: 4, page_name: 'Corner Cafe' }] }
    });
  });

  it('names the page and opens it', async () => {
    await setLanguage('en');
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/pages/:id" element={<p>Page screen</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect((await screen.findByText('olga', { selector: 'strong' })).parentElement).toHaveTextContent('olga made you an admin of Corner Cafe');
    await userEvent.click(screen.getByRole('button', { name: 'Open Corner Cafe' }));
    expect(await screen.findByText('Page screen')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect((await screen.findByText('olga', { selector: 'strong' })).parentElement).toHaveTextContent('جعلك olga مشرفًا على Corner Cafe');
    await setLanguage('en');
  });
});

// Day 55: an event you answered -- its reminder, or the host cancelling.
describe('Notifications: events', () => {
  const startsAt = '2026-10-12T15:00:00Z';
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        notifications: [
          { ...me, id: 11, actor_username: 'olga', type: 'event_reminder', post_id: null, comment_id: null, event_id: 8, event_name: 'Picnic', event_starts_at: startsAt },
          { ...me, id: 12, actor_username: 'olga', type: 'event_cancelled', post_id: null, comment_id: null, event_id: 9, event_name: 'Book club', event_starts_at: startsAt }
        ]
      }
    });
  });

  it('the reminder shows the start in your time; cancelled names who; both open the event', async () => {
    await setLanguage('en');
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/events/:id" element={<p>Event screen</p>} />
        </Routes>
      </MemoryRouter>
    );
    const time = new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect((await screen.findByText('Picnic', { selector: 'strong' })).parentElement).toHaveTextContent(`Picnic starts at ${time}`);
    expect(screen.getByText('Book club', { selector: 'strong' }).parentElement).toHaveTextContent('olga cancelled Book club');
    await userEvent.click(screen.getByRole('button', { name: 'Open Picnic' }));
    expect(await screen.findByText('Event screen')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect((await screen.findByText('Book club', { selector: 'strong' })).parentElement).toHaveTextContent('ألغى olga Book club');
    await setLanguage('en');
  });
});

// Day 45: a poll ended -- yours, or one you voted in.
describe('Notifications: polls ended', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        notifications: [
          { ...me, id: 3, type: 'poll_ended_own', post_id: 8, comment_id: null, post_content: 'Tea or coffee?' },
          { ...me, id: 4, actor_id: 2, actor_username: 'bob', type: 'poll_ended', post_id: 9, comment_id: null, post_content: 'Best trail?' }
        ]
      }
    });
  });

  it('in English', async () => {
    show();
    expect(await screen.findByText('Your poll has ended. See the results.')).toBeInTheDocument();
    expect(screen.getByText('bob', { selector: 'strong' }).parentElement).toHaveTextContent("bob's poll has ended. See the results.");
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByText('انتهى استطلاعك. اطّلع على النتائج.')).toBeInTheDocument();
    expect(screen.getByText('bob', { selector: 'strong' }).parentElement).toHaveTextContent('انتهى استطلاع bob. اطّلع على النتائج.');
  });
});
