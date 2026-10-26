import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreatePost from './CreatePost';
import MediaCarousel from './components/feed/MediaCarousel';
import api from './api';
import { setLanguage } from './i18n';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, resolveImageUrl: (url) => url }));

const show = () => render(
  <MemoryRouter initialEntries={['/create-post']}>
    <Routes>
      <Route path="/create-post" element={<CreatePost />} />
      <Route path="/" element={<p>home</p>} />
    </Routes>
  </MemoryRouter>
);
const pick = (...names) => userEvent.upload(document.querySelector('input[type=file]'), names.map((n) => new File(['x'], n, { type: 'image/png' })));

beforeEach(async () => {
  localStorage.setItem('token', 'tok');
  api.post.mockReset();
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn();
  await setLanguage('en');
});

// Day 95: describing each photo (alt text) in the composer.
describe('photo descriptions', () => {
  it('each photo has an Alt button; a description is sent with the post, in order', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    show();
    await userEvent.type(screen.getByRole('textbox', { name: 'Post' }), 'Hill walk');
    await pick('a.png', 'b.png');
    await userEvent.click(await screen.findByRole('button', { name: 'Alt text for photo 2: add a description' }));
    const dialog = screen.getByRole('dialog', { name: 'Describe photo 2' });
    await userEvent.type(within(dialog).getByLabelText('Description'), '  A red kite over the hill ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Now it says the photo has one.
    expect(screen.getByRole('button', { name: 'Alt text for photo 2: change the description' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alt text for photo 1: add a description' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText('home');
    expect(api.post.mock.calls[0][1].get('altTexts')).toBe(JSON.stringify(['', 'A red kite over the hill']));
  });

  it('opens with the description so far; Remove and Cancel', async () => {
    show();
    await pick('a.png');
    await userEvent.click(await screen.findByRole('button', { name: /^Alt text for photo 1/ }));
    await userEvent.type(screen.getByLabelText('Description'), 'A cat');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: /^Alt text for photo 1/ }));
    expect(screen.getByLabelText('Description')).toHaveValue('A cat');
    // Cancel keeps it as it was.
    await userEvent.type(screen.getByLabelText('Description'), ' asleep');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: /^Alt text for photo 1/ }));
    expect(screen.getByLabelText('Description')).toHaveValue('A cat');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('button', { name: 'Alt text for photo 1: add a description' })).toBeInTheDocument();
  });

  it('the box stops at 1000 characters', async () => {
    show();
    await pick('a.png');
    await userEvent.click(await screen.findByRole('button', { name: /^Alt text for photo 1/ }));
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxLength', '1000');
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    show();
    await pick('a.png');
    const button = await screen.findByRole('button', { name: 'وصف الصورة 1: أضف وصفًا' });
    expect(button).toHaveTextContent('وصف');
    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'صِف الصورة 1' })).toBeInTheDocument();
  });
});

describe('a described photo on a post card', () => {
  it('is read by its description; one without keeps the automatic text', () => {
    render(<MediaCarousel media={[{ url: 'https://cdn/1.jpg', alt: 'A red kite' }, { url: 'https://cdn/2.jpg', alt: null }]} altPrefix="Photo by ana" />);
    const alts = screen.getAllByRole('img').map((img) => img.getAttribute('alt'));
    expect(alts[0]).toBe('A red kite');
    expect(alts[1]).toMatch(/Photo by ana/);
  });

  it('a single photo too', () => {
    render(<MediaCarousel media={[{ url: 'https://cdn/1.jpg', alt: 'A red kite' }]} altPrefix="Photo by ana" />);
    expect(screen.getByRole('img').getAttribute('alt')).toBe('A red kite');
  });
});
