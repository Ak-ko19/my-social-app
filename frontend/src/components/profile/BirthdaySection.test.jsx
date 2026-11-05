import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import BirthdaySection from './BirthdaySection';
import ProfileDetails from './ProfileDetails';
import { saveBirthday } from '../../services/profileService';
import { birthdayText, daysIn } from '../../utils/birthday';
import { setLanguage } from '../../i18n';

vi.mock('../../services/profileService', () => ({ saveBirthday: vi.fn() }));

beforeEach(async () => {
  saveBirthday.mockReset();
  await setLanguage('en');
});

// Day 111: a birthday (month and day, no year) and who sees it.
describe('BirthdaySection', () => {
  it('saves a month, a day and who sees it; a month without that day lets the day go', async () => {
    saveBirthday.mockResolvedValue({ birthday: { month: 2, day: 29 }, birthday_audience: 'public' });
    render(<BirthdaySection initial={{ month: null, day: null, audience: 'friends' }} token="tok" />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    const month = screen.getByRole('combobox', { name: 'Month' });
    const day = screen.getByRole('combobox', { name: 'Day' });
    await userEvent.selectOptions(month, '1');
    await userEvent.selectOptions(day, '31');
    await userEvent.selectOptions(month, '2');
    expect(day).toHaveValue('');
    expect(screen.getAllByRole('option', { name: '29' })).toHaveLength(1);
    expect(screen.queryByRole('option', { name: '30' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save birthday' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a month and a day.');
    expect(saveBirthday).not.toHaveBeenCalled();
    await userEvent.selectOptions(day, '29');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Who can see it' }), 'public');
    await userEvent.click(screen.getByRole('button', { name: 'Save birthday' }));
    expect(saveBirthday).toHaveBeenCalledWith({ month: 2, day: 29, audience: 'public' }, 'tok');
    expect(await screen.findByRole('status')).toHaveTextContent('Birthday saved.');
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('removes a saved birthday; a refusal shows the server words, in Arabic too', async () => {
    saveBirthday.mockResolvedValueOnce({ birthday: null, birthday_audience: 'friends' });
    const { unmount } = render(<BirthdaySection initial={{ month: 3, day: 5, audience: 'friends' }} token="tok" />);
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue('3');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(saveBirthday).toHaveBeenCalledWith({ month: null, day: null }, 'tok');
    expect(await screen.findByText('Birthday removed.')).toBeInTheDocument();
    unmount();

    await setLanguage('ar');
    saveBirthday.mockRejectedValueOnce({ response: { status: 400, data: 'Choose a day that is in that month.' } });
    render(<BirthdaySection initial={{ month: 3, day: 5, audience: 'friends' }} token="tok" />);
    expect(screen.getByRole('heading', { name: 'عيد الميلاد' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'حفظ عيد الميلاد' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('اختر يومًا موجودًا في ذلك الشهر.');
  });
});

describe('a birthday on the profile', () => {
  it('reads as month and day, in either language, Feb 29 included; nothing when hidden', async () => {
    expect(birthdayText({ month: 3, day: 5 })).toBe('March 5');
    expect(birthdayText({ month: 2, day: 29 })).toBe('February 29');
    expect(daysIn(2)).toBe(29);
    const { unmount } = render(<MemoryRouter><ProfileDetails links={[]} birthday={{ month: 12, day: 31 }} /></MemoryRouter>);
    expect(screen.getByText('Birthday: December 31')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter><ProfileDetails links={[]} birthday={null} /></MemoryRouter>);
    expect(screen.queryByText(/Birthday/)).toBeNull();
    await setLanguage('ar');
    expect(birthdayText({ month: 3, day: 5 })).toBe('5 مارس');
    await setLanguage('en');
  });
});
