import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../api';
import PageAdminsSection from './PageAdminsSection';
import { setLanguage } from '../../i18n';
import AR from '../../i18n/locales/ar.json';

vi.mock('../../api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, resolveImageUrl: (u) => u }));

const H = { headers: { Authorization: 'Bearer tok' } };
const PAGE = { id: 4, name: 'Corner Cafe', is_owner: true, is_admin: true };
let admins;
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  admins = [{ id: 7, username: 'sam', avatar_url: null }];
  api.get.mockImplementation(() => Promise.resolve({ data: { owner: { id: 1, username: 'olga', avatar_url: null }, admins: [...admins] } }));
  api.post.mockImplementation((url, body) => {
    admins.push({ id: 8, username: body.username, avatar_url: null });
    return Promise.resolve({ data: { id: 8, username: body.username } });
  });
  api.delete.mockImplementation((url) => {
    admins = admins.filter((a) => !url.endsWith(`/${a.id}`));
    return Promise.resolve({ data: { removed: true } });
  });
});
const show = (page = PAGE, userId = 1, onLeft = vi.fn()) => {
  render(<PageAdminsSection page={page} token="tok" userId={userId} onLeft={onLeft} />);
  return onLeft;
};

// Day 53: Edit page > Admins.
describe('Page admins section', () => {
  it('the owner sees who runs the page, adds by username and removes after asking', async () => {
    show();
    expect(await screen.findByText('sam')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Add an admin by username'), 'dana');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(api.post).toHaveBeenCalledWith('/pages/4/admins', { username: 'dana' }, H);
    expect(await screen.findByText('dana is now an admin.')).toBeInTheDocument();
    expect(await screen.findByText('dana')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove sam as an admin' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Remove sam as an admin of Corner Cafe?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(api.delete).toHaveBeenCalledWith('/pages/4/admins/7', H);
    expect(await screen.findByText('sam is no longer an admin.')).toBeInTheDocument();
  });

  it("shows the server's reason", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 404, data: 'No one with that username' } });
    show();
    await userEvent.type(await screen.findByLabelText('Add an admin by username'), 'ghost');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No one with that username');
  });

  it('an admin sees the list, can leave, and cannot add or remove others', async () => {
    const onLeft = show({ ...PAGE, is_owner: false }, 7);
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add an admin by username')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Stop being an admin of Corner Cafe?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    expect(api.delete).toHaveBeenCalledWith('/pages/4/admins/7', H);
    expect(onLeft).toHaveBeenCalled();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByRole('heading', { name: AR.pages.admins.title })).toBeInTheDocument();
    expect(screen.getByText(AR.pages.admins.owner)).toBeInTheDocument();
    await setLanguage('en');
  });
});
