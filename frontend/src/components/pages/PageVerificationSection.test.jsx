import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchPageVerification, requestPageVerification, withdrawPageVerification } from '../../services/pageService';
import PageVerificationSection from './PageVerificationSection';
import { setLanguage } from '../../i18n';

vi.mock('../../services/pageService', () => ({
  fetchPageVerification: vi.fn(),
  requestPageVerification: vi.fn(),
  withdrawPageVerification: vi.fn()
}));

const PAGE = { id: 4, name: 'Corner Cafe', description: 'Coffee', is_verified: false, is_admin: true };
const state = (extra = {}) => ({ verified_at: null, request: null, removed: null, can_request: true, why_not: null, next_request_at: null, ...extra });
const request = (extra = {}) => ({ id: 9, status: 'pending', note: 'The real Corner Cafe', link: null, created_at: '2026-10-20T10:00:00Z', decided_at: null, decline_reason: null, ...extra });
const show = (page = PAGE) => render(<PageVerificationSection page={page} token="tok" />);

beforeEach(async () => {
  for (const fn of [fetchPageVerification, requestPageVerification, withdrawPageVerification]) fn.mockReset();
  await setLanguage('en');
});

// Day 106: Edit page > Verification.
describe('PageVerificationSection', () => {
  it('asks with a note and an optional link; an empty note is refused before sending', async () => {
    fetchPageVerification.mockResolvedValue(state());
    requestPageVerification.mockResolvedValue(state({ can_request: false, why_not: 'pending', request: request() }));
    show();
    const ask = await screen.findByRole('button', { name: 'Ask for verification' });
    await userEvent.click(ask);
    expect(screen.getByRole('alert')).toHaveTextContent('Tell us who this page represents.');
    expect(requestPageVerification).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox', { name: 'Who does this page represent?' }), 'The real Corner Cafe');
    expect(screen.getByText('20/500')).toBeInTheDocument();
    await userEvent.click(ask);
    expect(requestPageVerification).toHaveBeenCalledWith(4, { note: 'The real Corner Cafe', link: null }, 'tok');
    expect(await screen.findByText('Your request is waiting for review')).toBeInTheDocument();
    expect(screen.getByText('The real Corner Cafe')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent("Request sent. We'll let you know when it's reviewed.");
    expect(screen.queryByRole('button', { name: 'Ask for verification' })).not.toBeInTheDocument();
  });

  it('a waiting request can be withdrawn', async () => {
    fetchPageVerification.mockResolvedValue(state({ can_request: false, why_not: 'pending', request: request() }));
    withdrawPageVerification.mockResolvedValue(state());
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw request' }));
    expect(withdrawPageVerification).toHaveBeenCalledWith(4, 'tok');
    expect(await screen.findByRole('button', { name: 'Ask for verification' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Request withdrawn.');
  });

  it('declined: says why and when the page can ask again; verified: says so and warns about renaming', async () => {
    fetchPageVerification.mockResolvedValue(state({
      can_request: false, why_not: 'wait', next_request_at: '2026-11-27T12:00:00Z',
      request: request({ status: 'declined', decided_at: '2026-10-28T12:00:00Z', decline_reason: 'impersonation' })
    }));
    const { unmount } = show();
    expect(await screen.findByText('Your last request was declined')).toBeInTheDocument();
    expect(screen.getByText("The page didn't appear to be who it says it is.")).toBeInTheDocument();
    expect(screen.getByText('You can ask again on November 27, 2026.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask for verification' })).not.toBeInTheDocument();
    unmount();

    fetchPageVerification.mockResolvedValue(state({ verified_at: '2026-10-21T12:00:00Z', can_request: false, why_not: 'verified', request: request({ status: 'approved' }) }));
    show({ ...PAGE, is_verified: true });
    expect(await screen.findByText('This page is verified')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Verified' })).toBeInTheDocument();
    expect(screen.getByText("Changing the page's name removes its blue tick. You can ask again afterwards.")).toBeInTheDocument();
  });

  it('no About text: says to add one first; a server refusal shows its words, in Arabic too', async () => {
    fetchPageVerification.mockResolvedValue(state({ can_request: false, why_not: 'no_about' }));
    const { unmount } = show({ ...PAGE, description: null });
    expect(await screen.findByText('Add an About text above before asking for verification.')).toBeInTheDocument();
    unmount();

    await setLanguage('ar');
    fetchPageVerification.mockResolvedValue(state());
    requestPageVerification.mockRejectedValue({ response: { status: 400, data: 'Enter a web address that starts with http:// or https://, up to 300 characters.' } });
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: 'من تمثّل هذه الصفحة؟' }), 'مقهى');
    await userEvent.type(screen.getByRole('textbox', { name: 'الموقع أو الحساب الرسمي (اختياري)' }), 'ftp://x');
    await userEvent.click(screen.getByRole('button', { name: 'طلب التوثيق' }));
    expect(requestPageVerification).toHaveBeenCalledWith(4, { note: 'مقهى', link: 'ftp://x' }, 'tok');
    expect(await screen.findByRole('alert')).toHaveTextContent('أدخل عنوان ويب يبدأ بـ http:// أو https://، بحد أقصى 300 حرف.');
  });
});
