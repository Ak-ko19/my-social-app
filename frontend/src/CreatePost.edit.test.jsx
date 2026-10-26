import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreatePost from './CreatePost';
import PostCard from './components/feed/PostCard';
import api from './api';
import { setLanguage } from './i18n';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, resolveImageUrl: (url) => url }));
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1, username: 'me' }) }));

const post = {
  id: 5, user_id: 1, username: 'me', content: 'Hill walk', visibility: 'followers', created_at: new Date().toISOString(),
  media: [{ url: 'https://cdn/a.jpg', alt: 'A red kite' }, { url: 'https://cdn/b.jpg', alt: null }],
  poll: null, is_share: false, shared_post: null, page: null, community_id: null, like_count: 0, reaction_counts: {}
};
const show = (path = '/create-post?editPostId=5') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/create-post" element={<CreatePost />} />
      <Route path="/posts/:id" element={<p>post page</p>} />
      <Route path="/feed" element={<PostCard post={post} />} />
      <Route path="/share" element={<PostCard post={{ ...post, is_share: true, media: [], shared_post: null, content: 'look' }} />} />
    </Routes>
  </MemoryRouter>
);
const tiles = () => screen.getAllByRole('img').map((img) => img.getAttribute('src'));

beforeEach(async () => {
  localStorage.setItem('token', 'tok');
  for (const fn of Object.values(api)) fn.mockReset();
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:new-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn();
  await setLanguage('en');
});

// Day 96: editing a published post in the composer.
describe('Edit post (the composer)', () => {
  it("opens with the post's text, audience and photos -- no poll, schedule or draft", async () => {
    api.get.mockResolvedValue({ data: post });
    show();
    expect(await screen.findByRole('heading', { name: 'Edit post' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Post' })).toHaveValue('Hill walk');
    expect(screen.getByRole('radio', { name: 'Followers' })).toBeChecked();
    expect(tiles()).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
    expect(screen.getByRole('button', { name: 'Alt text for photo 1: change the description' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a poll' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Schedule for later' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('moves, adds and saves: photos first (in order, with descriptions), then the text', async () => {
    api.get.mockResolvedValue({ data: post });
    api.put.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/media') ? { media: [{ url: 'https://cdn/new.jpg', alt: null }, { url: 'https://cdn/b.jpg', alt: null }, { url: 'https://cdn/a.jpg', alt: 'A red kite' }] } : {} }));
    show();
    await screen.findByRole('heading', { name: 'Edit post' });
    // The first photo has no "earlier", the last no "later".
    expect(screen.queryByRole('button', { name: 'Move photo 1 earlier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move photo 2 later' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }));
    expect(tiles()).toEqual(['https://cdn/b.jpg', 'https://cdn/a.jpg']);
    // A new photo, moved to the front.
    await userEvent.upload(document.querySelector('input[type=file]'), new File(['x'], 'c.png', { type: 'image/png' }));
    await screen.findByRole('button', { name: 'Move photo 3 earlier' });
    await userEvent.click(screen.getByRole('button', { name: 'Move photo 3 earlier' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }));
    expect(tiles()).toEqual(['blob:new-1', 'https://cdn/b.jpg', 'https://cdn/a.jpg']);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Post' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Post' }), 'Hill walk, day 2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('post page')).toBeInTheDocument();
    const [photosCall, textCall] = api.put.mock.calls;
    expect(photosCall[0]).toBe('/posts/5/media');
    expect(photosCall[1].get('photos')).toBe(JSON.stringify([{ upload: 0 }, 'https://cdn/b.jpg', 'https://cdn/a.jpg']));
    expect(photosCall[1].getAll('images')).toHaveLength(1);
    expect(photosCall[1].get('altTexts')).toBe(JSON.stringify(['', '', 'A red kite']));
    expect(textCall).toEqual(['/posts/5', { content: 'Hill walk, day 2', visibility: 'followers' }, { headers: { Authorization: 'Bearer tok' } }]);
  });

  it('if the text fails after the photos saved, trying again sends no upload twice', async () => {
    api.get.mockResolvedValue({ data: post });
    let textTries = 0;
    api.put.mockImplementation((url) => {
      if (url.endsWith('/media')) return Promise.resolve({ data: { media: [{ url: 'https://cdn/new.jpg', alt: null }, ...post.media] } });
      textTries += 1;
      return textTries === 1 ? Promise.reject({ response: { status: 500, data: 'Update post failed. Please try again later.' } }) : Promise.resolve({ data: {} });
    });
    show();
    await screen.findByRole('heading', { name: 'Edit post' });
    await userEvent.upload(document.querySelector('input[type=file]'), new File(['x'], 'c.png', { type: 'image/png' }));
    await screen.findByRole('button', { name: 'Move photo 3 earlier' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('post page')).toBeInTheDocument();
    const mediaCalls = api.put.mock.calls.filter(([url]) => url.endsWith('/media'));
    expect(mediaCalls[1][1].getAll('images')).toHaveLength(0);
    expect(mediaCalls[1][1].get('photos')).toBe(JSON.stringify(['https://cdn/new.jpg', 'https://cdn/a.jpg', 'https://cdn/b.jpg']));
  });

  it("a share or a poll isn't edited here", async () => {
    api.get.mockResolvedValue({ data: { ...post, is_share: true } });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent("This post can't be edited here.");
  });

  it('in Arabic, the move buttons have Arabic names', async () => {
    await setLanguage('ar');
    api.get.mockResolvedValue({ data: post });
    show();
    expect(await screen.findByRole('button', { name: 'قدّم الصورة 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'أخّر الصورة 1' })).toBeInTheDocument();
  });
});

describe('"Edit post" on a card', () => {
  it('opens the composer for a post with photos', async () => {
    api.get.mockResolvedValue({ data: post });
    show('/feed');
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Edit post' }));
    expect(await screen.findByRole('heading', { name: 'Edit post' })).toBeInTheDocument();
  });

  it('a share keeps the quick text edit on its card', async () => {
    show('/share');
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Edit post' }));
    // The card's own edit box (its bookmark button is also called Save).
    expect(await screen.findByDisplayValue('look')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit post' })).toBeNull();
  });
});
