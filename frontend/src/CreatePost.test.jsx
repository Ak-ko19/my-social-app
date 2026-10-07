import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreatePost from './CreatePost';
import api from './api';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1 }) }));

const show = () => render(
  <MemoryRouter initialEntries={['/create-post']}>
    <Routes>
      <Route path="/create-post" element={<CreatePost />} />
      <Route path="/" element={<p>home</p>} />
    </Routes>
  </MemoryRouter>
);
const question = () => screen.getByRole('textbox', { name: 'Post' });

// Day 44: the composer's poll builder.
describe('CreatePost poll', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'tok');
    api.post.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('adds a poll instead of photos: two options to start, up to four', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Add a poll' }));
    expect(question()).toHaveAttribute('placeholder', 'Ask a question…');
    expect(screen.queryByText(/Images \(optional/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Option 1' })).toHaveAttribute('maxlength', '50');
    expect(screen.queryByRole('button', { name: 'Remove option 1' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByRole('textbox', { name: 'Option 4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));
    expect(screen.queryByRole('textbox', { name: 'Option 4' })).toBeNull();
    // Removing the poll brings the photos back.
    await userEvent.click(screen.getByRole('button', { name: 'Remove poll' }));
    expect(screen.getByText(/Images \(optional/)).toBeInTheDocument();
  });

  it('sends the question, the options and the length', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    show();
    await userEvent.type(question(), 'Tea or coffee?');
    await userEvent.click(screen.getByRole('button', { name: 'Add a poll' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 1' }), '  Tea ');
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 2' }), 'Coffee');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Poll length' }), '3 days');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    const form = api.post.mock.calls[0][1];
    expect(form.get('content')).toBe('Tea or coffee?');
    expect(JSON.parse(form.get('poll'))).toEqual({ options: ['Tea', 'Coffee'], durationHours: 72 });
    expect(await screen.findByText('home')).toBeInTheDocument();
  });

  it('explains an empty or repeated option before sending', async () => {
    show();
    await userEvent.type(question(), 'Q?');
    await userEvent.click(screen.getByRole('button', { name: 'Add a poll' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 1' }), 'Tea');
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 2' }), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Fill in every option, or remove the empty ones.');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Option 2' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 2' }), 'TEA');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Each option must be different.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a post without a poll sends no poll', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    show();
    await userEvent.type(question(), 'Just text');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(api.post.mock.calls[0][1].get('poll')).toBeNull();
  });

  it('with photos picked, a poll is offered only once they are removed', async () => {
    const { container } = show();
    await userEvent.upload(container.querySelector('input[type=file]'), new File(['x'], 'a.png', { type: 'image/png' }));
    expect(screen.getByRole('button', { name: 'Add a poll' })).toBeDisabled();
    expect(screen.getByText("A poll can't have photos — remove them to add one.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove image 1' }));
    expect(screen.getByRole('button', { name: 'Add a poll' })).toBeEnabled();
  });
});
