import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PeopleYouMayKnow from './PeopleYouMayKnow';
import { dismissSuggestion, fetchSuggestions } from '../../services/suggestionService';

vi.mock('../../services/suggestionService', () => ({ fetchSuggestions: vi.fn(), dismissSuggestion: vi.fn() }));

// Day 39: hiding a suggestion (the X on a card).
const SUGGESTIONS = [
  { id: 5, username: 'mya', avatar_url: null, reason: 'follows_you', mutual_count: 0, mutual_sample: [] },
  { id: 6, username: 'zaw', avatar_url: null, reason: 'follows_you', mutual_count: 0, mutual_sample: [] }
];

beforeEach(() => {
  fetchSuggestions.mockResolvedValue(SUGGESTIONS);
});

const renderIt = () => render(<MemoryRouter><PeopleYouMayKnow token="tok" /></MemoryRouter>);

describe('PeopleYouMayKnow hide', () => {
  it('the card goes at once and the server is told', async () => {
    dismissSuggestion.mockResolvedValue({});
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Hide mya from suggestions' }));
    expect(screen.queryByText('mya')).toBeNull();
    expect(screen.getByText('zaw')).toBeInTheDocument();
    expect(dismissSuggestion).toHaveBeenCalledWith(5, 'tok');
  });

  it('if the server refuses, the card comes back with a message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dismissSuggestion.mockRejectedValue(new Error('offline'));
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Hide mya from suggestions' }));
    await waitFor(() => expect(screen.getByText('mya')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't hide that suggestion");
  });
});
