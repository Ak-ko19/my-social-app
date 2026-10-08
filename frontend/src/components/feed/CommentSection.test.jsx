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
  removeComment: vi.fn(async () => {}), approve: vi.fn(async () => {}), actionError: null, ...extra
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
