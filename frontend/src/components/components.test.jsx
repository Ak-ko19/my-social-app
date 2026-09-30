import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportDialog from './feed/ReportDialog';
import MessageBubble from './messages/MessageBubble';
import CommentSection from './feed/CommentSection';
import ErrorBoundary from './common/ErrorBoundary';
import Modal from './ui/Modal';
import { submitReport } from '../services/reportService';
import { reportClientError } from '../utils/errorReporter';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ userId: 1, token: 'test-token' }) }));
vi.mock('../services/reportService', async (importOriginal) => ({ ...(await importOriginal()), submitReport: vi.fn() }));
vi.mock('../utils/errorReporter', () => ({ reportClientError: vi.fn() }));

beforeEach(() => {
  submitReport.mockResolvedValue({ id: 1 });
});

describe('ReportDialog', () => {
  const open = () => render(<ReportDialog open onClose={() => {}} targetType="comment" targetId={5} label="this comment" />);

  it('asks for a reason before sending anything', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a reason');
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('sends the target, the reason and the details, then thanks the reporter', async () => {
    open();
    expect(screen.getAllByText('Report this comment').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('Harassment or bullying'));
    await userEvent.type(screen.getByPlaceholderText('Additional details (optional)'), 'rude');
    await userEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(submitReport).toHaveBeenCalledWith({ targetType: 'comment', targetId: 5, reason: 'harassment', details: 'rude' }, 'test-token');
    expect(await screen.findByText('Report submitted')).toBeInTheDocument();
  });

  it('shows the server\'s reason when the report is refused', async () => {
    submitReport.mockRejectedValue({ response: { status: 404, data: 'Message not found' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    open();
    await userEvent.click(screen.getByLabelText('Spam'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Message not found');
  });
});

describe('MessageBubble actions', () => {
  const noop = () => {};
  const handlers = { onRetry: noop, onRetryVoice: noop, onRetryImage: noop, onDelete: noop, onReply: noop, onStartEdit: noop, onSaveEdit: noop, onCancelEdit: noop, replyAuthorLabel: () => 'bob' };
  const message = (overrides) => ({ id: 7, sender_id: 2, type: 'text', content: 'hi', status: 'sent', created_at: new Date().toISOString(), ...overrides });

  it('someone else\'s message: reply and report, no edit or delete', async () => {
    const onReport = vi.fn();
    render(<MessageBubble message={message()} isOwn={false} {...handlers} onReport={onReport} />);
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete message' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Report message' }));
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('your own message: edit and delete, never report', async () => {
    render(<MessageBubble message={message({ sender_id: 1 })} isOwn {...handlers} onReport={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Report message' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete message' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit message' })).toBeInTheDocument();
  });

  it('a deleted or still-sending message has nothing to report', () => {
    const { rerender } = render(<MessageBubble message={message({ deleted_at: new Date().toISOString() })} isOwn={false} {...handlers} onReport={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Report message' })).toBeNull();
    expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    rerender(<MessageBubble message={message({ id: null, status: 'sending', client_temp_id: 't1' })} isOwn={false} {...handlers} onReport={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Report message' })).toBeNull();
  });
});

describe('CommentSection report', () => {
  const bag = (list) => ({
    comments: list, commentInput: '', setCommentInput: vi.fn(), submitPending: false, submitError: '', editError: '', likeError: '',
    replyingTo: null, startReply: vi.fn(), cancelReply: vi.fn(), submitComment: vi.fn(),
    editingCommentId: null, editText: '', setEditText: vi.fn(), startEdit: vi.fn(), cancelEdit: vi.fn(), saveEdit: vi.fn(), toggleCommentLike: vi.fn()
  });
  const comment = (id, userId, username, content) => ({ id, user_id: userId, username, content, created_at: new Date().toISOString(), parent_comment_id: null, like_count: 0 });

  it('offers "Report" on other people\'s comments only, and opens the dialog for that comment', async () => {
    render(<CommentSection postId={1} comments={bag([comment(10, 1, 'me', 'mine'), comment(11, 2, 'bob', 'rude')])} />);
    expect(screen.queryByRole('button', { name: "Report me's comment" })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: "Report bob's comment" }));
    expect((await screen.findAllByText('Report this comment')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('Spam'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(submitReport).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'comment', targetId: 11 }), 'test-token'));
  });
});

describe('Modal', () => {
  // A parent that re-renders on every keystroke and passes a fresh onClose
  // each time -- how ReportDialog and the account screens use it.
  function Host({ onClose }) {
    const [text, setText] = useState('');
    return (
      <Modal open onClose={() => onClose(text)} title="Dialog">
        <input aria-label="field" value={text} onChange={(e) => setText(e.target.value)} />
      </Modal>
    );
  }

  it('keeps focus in a field while typing (regression: only one letter got through)', async () => {
    render(<Host onClose={() => {}} />);
    const field = screen.getByLabelText('field');
    await userEvent.click(field);
    await userEvent.keyboard('hello world');
    expect(field).toHaveValue('hello world');
    expect(field).toHaveFocus();
  });

  it('Escape calls the latest onClose', async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    await userEvent.click(screen.getByLabelText('field'));
    await userEvent.keyboard('abc{Escape}');
    expect(onClose).toHaveBeenCalledWith('abc');
  });

  it('focuses the dialog when it opens', () => {
    render(<Host onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});

describe('ErrorBoundary', () => {
  function Broken() {
    throw new Error('render exploded');
  }

  it('shows the fallback instead of a white page, and reports the crash', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith('render', expect.objectContaining({ message: 'render exploded' }));
  });

  it('renders its children normally when nothing breaks', () => {
    render(<ErrorBoundary><p>all good</p></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
