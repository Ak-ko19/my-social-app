import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StoryReplyCard from './StoryReplyCard';
import { setLanguage } from '../../i18n';

vi.mock('../../api', () => ({ default: {}, resolveImageUrl: (url) => url }));

const live = { id: 4, media_url: 'https://res.cloudinary.com/demo/image/upload/s4.jpg' };
const msg = (extra) => ({ id: 1, type: 'text', content: 'hi', story_reply: 'reply', story: live, ...extra });

beforeEach(async () => {
  await setLanguage('en');
});

// Day 100: what a story reply or reaction answered.
describe('StoryReplyCard', () => {
  it('says who replied or reacted, with the story while it is showing', () => {
    const { rerender } = render(<StoryReplyCard message={msg()} isOwn={false} />);
    expect(screen.getByText('Replied to your story')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The story' }).getAttribute('src')).toContain('s4.jpg');
    rerender(<StoryReplyCard message={msg({ story_reply: 'reaction' })} isOwn />);
    expect(screen.getByText('You reacted to their story')).toBeInTheDocument();
  });

  it('"Story unavailable" once it is gone', () => {
    render(<StoryReplyCard message={msg({ story: null })} isOwn />);
    expect(screen.getByText('You replied to their story')).toBeInTheDocument();
    expect(screen.getByText('Story unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    render(<StoryReplyCard message={msg({ story_reply: 'reaction', story: null })} isOwn={false} />);
    expect(screen.getByText('تفاعل مع قصتك')).toBeInTheDocument();
    expect(screen.getByText('القصة غير متاحة')).toBeInTheDocument();
  });
});
