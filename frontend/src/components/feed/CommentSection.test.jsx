import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentSection from './CommentSection';
import { setLanguage } from '../../i18n';

let me = 1;
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: me }) }));

const bag = (list, extra = {}) => ({
  comments: list, commentInput: '', setCommentInput: vi.fn(), submitPending: false, submitError: null, editError: null, likeError: null,
  replyingTo: null, startReply: vi.fn(), cancelReply: vi.fn(), submitComment: vi.fn(), editingCommentId: null, editText: '',
  setEditText: vi.fn(), startEdit: vi.fn(), cancelEdit: vi.fn(), saveEdit: vi.fn(), toggleCommentLike: vi.fn(),
  removeComment: vi.fn(async () => {}), approve: vi.fn(async () => {}), actionError: null,
  sort: 'relevant', changeSort: vi.fn(), loadReplies: vi.fn(), repliesLoading: new Set(), repliesError: null, ...extra
});
const c = (id, userId, username, extra = {}) => ({ id, user_id: userId, username, content: `${username} says hi`, created_at: new Date().toISOString(), parent_comment_id: null, like_count: 0, liked_by_me: false, ...extra });

// Day 47: delete (yours, or any on your post) and approve a restricted
// person's held comment.
describe('CommentSection: delete and approve', () => {
  it("the post's owner sees a held comment's note, approves it, and can delete anyone's", async () => {
    me = 1;
    const comments = bag([c(10, 5, 'troll', { awaiting_approval: true }), c(11, 6, 'friend')]);
    render(<CommentSection postId={3} postOwnerId={1} comments={comments} />);
    expect(screen.getByText(/Restricted: only troll and you can see this comment\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(comments.approve).toHaveBeenCalledWith(10);

    await userEvent.click(screen.getByRole('button', { name: "Delete friend's comment" }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('It will be gone for everyone, with its replies.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(comments.removeComment).toHaveBeenCalledWith(11);
  });

  it("someone else's post: delete only your own comment; no held note", async () => {
    me = 6;
    render(<CommentSection postId={3} postOwnerId={1} comments={bag([c(10, 5, 'troll'), c(11, 6, 'friend')])} />);
    expect(screen.queryByRole('button', { name: "Delete troll's comment" })).toBeNull();
    expect(screen.getByRole('button', { name: "Delete friend's comment" })).toBeInTheDocument();
    expect(screen.queryByText(/Restricted:/)).toBeNull();
  });

  it('in Arabic', async () => {
    me = 1;
    await setLanguage('ar');
    render(<CommentSection postId={3} postOwnerId={1} comments={bag([c(10, 5, 'troll', { awaiting_approval: true })])} />);
    expect(screen.getByText(/مقيّد: لا يرى هذا التعليق إلا troll وأنت\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'موافقة' })).toBeInTheDocument();
  });
});

// Days 109-110: Most relevant / Newest, and "View N more replies".
describe('CommentSection: order and more replies', () => {
  it('offers both orders (the chosen one checked) and how many replies are still to come', async () => {
    me = 1;
    await setLanguage('en');
    const comments = bag([
      c(10, 5, 'ann', { reply_count: 4 }), c(20, 6, 'bo', { parent_comment_id: 10 }), c(21, 7, 'cy', { parent_comment_id: 10 }),
      c(11, 6, 'bo', { reply_count: 1 }), c(22, 5, 'ann', { parent_comment_id: 11 })
    ]);
    render(<CommentSection postId={3} postOwnerId={1} comments={comments} />);
    const order = screen.getByRole('radiogroup', { name: 'Order of comments' });
    expect(within(order).getByRole('radio', { name: 'Most relevant' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(order).getByRole('radio', { name: 'Newest' }));
    expect(comments.changeSort).toHaveBeenCalledWith('newest');
    // ann's thread has 2 of its 4 replies here; bo's has its only one.
    await userEvent.click(screen.getByRole('button', { name: 'View 2 more replies' }));
    expect(comments.loadReplies).toHaveBeenCalledWith(10);
    expect(screen.getAllByRole('button', { name: /more repl/ })).toHaveLength(1);
  });

  it('in Arabic', async () => {
    me = 1;
    await setLanguage('ar');
    render(<CommentSection postId={3} postOwnerId={1} comments={bag([c(10, 5, 'ann', { reply_count: 3 })], { sort: 'newest' })} />);
    expect(screen.getByRole('radio', { name: 'الأحدث' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'عرض 3 ردود أخرى' })).toBeInTheDocument();
    await setLanguage('en');
  });
});

// Days 109-110: Pin / Unpin for the post's author, on comments (not replies).
describe('CommentSection: pin', () => {
  it('the author can pin a comment or unpin the pinned one; replies and other people get no button', async () => {
    me = 1;
    await setLanguage('en');
    const comments = bag([
      c(10, 5, 'ann', { is_pinned: true }), c(11, 6, 'bo'), c(20, 7, 'cy', { parent_comment_id: 11 })
    ], { setPinned: vi.fn() });
    const { unmount } = render(<CommentSection postId={3} postOwnerId={1} comments={comments} canPin />);
    expect(screen.getByText('Pinned by the author')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Pin bo's comment to the top" }));
    expect(comments.setPinned).toHaveBeenCalledWith(11);
    await userEvent.click(screen.getByRole('button', { name: "Unpin ann's comment" }));
    expect(comments.setPinned).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('button', { name: "Pin cy's comment to the top" })).toBeNull();
    unmount();

    me = 6;
    render(<CommentSection postId={3} postOwnerId={1} comments={bag([c(10, 5, 'ann', { is_pinned: true })])} />);
    expect(screen.getByText('Pinned by the author')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pin |^Unpin / })).toBeNull();
  });

  it('in Arabic', async () => {
    me = 1;
    await setLanguage('ar');
    render(<CommentSection postId={3} postOwnerId={1} comments={bag([c(10, 5, 'ann', { is_pinned: true }), c(11, 6, 'bo')], { setPinned: vi.fn() })} canPin />);
    expect(screen.getByText('ثبّته صاحب المنشور')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تثبيت تعليق bo في الأعلى' })).toBeInTheDocument();
    await setLanguage('en');
  });
});
