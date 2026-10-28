import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '../../i18n';
import { approvePageVerification, declinePageVerification, fetchPageVerifications, unverifyPage } from '../../services/adminService';
import AdminVerificationPanel from './AdminVerificationPanel';

vi.mock('../../services/adminService', () => ({
  fetchPageVerifications: vi.fn(),
  approvePageVerification: vi.fn(),
  declinePageVerification: vi.fn(),
  unverifyPage: vi.fn()
}));

const at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const item = (id, extra = {}, page = {}) => ({
  id, status: 'pending', note: `We are page ${id}`, link: null, created_at: at, decided_at: null, decline_reason: null,
  requested_by_username: 'olga', decided_by_username: null, other_declines: 0,
  page: { id: 40 + id, name: `Page ${id}`, category: 'business', description: 'Tea since 1990', created_at: at, verified_at: null, owner_id: 3, owner_username: 'olga', follower_count: 12, post_count: 1, ...page },
  ...extra
});
const list = (requests, extra = {}) => ({ requests, hasMore: false, page: 1, ...extra });
const show = () => render(<MemoryRouter><AdminVerificationPanel token="tok" /></MemoryRouter>);

beforeEach(async () => {
  for (const fn of [fetchPageVerifications, approvePageVerification, declinePageVerification, unverifyPage]) fn.mockReset();
  await setLanguage('en');
});

// Day 106: Admin > Verification.
describe('AdminVerificationPanel', () => {
  it('lists the waiting requests with the page, its owner, the note and the link; approve refreshes the list', async () => {
    fetchPageVerifications.mockResolvedValueOnce(list([item(1, { link: 'https://tea.example', other_declines: 2 }), item(2)])).mockResolvedValueOnce(list([item(2)]));
    approvePageVerification.mockResolvedValue({ id: 1, status: 'approved' });
    show();
    expect(fetchPageVerifications).toHaveBeenCalledWith('tok', { status: 'pending', page: 1 });
    const [first] = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(within(first).getByRole('link', { name: 'Page 1' })).toHaveAttribute('href', '/pages/41');
    expect(first).toHaveTextContent('12 followers');
    expect(first).toHaveTextContent('1 post');
    expect(first).toHaveTextContent('Declined 2 times before');
    expect(first).toHaveTextContent('We are page 1');
    const link = within(first).getByRole('link', { name: 'https://tea.example' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    expect(link).toHaveAttribute('target', '_blank');

    await userEvent.click(within(first).getByRole('button', { name: 'Approve' }));
    expect(approvePageVerification).toHaveBeenCalledWith(1, 'tok');
    expect(await screen.findByText('Page 1 is now verified.')).toBeInTheDocument();
    expect(await screen.findAllByRole('listitem')).toHaveLength(1);
  });

  it('declining needs a reason first', async () => {
    fetchPageVerifications.mockResolvedValue(list([item(1)]));
    declinePageVerification.mockResolvedValue({ id: 1, status: 'declined', decline_reason: 'impersonation' });
    show();
    const card = await screen.findByRole('listitem');
    await userEvent.click(within(card).getByRole('button', { name: 'Decline' }));
    expect(within(card).getByRole('alert')).toHaveTextContent('Choose a reason first.');
    expect(declinePageVerification).not.toHaveBeenCalled();
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Reason to decline Page 1' }), 'impersonation');
    await userEvent.click(within(card).getByRole('button', { name: 'Decline' }));
    expect(declinePageVerification).toHaveBeenCalledWith(1, 'impersonation', 'tok');
    expect(await screen.findByText('The request for Page 1 was declined.')).toBeInTheDocument();
  });

  it('Decided shows who decided; a still-verified page can lose its tick after a reason and a confirmation, in Arabic too', async () => {
    await setLanguage('ar');
    fetchPageVerifications.mockResolvedValueOnce(list([])).mockResolvedValue(list([
      item(1, { status: 'approved', decided_at: at, decided_by_username: 'root' }, { verified_at: at }),
      item(2, { status: 'declined', decided_at: at, decided_by_username: 'root', decline_reason: 'not_notable' })
    ]));
    unverifyPage.mockResolvedValue({ id: 41, verified_at: null });
    show();
    expect(await screen.findByText('لا توجد صفحات بانتظار التوثيق.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'تم البت فيها' }));
    expect(fetchPageVerifications).toHaveBeenLastCalledWith('tok', { status: 'reviewed', page: 1 });
    const [approved, declined] = await screen.findAllByRole('listitem');
    expect(within(approved).getByRole('img', { name: 'موثّق' })).toBeInTheDocument();
    expect(approved).toHaveTextContent('وافق عليه root');
    expect(declined).toHaveTextContent('غير معروفة بما يكفي');
    expect(within(declined).queryByRole('button', { name: 'إزالة العلامة' })).not.toBeInTheDocument();

    await userEvent.selectOptions(within(approved).getByRole('combobox'), 'impersonation');
    await userEvent.click(within(approved).getByRole('button', { name: 'إزالة العلامة' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('إزالة العلامة الزرقاء عن Page 1؟');
    await userEvent.click(within(dialog).getByRole('button', { name: 'إزالة العلامة' }));
    expect(unverifyPage).toHaveBeenCalledWith(41, 'impersonation', 'tok');
    expect(await screen.findByText('لم تعد Page 1 موثّقة.')).toBeInTheDocument();
  });
});
