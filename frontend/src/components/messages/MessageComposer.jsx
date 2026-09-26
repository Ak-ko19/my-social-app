import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import VoiceRecorderButton from './VoiceRecorderButton';

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
//
// B9: replyTo shows a "Replying to ..." bar (x or Escape cancels), and the
// image button sends a photo (replying too, when a reply is active).
function MessageComposer({ onSend, onSendVoice, onSendImage, onTyping, replyTo, replyToLabel, onCancelReply }) {
  const [content, setContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const debounceTimerRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Starting a reply puts the cursor straight into the input.
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

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

  const handleImagePicked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && onSendImage) onSendImage(file);
  };

  return (
    <div className="messages-composer-wrap">
      {replyTo && (
        <div className="messages-replying-bar" role="status">
          <span className="messages-replying-text">
            Replying to <strong>{replyToLabel}</strong>
            {replyTo.content ? `: ${replyTo.content}` : replyTo.type === 'image' ? ': Photo' : replyTo.type === 'voice' ? ': Voice message' : ''}
          </span>
          <button type="button" className="messages-replying-cancel" onClick={onCancelReply} aria-label="Cancel reply">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <form className="feed-comment-form messages-composer" onSubmit={handleSubmit}>
        {!isRecording && onSendImage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              hidden
              onChange={handleImagePicked}
            />
            <button type="button" className="messages-attach-btn" onClick={() => fileInputRef.current?.click()} aria-label="Send a photo">
              <ImagePlus size={18} aria-hidden="true" />
            </button>
          </>
        )}
        {!isRecording && (
          <>
            <label className="feed-visually-hidden" htmlFor="message-composer-input">
              {replyTo ? 'Write a reply' : 'Write a message'}
            </label>
            <input
              ref={inputRef}
              id="message-composer-input"
              type="text"
              value={content}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyTo) onCancelReply();
              }}
              placeholder={replyTo ? 'Write a reply...' : 'Type a message...'}
              autoComplete="off"
            />
          </>
        )}
        {onSendVoice && <VoiceRecorderButton onSend={onSendVoice} onRecordingChange={setIsRecording} />}
        {!isRecording && (
          <button type="submit" className="feed-btn" disabled={!content.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

export default MessageComposer;
