import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreatePost from './CreatePost';
import { compressImage } from './utils/compressImage';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));
vi.mock('./utils/compressImage', () => ({ compressImage: vi.fn() }));

// Day 57: photos are shrunk in the browser; Post waits until they're ready,
// so a quick tap can't send the post without them.
describe('CreatePost while photos are prepared', () => {
  it('Post and Save draft wait, with a note; then the shrunk photo is used', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    let finish;
    compressImage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MemoryRouter><CreatePost /></MemoryRouter>);
    await userEvent.type(screen.getByRole('textbox', { name: 'Post' }), 'sunset');
    const original = new File(['x'.repeat(10)], 'big.jpg', { type: 'image/jpeg' });
    await userEvent.upload(document.querySelector('input[type=file]'), original);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your photo…');
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    const small = new File(['y'], 'big.webp', { type: 'image/webp' });
    finish(small);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled());
    expect(compressImage).toHaveBeenCalledWith(original);
    expect(URL.createObjectURL).toHaveBeenCalledWith(small);
    expect(screen.queryByText('Preparing your photo…')).toBeNull();
  });
});
