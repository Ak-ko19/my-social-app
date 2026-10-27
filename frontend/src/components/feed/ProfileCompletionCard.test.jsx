import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '../../i18n';
import { dismissProfileCard } from '../../services/profileService';
import ProfileCompletionCard from './ProfileCompletionCard';

vi.mock('../../services/profileService', () => ({ dismissProfileCard: vi.fn() }));

const base = { photo: true, cover: false, bio: true, links: false, onboarded: true, dismissed: false };
const show = (completion) => render(<MemoryRouter><ProfileCompletionCard completion={completion} token="tok" /></MemoryRouter>);

beforeEach(async () => {
  dismissProfileCard.mockReset();
  dismissProfileCard.mockResolvedValue({});
  await setLanguage('en');
});

// Day 105: "Finish your profile" on Home.
describe('ProfileCompletionCard', () => {
  it("says how far along you are; what's left links to its field, what's done is ticked", () => {
    show(base);
    const card = screen.getByRole('region', { name: 'Finish your profile' });
    expect(card).toHaveTextContent('2 of 4 done');
    const bar = within(card).getByRole('progressbar', { name: '2 of 4 done' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(within(card).getByRole('link', { name: 'Add a cover photo' })).toHaveAttribute('href', '/edit-profile?focus=cover');
    expect(within(card).getByRole('link', { name: 'Add a link' })).toHaveAttribute('href', '/edit-profile?focus=links');
    expect(within(card).queryByRole('link', { name: 'Add a profile photo' })).toBeNull();
    expect(card).toHaveTextContent('Profile photo');
  });

  it("not before the first-run steps, not once hidden, not when everything's done, not before /profile/me", () => {
    for (const completion of [{ ...base, onboarded: false }, { ...base, dismissed: true }, { ...base, cover: true, links: true }, undefined]) {
      const { container, unmount } = show(completion);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("Don't show again hides it at once and keeps that on the server", async () => {
    show(base);
    await userEvent.click(screen.getByRole('button', { name: "Don't show again" }));
    expect(screen.queryByRole('region')).toBeNull();
    expect(dismissProfileCard).toHaveBeenCalledWith('tok');
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show({ ...base, photo: false });
    const card = screen.getByRole('region', { name: 'أكمل ملفك الشخصي' });
    expect(card).toHaveTextContent('اكتمل 1 من 4');
    expect(within(card).getByRole('link', { name: 'أضف صورة شخصية' })).toHaveAttribute('href', '/edit-profile?focus=photo');
  });
});
