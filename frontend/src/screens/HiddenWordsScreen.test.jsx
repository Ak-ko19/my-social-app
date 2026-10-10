import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '../api';
import HiddenWordsScreen from './HiddenWordsScreen';
import { HiddenWordsProvider } from '../context/HiddenWordsProvider';
import { useHiddenWords } from '../hooks/useHiddenWords';
import { clearLocalSession } from '../hooks/useAuth';
import { setLanguage } from '../i18n';
import AR from '../i18n/locales/ar.json';

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../hooks/useAuth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ token: 'tok', userId: 1 })
}));

const H = { headers: { Authorization: 'Bearer tok' } };
let server;
beforeEach(() => {
  localStorage.clear();
  server = { mode: 'warn', words: ['spoiler'] };
  for (const fn of Object.values(api)) fn.mockReset();
  api.get.mockImplementation(() => Promise.resolve({ data: { ...server } }));
  api.put.mockImplementation((url, body) => {
    server.mode = body.mode;
    return Promise.resolve({ data: { mode: body.mode } });
  });
  api.post.mockImplementation((url, body) => {
    server.words = [body.word.trim().toLowerCase(), ...server.words];
    return Promise.resolve({ data: { word: body.word, words: server.words } });
  });
  api.delete.mockImplementation((url) => {
    server.words = server.words.filter((w) => `/hidden-words/${encodeURIComponent(w)}` !== url);
    return Promise.resolve({ data: { words: server.words } });
  });
});

// Shows what the rest of the app gets from the provider.
function Probe() {
  const { check } = useHiddenWords();
  return <output data-testid="probe">{String(check('a spoiler here'))}|{String(check('fuck'))}</output>;
}
const show = () => render(
  <MemoryRouter>
    <HiddenWordsProvider>
      <HiddenWordsScreen />
      <Probe />
    </HiddenWordsProvider>
  </MemoryRouter>
);

// Day 49: Settings > Hidden words.
describe('Hidden words screen', () => {
  it('shows the mode and your words; changing the mode applies everywhere at once', async () => {
    show();
    expect(await screen.findByRole('radio', { name: /Cover them/ })).toBeChecked();
    expect(screen.getByText('spoiler')).toBeInTheDocument();
    expect(screen.getByText('1 of 100 word')).toBeInTheDocument();
    // The built-in list arrives as its own chunk.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('warn|warn'));
    await userEvent.click(screen.getByRole('radio', { name: /Hide them/ }));
    expect(api.put).toHaveBeenCalledWith('/hidden-words/mode', { mode: 'hide' }, H);
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('hide|hide');
    await userEvent.click(screen.getByRole('radio', { name: /Show them/ }));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('null|null'));
  });

  it('the mode changes at once, and goes back if saving fails', async () => {
    let fail;
    api.put.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }));
    show();
    await userEvent.click(await screen.findByRole('radio', { name: /Hide them/ }));
    expect(screen.getByRole('radio', { name: /Hide them/ })).toBeChecked();
    fail({ response: { status: 500, data: 'Saving your settings failed. Please try again later.' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Saving your settings failed');
    expect(screen.getByRole('radio', { name: /Cover them/ })).toBeChecked();
  });

  it('adds and removes words', async () => {
    show();
    const input = await screen.findByLabelText('Add a word or phrase to hide');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await userEvent.type(input, 'Finale  ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(api.post).toHaveBeenCalledWith('/hidden-words', { word: 'Finale' }, H);
    expect(await screen.findByText('Added “Finale”.')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByText('2 of 100 words')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove “spoiler”' }));
    expect(api.delete).toHaveBeenCalledWith('/hidden-words/spoiler', H);
    expect(await screen.findByText('Removed “spoiler”.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove “spoiler”' })).toBeNull();
  });

  it("shows the server's reason when a word can't be added, and a full list", async () => {
    server.words = Array.from({ length: 99 }, (_, i) => `w${i}`);
    api.post.mockRejectedValueOnce({ response: { status: 400, data: 'A hidden word can be at most 40 characters' } });
    show();
    await userEvent.type(await screen.findByLabelText('Add a word or phrase to hide'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A hidden word can be at most 40 characters');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText("You've added 100 words, the most you can. Remove one to add another.")).toBeInTheDocument();
    expect(screen.getByLabelText('Add a word or phrase to hide')).toBeDisabled();
  });

  it('a failed load can be retried', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    show();
    expect(await screen.findByText("Couldn't load your hidden words.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('radio', { name: /Cover them/ })).toBeChecked();
  });

  it('kept per account for the next visit, and forgotten on sign-out', async () => {
    show();
    await screen.findByRole('radio', { name: /Cover them/ });
    expect(JSON.parse(localStorage.getItem('hiddenWords:1'))).toEqual({ mode: 'warn', words: ['spoiler'] });
    clearLocalSession();
    expect(localStorage.getItem('hiddenWords:1')).toBeNull();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    expect(await screen.findByRole('radio', { name: new RegExp(AR.hiddenWords.mode.warn) })).toBeChecked();
    expect(screen.getByText(AR.hiddenWords.count_one.replace('{{max}}', '100'))).toBeInTheDocument();
    await setLanguage('en');
  });
});
