import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PostCard from './PostCard';
import CommentSection from './CommentSection';
import HiddenWordsContext from '../../context/HiddenWordsContext';
import { buildMatcher } from '../../utils/hiddenWords';
import { setLanguage } from '../../i18n';
import AR from '../../i18n/locales/ar.json';

const ME = 1;
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1, username: 'me' }) }));
vi.mock('../../api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  resolveImageUrl: (url) => url
}));

// A Hidden words setting as HiddenWordsProvider would give it.
const hiddenWords = (mode, words = ['spoiler']) => {
  const matches = buildMatcher(words);
  return { mode, words, ready: true, check: (text) => (mode !== 'off' && matches(text) ? mode : null) };
};
const post = (extra = {}) => ({
  id: 7, user_id: 2, username: 'bob', content: 'Big spoiler: he dies', created_at: new Date().toISOString(), visibility: 'public',
  like_count: 0, liked_by_me: false, reaction_counts: {}, media: [{ url: 'https://example.com/a.jpg' }], ...extra
});
const showPost = (mode, p = post(), props = {}) => render(
  <MemoryRouter>
    <HiddenWordsContext.Provider value={hiddenWords(mode)}>
      <PostCard post={p} {...props} />
    </HiddenWordsContext.Provider>
  </MemoryRouter>
);

const bag = (list) => ({
  comments: list, commentInput: '', setCommentInput: vi.fn(), submitPending: false, submitError: null, editError: null, likeError: null,
  replyingTo: null, startReply: vi.fn(), cancelReply: vi.fn(), submitComment: vi.fn(), editingCommentId: null, editText: '',
  setEditText: vi.fn(), startEdit: vi.fn(), cancelEdit: vi.fn(), saveEdit: vi.fn(), toggleCommentLike: vi.fn(),
  removeComment: vi.fn(), approve: vi.fn(), actionError: null
});
const comment = (id, userId, username, content, extra = {}) => ({
  id, user_id: userId, username, content, created_at: new Date().toISOString(), parent_comment_id: null, like_count: 0, liked_by_me: false, ...extra
});
const LIST = [
  comment(1, 2, 'bob', 'spoiler alert, he dies'),
  comment(2, 3, 'cat', 'thanks bob', { parent_comment_id: 1 }),
  comment(3, 3, 'cat', 'no spoilers please'),
  comment(4, ME, 'me', 'my spoiler stays')
];
const showComments = (mode) => render(
  <HiddenWordsContext.Provider value={hiddenWords(mode)}>
    <CommentSection postId={7} postOwnerId={2} comments={bag(LIST)} />
  </HiddenWordsContext.Provider>
);

// Day 49: what Hidden words does to posts and comments.
describe('Hidden words in posts', () => {
  it('warn: the header stays, the text and photos are covered until Show anyway', async () => {
    showPost('warn');
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('This post may contain words you chose to hide.')).toBeInTheDocument();
    expect(screen.queryByText(/he dies/)).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show anyway' }));
    expect(screen.getByText('Big spoiler: he dies')).toBeInTheDocument();
    expect(screen.queryByText(/may contain words/)).toBeNull();
  });

  it('a word in a poll option counts too', () => {
    showPost('warn', post({ content: 'Guess the ending', media: [], poll: { options: [{ id: 1, label: 'a spoiler', votes: null }], my_vote: null } }));
    expect(screen.getByText('This post may contain words you chose to hide.')).toBeInTheDocument();
  });

  it('hide: left out of a list; covered on the post page instead', () => {
    const { container } = showPost('hide');
    expect(container).toBeEmptyDOMElement();
    showPost('hide', post(), { standalone: true });
    expect(screen.getByText('This post may contain words you chose to hide.')).toBeInTheDocument();
  });

  it('never your own post', () => {
    showPost('hide', post({ user_id: ME }));
    expect(screen.getByText('Big spoiler: he dies')).toBeInTheDocument();
  });

  it('off, or a clean post: shown as it is', () => {
    showPost('off');
    showPost('warn', post({ id: 8, content: 'A sunny day' }));
    expect(screen.getByText('Big spoiler: he dies')).toBeInTheDocument();
    expect(screen.getByText('A sunny day')).toBeInTheDocument();
    expect(screen.queryByText(/may contain words/)).toBeNull();
  });
});

describe('Hidden words in comments', () => {
  it('warn: the name stays, the text is covered until Show anyway; whole words only, never yours', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    showComments('warn');
    // The cover sits inside the comment's <p>: inline elements only.
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/cannot be a descendant|validateDOMNesting|cannot contain a nested/);
    consoleError.mockRestore();
    expect(screen.getByText('Hidden comment: it may contain words you chose to hide.')).toBeInTheDocument();
    expect(screen.queryByText('spoiler alert, he dies')).toBeNull();
    expect(screen.getByText('thanks bob')).toBeInTheDocument();
    expect(screen.getByText('no spoilers please')).toBeInTheDocument();
    expect(screen.getByText('my spoiler stays')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show anyway' }));
    expect(screen.getByText('spoiler alert, he dies')).toBeInTheDocument();
  });

  it('hide: the comment and its replies are left out; yours stays', () => {
    showComments('hide');
    expect(screen.queryByText(/spoiler alert/)).toBeNull();
    expect(screen.queryByText('thanks bob')).toBeNull();
    expect(screen.queryByText(/Hidden comment/)).toBeNull();
    expect(screen.getByText('no spoilers please')).toBeInTheDocument();
    expect(screen.getByText('my spoiler stays')).toBeInTheDocument();
  });

  it('in Arabic', async () => {
    await setLanguage('ar');
    showComments('warn');
    expect(screen.getByText(AR.hiddenWords.coverComment)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: AR.hiddenWords.show })).toBeInTheDocument();
    await setLanguage('en');
  });
});
