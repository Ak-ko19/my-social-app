import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '../i18n';
import { bulkReports, fetchReports } from '../services/adminService';
import AdminScreen from './AdminScreen';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));
vi.mock('../services/adminService', () => ({
  fetchReports: vi.fn(),
  bulkReports: vi.fn(),
  dismissReport: vi.fn(),
  removeReportedContent: vi.fn(),
  banUser: vi.fn(),
  suspendUser: vi.fn(),
  unbanUser: vi.fn()
}));

const at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const report = (id, content) => ({
  id, target_type: 'post', target_id: id + 100, reason: 'spam', status: 'pending', created_at: at, pending_for_target: 1,
  target_exists: true, post_content: content, post_author_id: 7, post_author_username: 'bob'
});
const PAGE = { reports: [report(1, 'cheap pills'), report(2, 'free money'), report(3, 'click here')], hasMore: false, page: 1 };
const show = () => render(<MemoryRouter initialEntries={['/admin?section=reports']}><AdminScreen /></MemoryRouter>);
const ACCOUNT_REFUSED = 'Accounts cannot be removed here; ban or suspend the user instead';

beforeEach(async () => {
  fetchReports.mockReset();
  bulkReports.mockReset();
  fetchReports.mockResolvedValue(PAGE);
  await setLanguage('en');
});

// Day 103: acting on several reports at once.
describe('Admin > Reports: bulk actions', () => {
  it('pick reports, dismiss them together; the list reloads and says what happened', async () => {
    bulkReports.mockResolvedValue({ done: [1, 3], skipped: [], failed: [] });
    show();
    const boxes = await screen.findAllByRole('checkbox', { name: /^Select the report: Spam/ });
    expect(boxes).toHaveLength(3);
    // Day 103: "Post by <target>bob</target>" -- the name is the link (a <link> tag rendered it empty).
    expect(screen.getAllByRole('link', { name: 'bob' })[0]).toHaveAttribute('href', '/profile/7');
    const bar = screen.getByRole('region', { name: 'Act on several reports' });
    expect(within(bar).getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[2]);
    expect(bar).toHaveTextContent('2 selected');
    await userEvent.click(within(bar).getByRole('button', { name: 'Dismiss' }));
    expect(bulkReports).toHaveBeenCalledWith('dismiss', [1, 3], 'tok');
    expect(await screen.findByRole('status')).toHaveTextContent('2 dismissed');
    expect(fetchReports).toHaveBeenCalledTimes(2);
    // A fresh list starts with nothing picked.
    expect(bar).toHaveTextContent('0 selected');
  });

  it('select all, Remove asks first, then reports what was done, skipped and refused', async () => {
    bulkReports.mockResolvedValue({ done: [1], skipped: [2], failed: [{ id: 3, error: ACCOUNT_REFUSED }] });
    show();
    await screen.findAllByRole('checkbox', { name: /^Select the report/ });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    expect(screen.getByRole('region', { name: 'Act on several reports' })).toHaveTextContent('3 selected');
    await userEvent.click(screen.getByRole('button', { name: 'Remove content' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove what 3 reports are about?' });
    expect(bulkReports).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove content' }));
    expect(bulkReports).toHaveBeenCalledWith('remove', [1, 2, 3], 'tok');
    expect(await screen.findByRole('status')).toHaveTextContent(`1 removed · 1 already handled · 1 couldn't be: ${ACCOUNT_REFUSED}`);
  });

  it('a refusal is translated, in Arabic', async () => {
    await setLanguage('ar');
    bulkReports.mockResolvedValue({ done: [], skipped: [], failed: [{ id: 1, error: ACCOUNT_REFUSED }] });
    show();
    const [first] = await screen.findAllByRole('checkbox', { name: /^تحديد البلاغ/ });
    await userEvent.click(first);
    await userEvent.click(within(screen.getByRole('region', { name: 'إجراء على عدة بلاغات' })).getByRole('button', { name: 'تجاهل' }));
    expect(await screen.findByRole('status')).toHaveTextContent('تعذّر بلاغ واحد: لا يمكن حذف الحسابات من هنا');
  });
});
