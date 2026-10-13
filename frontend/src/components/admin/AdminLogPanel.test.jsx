import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '../../i18n';
import { fetchAdminLog } from '../../services/adminService';
import AdminLogPanel from './AdminLogPanel';

vi.mock('../../services/adminService', () => ({ fetchAdminLog: vi.fn() }));

const at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const entry = (id, action, targetType, label, details = {}) => ({
  id, admin_id: 1, admin_username: 'alice', action, target_type: targetType, target_id: '9', target_label: label, details, created_at: at
});
const PAGE1 = {
  page: 1,
  hasMore: true,
  actions: [
    entry(5, 'user_suspended', 'user', 'dave', { days: 7, reason: 'spam links', reportsResolved: 2 }),
    entry(4, 'content_removed', 'post', 'bob', { reportId: 3, reportsResolved: 1 }),
    entry(3, 'report_dismissed', 'community', 'Hikers', { reportId: 2, reportsResolved: 1 }),
    entry(2, 'user_unbanned', 'user', null),
    entry(1, 'error_resolved', 'error', 'Something exploded')
  ]
};
const strip = (s) => s.replace(/[⁨⁩]/g, '');

beforeEach(async () => {
  fetchAdminLog.mockReset();
  fetchAdminLog.mockResolvedValueOnce(PAGE1).mockResolvedValue({ page: 2, hasMore: false, actions: [entry(0, 'user_banned', 'user', 'eve')] });
  await setLanguage('en');
});

// Day 63: Admin > Log.
describe('Admin log', () => {
  it('each decision as a sentence: who did what to whom, why, and how many reports it closed', async () => {
    render(<AdminLogPanel token="tok" />);
    await screen.findByText(/suspended/);
    const sentences = [...document.querySelectorAll('.admin-log-sentence')].map((p) => strip(p.textContent));
    expect(sentences).toEqual([
      'alice suspended dave for 7 days',
      'alice removed a post by bob',
      'alice dismissed the reports on the group Hikers',
      'alice lifted the ban on a deleted account',
      'alice marked an error as resolved: Something exploded'
    ]);
    expect(screen.getByText('spam links')).toBeInTheDocument();
    expect(screen.getByText(/closed 2 reports/)).toBeInTheDocument();
    expect(screen.getAllByText(/closed 1 report$/)).toHaveLength(2);
  });

  it('older ones on demand; one kind at a time', async () => {
    render(<AdminLogPanel token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));
    expect(strip((await screen.findByText(/ banned /)).textContent)).toBe('alice banned eve');
    expect(fetchAdminLog).toHaveBeenLastCalledWith('tok', { action: '', page: 2 });
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
    fetchAdminLog.mockResolvedValue({ page: 1, hasMore: false, actions: [] });
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'Bans');
    await waitFor(() => expect(fetchAdminLog).toHaveBeenLastCalledWith('tok', { action: 'user_banned', page: 1 }));
    expect(await screen.findByText('None of these yet.')).toBeInTheDocument();
  });

  it('in Arabic, with Arabic plurals; names keep their own direction', async () => {
    await setLanguage('ar');
    render(<AdminLogPanel token="tok" />);
    const first = await screen.findByText(/علّق/);
    expect(first.textContent).toBe('علّق ⁨alice⁩ حساب ⁨dave⁩ لمدة 7 أيام');
    expect(screen.getByText(/أُغلق بلاغان/)).toBeInTheDocument();
  });
});
