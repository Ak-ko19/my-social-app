import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import api from './api';
import Notifications from './Notifications';
import { setLanguage } from './i18n';
import SocketContext from './context/SocketContext';

vi.mock('./api', () => ({ default: { get: vi.fn(), put: vi.fn() }, resolveImageUrl: (url) => url }));

const me = { actor_id: 1, actor_username: 'alice', actor_avatar_url: null, is_read: false, created_at: '2026-10-07T09:00:00Z' };

beforeEach(() => {
  localStorage.setItem('token', 'tok');
  // Day 81: opening a notification marks it read.
  api.put.mockResolvedValue({ data: { is_read: true } });
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
    await userEvent.click(await screen.findByRole('button', { name: 'Open group Trail Runners' }));
    expect(await screen.findByText('Group page')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    showWithGroups();
    expect((await screen.findByText('dana', { selector: 'strong' })).parentElement).toHaveTextContent('طلب dana الانضمام إلى Night Owls');
    expect(screen.getByRole('button', { name: 'فتح المجموعة Trail Runners' })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Open page Corner Cafe' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Open event Picnic' }));
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

// Day 77: a login on a new kind of device.
describe('Notifications: new login', () => {
  const show = (device) => {
    api.get.mockResolvedValue({
      data: { notifications: [{ ...me, id: 20, type: 'new_login', post_id: null, comment_id: null, device }] }
    });
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings/sessions" element={<p>Sessions screen</p>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('names the device and opens the list of devices', async () => {
    await setLanguage('en');
    show({ browser: 'Safari', os: 'iOS', kind: 'mobile' });
    expect((await screen.findByText('New login', { selector: 'strong' })).parentElement)
      .toHaveTextContent('New login to your account from Safari on iOS. Not you? Check your devices and change your password.');
    await userEvent.click(screen.getByRole('button', { name: 'Check your devices' }));
    expect(await screen.findByText('Sessions screen')).toBeInTheDocument();
  });

  it('says "unknown" for what the browser did not tell, in Arabic too', async () => {
    await setLanguage('ar');
    show({ browser: null, os: 'Android', kind: 'mobile' });
    expect((await screen.findByText('تسجيل دخول جديد', { selector: 'strong' })).parentElement).toHaveTextContent('متصفح غير معروف');
    expect(screen.getByRole('button', { name: 'راجع أجهزتك' })).toBeInTheDocument();
  });
});

