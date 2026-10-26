import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoryViewer from './StoryViewer';
import { setLanguage } from '../../i18n';

vi.mock('../../api', () => ({ default: {}, resolveImageUrl: (url) => url }));

const now = new Date().toISOString();
const story = (id) => ({ id, media_url: `https://res.cloudinary.com/demo/image/upload/s${id}.jpg`, created_at: now, seen: true });
const group = (extra = {}) => ({ user_id: 2, username: 'ana', avatar_url: null, is_own: false, can_reply: true, stories: [story(11), story(12)], ...extra });
const show = (props = {}) =>
  render(<StoryViewer tray={[group()]} startGroupIndex={0} onClose={vi.fn()} onViewed={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} {...props} />);
const activeFill = () => document.querySelector('.story-viewer-segment-fill.is-active');

beforeEach(async () => {
  await setLanguage('en');
});

// Day 100: replying and reacting to someone's story.
describe('StoryViewer replies', () => {
  it("sends a typed reply to the story's author; the story waits while you type", async () => {
    const onReply = vi.fn().mockResolvedValue({ conversationId: 5, message: {} });
    show({ onReply });
    fireEvent.load(screen.getByRole('img', { name: 'Story 1 of 2 from ana' }));
    expect(activeFill()).not.toHaveClass('is-paused');

    const box = screen.getByRole('textbox', { name: 'Reply to ana' });
    expect(box).toHaveAttribute('placeholder', 'Reply to ana…');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    await userEvent.type(box, 'Lovely view!');
    expect(activeFill()).toHaveClass('is-paused');
    // The arrows move the caret here, not the story.
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    expect(screen.getByRole('img', { name: 'Story 1 of 2 from ana' })).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    expect(onReply).toHaveBeenCalledWith(11, { text: 'Lovely view!' });
    expect(await screen.findByRole('status')).toHaveTextContent('Sent');
    expect(box).toHaveValue('');
  });

  it('a quick reaction sends its emoji, once even when tapped twice', async () => {
    let finish;
    const onReply = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    show({ onReply });
    const reactions = screen.getByRole('group', { name: 'Quick reactions' });
    expect(within(reactions).getAllByRole('button')).toHaveLength(8);
    const fire = within(reactions).getByRole('button', { name: 'React with fire' });
    await userEvent.click(fire);
    await userEvent.click(fire);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith(11, { emoji: '🔥' });
    expect(fire).toBeDisabled();
    finish({});
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(fire).toBeEnabled();
  });

  it("shows the server's reason when it fails, and keeps the text", async () => {
    const onReply = vi.fn().mockRejectedValue({ response: { data: "This person isn't accepting messages from you" } });
    show({ onReply });
    const box = screen.getByRole('textbox', { name: 'Reply to ana' });
    await userEvent.type(box, 'hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("This person isn't accepting messages from you");
    expect(box).toHaveValue('hello');
  });

  it('a draft belongs to its story: the next story starts with an empty box', async () => {
    const onReply = vi.fn().mockResolvedValue({});
    show({ onReply });
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply to ana' }), 'about the first one');
    await userEvent.click(screen.getByRole('button', { name: 'Next story' }));
    expect(screen.getByRole('img', { name: 'Story 2 of 2 from ana' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply to ana' })).toHaveValue('');
    expect(onReply).not.toHaveBeenCalled();
  });

  it('no reply box on your own stories, or when they take no messages from you', () => {
    const { unmount } = show({ tray: [group({ is_own: true, can_reply: false })] });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    unmount();
    show({ tray: [group({ can_reply: false })] });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Quick reactions' })).not.toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    const onReply = vi.fn().mockRejectedValue({ response: { data: 'Story not found' } });
    show({ onReply });
    const box = screen.getByRole('textbox', { name: 'الرد على ana' });
    expect(box).toHaveAttribute('dir', 'auto');
    await userEvent.click(screen.getByRole('button', { name: 'تفاعل بالحب' }));
    expect(onReply).toHaveBeenCalledWith(11, { emoji: '😍' });
    expect(await screen.findByRole('alert')).toHaveTextContent('القصة غير موجودة');
  });
});
