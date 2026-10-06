import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecentSearches from './RecentSearches';
import { clearSearchHistory, deleteSearch, fetchSearchHistory } from '../../services/searchService';

vi.mock('../../services/searchService', () => ({
  fetchSearchHistory: vi.fn(), deleteSearch: vi.fn(), clearSearchHistory: vi.fn()
}));

// Day 42: recent searches before you search.
const HISTORY = [{ id: 2, query: 'tea shop' }, { id: 1, query: 'mohinga' }];

beforeEach(() => {
  vi.clearAllMocks();
  fetchSearchHistory.mockResolvedValue(HISTORY);
});

const queries = () => screen.queryAllByRole('listitem').map((li) => li.textContent);

describe('RecentSearches', () => {
  it('lists them newest first; a tap searches again', async () => {
    const onPick = vi.fn();
    render(<RecentSearches token="tok" onPick={onPick} />);
    await userEvent.click(await screen.findByRole('button', { name: 'tea shop' }));
    expect(onPick).toHaveBeenCalledWith('tea shop');
    expect(queries()).toEqual(['tea shop', 'mohinga']);
  });

  it('the X removes one at once; if the server refuses it comes back with a message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteSearch.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
    render(<RecentSearches token="tok" onPick={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove “tea shop” from recent searches' }));
    expect(queries()).toEqual(['mohinga']);
    expect(deleteSearch).toHaveBeenCalledWith(2, 'tok');
    await userEvent.click(screen.getByRole('button', { name: 'Remove “mohinga” from recent searches' }));
    await waitFor(() => expect(queries()).toEqual(['mohinga']));
    expect(screen.getByRole('alert')).toHaveTextContent("That didn’t work");
  });

  it('Clear all asks first, then clears; a refusal brings them back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearSearchHistory.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    render(<RecentSearches token="tok" onPick={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    expect(clearSearchHistory).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(queries()).toEqual(['tea shop', 'mohinga']));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Recent searches' })).toBeNull());
  });

  it('shows nothing for visitors or with no history', async () => {
    const { container } = render(<RecentSearches token={null} onPick={() => {}} />);
    expect(fetchSearchHistory).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    fetchSearchHistory.mockResolvedValueOnce([]);
    const empty = render(<RecentSearches token="tok" onPick={() => {}} />);
    await waitFor(() => expect(fetchSearchHistory).toHaveBeenCalled());
    expect(empty.container).toBeEmptyDOMElement();
  });
});
