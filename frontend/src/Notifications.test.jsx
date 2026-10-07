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
