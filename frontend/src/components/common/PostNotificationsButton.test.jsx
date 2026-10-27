import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostNotificationsButton from './PostNotificationsButton';
import { setLanguage } from '../../i18n';

beforeEach(async () => {
  await setLanguage('en');
});

// Day 101: which of a group's / page's new posts you hear about.
describe('PostNotificationsButton', () => {
  it('shows the current choice, and saves a new one at once', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PostNotificationsButton kind="group" name="Tea Lovers" level="highlights" onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notifications: Highlights' }));
    const dialog = screen.getByRole('dialog', { name: 'Notifications for Tea Lovers' });
    expect(dialog).toHaveTextContent("Posts by the group's admins and by people you follow");
    expect(screen.getByRole('radio', { name: /Highlights/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /All posts/ }));
    expect(onSave).toHaveBeenCalledWith('all');
    expect(screen.getByRole('radio', { name: /All posts/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Notifications: All posts' })).toBeInTheDocument();
  });

  it("goes back to the old choice and says why when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue({ response: { data: 'Follow this page first' } });
    render(<PostNotificationsButton kind="page" name="Mingalar Cafe" level="highlights" onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notifications: Highlights' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('At most one a day: the first new post');
    await userEvent.click(screen.getByRole('radio', { name: /Off/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Follow this page first');
    expect(screen.getByRole('radio', { name: /Highlights/ })).toBeChecked();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    render(<PostNotificationsButton kind="group" name="Tea Lovers" level="off" onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'الإشعارات: إيقاف' }));
    expect(screen.getByRole('radio', { name: /إيقاف/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /أبرز المنشورات/ })).toBeInTheDocument();
  });
});
