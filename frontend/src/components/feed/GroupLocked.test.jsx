import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PostCard from './PostCard';
import CommentSection from './CommentSection';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', userId: 1, username: 'me' }) }));
vi.mock('../../api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  resolveImageUrl: (url) => url
}));

const bag = (list) => ({
  comments: list, commentInput: '', setCommentInput: vi.fn(), submitPending: false, submitError: null, editError: null, likeError: null,
  replyingTo: null, startReply: vi.fn(), cancelReply: vi.fn(), submitComment: vi.fn(), editingCommentId: null, editText: '',
  setEditText: vi.fn(), startEdit: vi.fn(), cancelEdit: vi.fn(), saveEdit: vi.fn(), toggleCommentLike: vi.fn(),
  removeComment: vi.fn(), approve: vi.fn(), actionError: null, visible: false, toggleVisible: vi.fn()
});
const comment = { id: 3, user_id: 2, username: 'bob', content: 'Trail is open', created_at: new Date().toISOString(), parent_comment_id: null, like_count: 2, liked_by_me: false };
const post = { id: 7, user_id: 2, username: 'bob', content: 'Saturday hike', created_at: new Date().toISOString(), community_id: 5, like_count: 0, reaction_counts: {} };

// Day 50: someone not in a group reads its posts and comments, but can't
// react or comment.
describe('a group post, read by someone not in the group', () => {
  it('no reaction button on the post; Comment and Save stay', () => {
    render(<MemoryRouter><PostCard post={post} groupLocked /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Like/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('a member gets the reaction button', () => {
    render(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(screen.getAllByRole('button', { name: /Like/ }).length).toBeGreaterThan(0);
  });

  it('comments: readable, with their like count, but no form, Like or Reply', () => {
    render(<CommentSection postId={7} postOwnerId={2} comments={bag([comment])} groupLocked />);
    expect(screen.getByText('Trail is open')).toBeInTheDocument();
    expect(screen.getByLabelText('2 likes')).toBeInTheDocument();
    expect(screen.getByText('Join the group to comment and react.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Reply to bob/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Like bob's comment/ })).toBeNull();
  });
});
