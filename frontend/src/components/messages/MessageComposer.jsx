import { useEffect, useRef, useState } from 'react';

// Debounce the "should I check whether to fire typing?" trigger by 300ms
// (a natural pause between keystrokes), then only actually emit if it's
// been at least this long since the last one -- roughly once every 2-3s
// while continuously typing, not on every keystroke.
const TYPING_DEBOUNCE_MS = 300;
const TYPING_EMIT_INTERVAL_MS = 2500;

// Reuses feed-comment-form/feed-btn (the comment input's own classes, not a
// parallel lookalike) so this looks and behaves identically, per the
// messaging feature's design-consistency requirement. Unlike the comment
// form, this is never disabled while a send is in flight -- optimistic
// sending is the whole point, so the user can keep sending while earlier
// messages are still "sending"/retrying.
function MessageComposer({ onSend, onTyping }) {
  const [content, setContent] = useState('');
  const debounceTimerRef = useRef(null);
  const lastTypingEmitRef = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    setContent(value);

    if (!onTyping) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastTypingEmitRef.current >= TYPING_EMIT_INTERVAL_MS) {
        lastTypingEmitRef.current = now;
        onTyping();
      }
    }, TYPING_DEBOUNCE_MS);
  };

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
        onChange={handleChange}
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
