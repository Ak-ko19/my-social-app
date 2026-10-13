import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '../../i18n';
import { fetchOverview } from '../../services/adminService';
import AdminOverviewPanel from './AdminOverviewPanel';

vi.mock('../../services/adminService', () => ({ fetchOverview: vi.fn() }));

// Seven days, oldest first, today last.
const series = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']
  .map((day, i) => ({ day, signups: i, posts: 2 * i, comments: 0, reports: i === 3 ? 1 : 0 }));
const DATA = {
  days: 7,
  series,
  totals: {
    users: { count: 12, estimated: false },
    posts: { count: 152340, estimated: true },
    comments: { count: 0, estimated: false },
    groups: 3,
    pages: 1,
    pendingReports: 2,
    openErrors: 1
  },
  storage: { database: { percent: 12.5, level: 'ok' }, cloudinary: { percent: null, level: 'unknown' } }
};

beforeEach(async () => {
  fetchOverview.mockReset();
  fetchOverview.mockResolvedValue(DATA);
  await setLanguage('en');
});

// Day 61: Admin > Overview.
describe('Admin overview', () => {
  it('shows the totals (≈ for an estimate) and what needs attention, each opening its section', async () => {
    const open = vi.fn();
    render(<AdminOverviewPanel token="tok" onOpenSection={open} />);
    const totals = await screen.findByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('12')).toBeInTheDocument();
    expect(within(totals).getByText('≈ 152,340')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /2 reports waiting for review/ }));
    await userEvent.click(screen.getByRole('button', { name: /1 unresolved error$/ }));
    await userEvent.click(screen.getByRole('button', { name: /Storage: database 12.5%, media not known/ }));
    expect(open.mock.calls).toEqual([['reports'], ['errors'], ['storage']]);
    expect(fetchOverview).toHaveBeenCalledWith('tok', 30);
  });

  it('one bar per day, oldest first, today paler; the period switches', async () => {
    render(<AdminOverviewPanel token="tok" onOpenSection={() => {}} />);
    const chart = await screen.findByRole('img', { name: 'Posts: Total: 42' });
    const bars = chart.querySelectorAll('rect');
    expect(bars).toHaveLength(7);
    expect([...bars].map((b) => Number(b.getAttribute('x')))).toEqual([1, 11, 21, 31, 41, 51, 61]);
    expect(bars[6]).toHaveClass('is-today');
    expect(bars[0].querySelector('title').textContent).toBe('Oct 7: 0');
    await userEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(fetchOverview).toHaveBeenLastCalledWith('tok', 7));
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('every day is also in a table, newest first', async () => {
    render(<AdminOverviewPanel token="tok" onOpenSection={() => {}} />);
    await userEvent.click(await screen.findByText('Show the numbers as a table'));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(8); // the header + 7 days
    expect(rows[1]).toHaveTextContent('Today so far6120');
    expect(rows[7]).toHaveTextContent('Oct 70000');
  });

  it('in Arabic: newest bar on the left, Arabic plurals, Latin digits', async () => {
    await setLanguage('ar');
    render(<AdminOverviewPanel token="tok" onOpenSection={() => {}} />);
    const chart = await screen.findByRole('img', { name: 'المنشورات: الإجمالي: 42' });
    expect([...chart.querySelectorAll('rect')].map((b) => Number(b.getAttribute('x')))).toEqual([61, 51, 41, 31, 21, 11, 1]);
    expect(screen.getByRole('button', { name: /بلاغان بانتظار المراجعة/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 يومًا' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('≈ 152,340')).toBeInTheDocument();
  });

  it('a failed load offers a retry', async () => {
    fetchOverview.mockRejectedValueOnce(new Error('offline'));
    render(<AdminOverviewPanel token="tok" onOpenSection={() => {}} />);
    expect(await screen.findByText("Couldn't load the overview.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('region', { name: 'Totals' })).toBeInTheDocument();
  });
});
