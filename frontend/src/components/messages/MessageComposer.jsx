import { useState } from 'react';

// Reuses feed-comment-form/feed-btn (the comment input's own classes, not a
// parallel lookalike) so this looks and behaves identically, per the
// messaging feature's design-consistency requirement. Unlike the comment
// form, this is never disabled while a send is in flight -- optimistic
// sending is the whole point, so the user can keep sending while earlier
// messages are still "sending"/retrying.
function MessageComposer({ onSend }) {
  const [content, setContent] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSend(content);
    setContent('');
  };

  return (
    <form className="feed-comment-form messages-composer" onSubmit={handleSubmit}>
      <label className="feed-visually-hidden" htmlFor="message-composer-input">
        Write a message
      </label>
      <input
        id="message-composer-input"
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type a message..."
        autoComplete="off"
      />
      <button type="submit" className="feed-btn" disabled={!content.trim()}>
        Send
      </button>
    </form>
  );
}

export default MessageComposer;
