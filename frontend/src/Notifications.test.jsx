import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
