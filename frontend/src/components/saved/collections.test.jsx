import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../../api';
import SaveToCollectionSheet from '../feed/SaveToCollectionSheet';
import CollectionsRow from './CollectionsRow';
import CollectionScreen from '../../screens/CollectionScreen';
import { setLanguage } from '../../i18n';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  resolveImageUrl: (url) => url
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));
vi.mock('../feed/FeedList', () => ({ default: ({ posts }) => <ul>{posts.map((p) => <li key={p.id}>{p.content}</li>)}</ul> }));

const H = { headers: { Authorization: 'Bearer tok' } };
const COLLECTIONS = [
  { id: 2, name: 'Trips', post_count: 3, cover_url: 'https://cdn/trip.jpg' },
  { id: 1, name: 'Recipes', post_count: 1, cover_url: null }
];
const routeGet = (routes) => api.get.mockImplementation((url) => {
  if (!(url in routes)) return Promise.reject(new Error(`unexpected GET ${url}`));
  const value = routes[url];
  return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value });
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

// Day 46: saved collections.
describe('Save to collection sheet', () => {
  const post = { id: 9 };
  const show = (props = {}) => render(<SaveToCollectionSheet open post={post} onClose={() => {}} saved={false} {...props} />);

  it('ticks the collections the post is in; Done sends the new set', async () => {
    routeGet({ '/collections': COLLECTIONS, '/posts/9/collections': { collectionIds: [1] } });
    api.put.mockResolvedValue({ data: { saved: true, collectionIds: [2] } });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    show({ onSaved, onClose, saved: true });
    expect(await screen.findByRole('checkbox', { name: 'Recipes' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Trips' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recipes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Trips' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(api.put).toHaveBeenCalledWith('/posts/9/collections', { collectionIds: [2] }, H);
    expect(onSaved).toHaveBeenCalledWith({ saved: true, collectionIds: [2] });
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a collection inline, ticked; nothing ticked on an unsaved post just closes', async () => {
    routeGet({ '/collections': [], '/posts/9/collections': { collectionIds: [] } });
    api.post.mockResolvedValue({ data: { id: 5, name: 'Books', post_count: 0, cover_url: null } });
    const onClose = vi.fn();
    show({ onClose });
    expect(await screen.findByText('No collections yet — create one below.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(api.put).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByRole('textbox', { name: 'New collection' }), 'Books{Enter}');
    expect(api.post).toHaveBeenCalledWith('/collections', { name: 'Books' }, H);
    expect(await screen.findByRole('checkbox', { name: 'Books' })).toBeChecked();
  });

  it("shows the server's reason, translated", async () => {
    await setLanguage('ar');
    routeGet({ '/collections': [], '/posts/9/collections': { collectionIds: [] } });
    api.post.mockRejectedValue({ response: { status: 409, data: 'You already have a collection with that name' } });
    show();
    await userEvent.type(await screen.findByRole('textbox', { name: 'قائمة جديدة' }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'إنشاء' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('لديك بالفعل قائمة بهذا الاسم');
  });
});

describe('Collections row (Saved)', () => {
  const show = () => render(<MemoryRouter><CollectionsRow token="tok" /></MemoryRouter>);

  it('a card per collection with cover, name and count; "New collection" first', async () => {
    routeGet({ '/collections': COLLECTIONS });
    show();
    const trips = await screen.findByRole('link', { name: /Trips/ });
    expect(trips).toHaveAttribute('href', '/saved/collections/2');
    expect(trips).toHaveTextContent('3 posts');
    expect(screen.getByRole('link', { name: /Recipes/ })).toHaveTextContent('1 post');
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('New collection');
  });

  it('creates one from the dialog', async () => {
    routeGet({ '/collections': [] });
    api.post.mockResolvedValue({ data: { id: 7, name: 'Gifts', post_count: 0, cover_url: null } });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'New collection' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Gifts');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('link', { name: /Gifts/ })).toHaveTextContent('0 posts');
  });

  it('in Arabic: plural counts', async () => {
    await setLanguage('ar');
    routeGet({ '/collections': [{ ...COLLECTIONS[0], post_count: 2 }, { ...COLLECTIONS[1], post_count: 11 }] });
    show();
    expect(await screen.findByRole('link', { name: /Trips/ })).toHaveTextContent('منشوران');
    expect(screen.getByRole('link', { name: /Recipes/ })).toHaveTextContent('11 منشورًا');
  });
});

describe('Collection screen', () => {
  const show = () => render(
    <MemoryRouter initialEntries={['/saved/collections/2']}>
      <Routes>
        <Route path="/saved/collections/:id" element={<CollectionScreen />} />
        <Route path="/saved" element={<p>saved screen</p>} />
      </Routes>
    </MemoryRouter>
  );

  it('shows its name and posts; renames; deletes after asking', async () => {
    api.get.mockResolvedValue({ data: { page: 1, collection: { id: 2, name: 'Trips' }, posts: [{ id: 4, content: 'Mount view' }], hasMore: false } });
    api.patch.mockResolvedValue({ data: { id: 2, name: 'Hikes' } });
    api.delete.mockResolvedValue({ data: { deleted: true } });
    show();
    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeInTheDocument();
    expect(screen.getByText('Mount view')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collection options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename collection' }));
    const input = await screen.findByRole('textbox', { name: 'Name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Hikes');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.patch).toHaveBeenCalledWith('/collections/2', { name: 'Hikes' }, H);
    expect(await screen.findByRole('heading', { name: 'Hikes' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collection options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete collection' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "Hikes"?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('saved screen')).toBeInTheDocument());
  });

  it("someone else's (or a deleted) collection says it doesn't exist", async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: 'Collection not found' } });
    show();
    expect(await screen.findByText("This collection doesn't exist any more.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collection options' })).toBeNull();
  });

  it('an empty collection explains how to add posts', async () => {
    api.get.mockResolvedValue({ data: { page: 1, collection: { id: 2, name: 'Trips' }, posts: [], hasMore: false } });
    show();
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
  });
});