// Day 81: the notifications center -- grouped rows, tabs, paging, links and
// live news.
describe('Notifications: center', () => {
  const person = (id, username) => ({ id, username, avatar_url: null });
  const like = (overrides) => ({ ...me, id: 30, type: 'like', post_id: 5, comment_id: null, post_content: 'My trip', count: 1, actor_count: 1, actors: [person(1, 'alice')], ...overrides });
  const page = (notifications, nextCursor = null) => ({ data: { notifications, nextCursor } });
  const where = () => screen.getByTestId('where').textContent;
  // A whole sentence (names are in <strong>, so plain text matching can't see it).
  const sentence = (re) => (_, el) => Boolean(el?.classList?.contains('notif-sentence') && re.test(el.textContent));
  const showCenter = (path = '/notifications', socket = null) => render(
    <SocketContext.Provider value={socket ? { socket, connectionState: 'connected' } : null}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/posts/:id" element={<p data-testid="where">post page</p>} />
          <Route path="/profile/:id/connections" element={<p data-testid="where">followers page</p>} />
        </Routes>
      </MemoryRouter>
    </SocketContext.Provider>
  );

  beforeEach(async () => {
    await setLanguage('en');
    localStorage.setItem('userId', '7');
    api.get.mockReset();
  });

  it('a group names two people and counts the rest (one / many)', async () => {
    api.get.mockResolvedValue(page([
      like({ id: 33, count: 3, actor_count: 3, actors: [person(3, 'cara'), person(2, 'bob'), person(1, 'alice')] }),
      like({ id: 32, post_id: 6, count: 2, actor_count: 2, actors: [person(2, 'bob'), person(1, 'alice')] }),
      { ...me, id: 31, type: 'follow', post_id: null, comment_id: null, post_content: null, count: 6, actor_count: 6, actors: [person(9, 'zed'), person(8, 'yan'), person(4, 'dan')] }
    ]));
    showCenter();
    expect(await screen.findByText(sentence(/cara, bob and 1 other liked your post/))).toBeInTheDocument();
    expect(screen.getByText(sentence(/bob and alice liked your post/))).toBeInTheDocument();
    expect(screen.getByText(sentence(/zed, yan and 4 others started following you/))).toBeInTheDocument();
  });

  it('...and in Arabic', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue(page([like({ count: 5, actor_count: 5, actors: [person(3, 'cara'), person(2, 'bob')] })]));
    showCenter();
    expect(await screen.findByText(sentence(/أعجب cara وbob و3 أشخاص آخرين بمنشورك/))).toBeInTheDocument();
  });

  it('tapping opens what it is about and reads it', async () => {
    api.get.mockResolvedValue(page([like({})]));
    api.put.mockResolvedValue({ data: { is_read: true, marked: 1 } });
    showCenter();
    await userEvent.click(await screen.findByRole('link', { name: /alice liked your post/ }));
    expect(api.put).toHaveBeenCalledWith('/notifications/30/read', {}, { headers: { Authorization: 'Bearer tok' } });
    expect(await screen.findByText('post page')).toBeInTheDocument();
  });

  it('a group of new followers opens your followers', async () => {
    api.get.mockResolvedValue(page([{ ...me, id: 31, type: 'follow', post_id: null, comment_id: null, post_content: null, count: 2, actor_count: 2, actors: [person(9, 'zed'), person(8, 'yan')] }]));
    showCenter();
    await userEvent.click(await screen.findByRole('link', { name: /zed and yan started following you/ }));
    expect(await screen.findByText('followers page')).toBeInTheDocument();
    expect(where()).toBe('followers page');
  });

  it('tabs ask the server for their kind, and say when there is nothing', async () => {
    api.get.mockResolvedValue(page([like({})]));
    showCenter();
    await screen.findByText(sentence(/alice liked your post/));
    api.get.mockResolvedValue(page([]));
    await userEvent.click(screen.getByRole('tab', { name: 'Unread' }));
    expect(api.get).toHaveBeenLastCalledWith('/notifications', expect.objectContaining({ params: { filter: 'unread' } }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Unread' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Follows' }));
    expect(await screen.findByText('No new followers or follow requests yet.')).toBeInTheDocument();
  });

  it('Load more brings older ones, once each', async () => {
    api.get.mockResolvedValueOnce(page([like({ id: 40 })], 'CUR')).mockResolvedValueOnce(page([like({ id: 40 }), like({ id: 39, post_id: 9, actors: [person(5, 'eve')], actor_username: 'eve' })]));
    showCenter();
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(api.get).toHaveBeenLastCalledWith('/notifications', expect.objectContaining({ params: { filter: 'all', cursor: 'CUR' } }));
    expect(await screen.findByText(sentence(/eve liked your post/))).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('something new while the list is open: offered, not pushed in', async () => {
    const handlers = {};
    const socket = { on: (event, fn) => { handlers[event] = fn; }, off: () => {} };
    api.get.mockResolvedValue(page([like({})]));
    showCenter('/notifications', socket);
    await screen.findByText(sentence(/alice liked your post/));
    await act(async () => handlers.notification_new({ unreadCount: 2 }));
    const pill = screen.getByRole('button', { name: 'New notifications · Show' });
    api.get.mockResolvedValue(page([like({ id: 41, actors: [person(6, 'fay')], actor_username: 'fay' }), like({})]));
    await userEvent.click(pill);
    expect(await screen.findByText(sentence(/fay liked your post/))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New notifications · Show' })).toBeNull();
  });
});
