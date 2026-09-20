import { useEffect, useRef, useState } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

const MAX_DURATION_SECONDS = 120; // matches the backend's 5MB (~2 min of compressed voice) upload limit
const WARNING_THRESHOLD_SECONDS = 105; // last 15s of the cap
const CANCEL_SLIDE_PX = 80; // how far left the pointer must slide from where the hold started to cancel instead of send

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Hold-to-record mic button for the chat composer. Swaps the whole composer
// row for a recording UI (timer, pulsing dot, live level bars, slide-to-
// cancel) while active, rather than floating it on top, so there's no
// ambiguity about whether the text input underneath is still live.
//
// Release always stops the recording; WHERE the pointer is at that moment
// decides whether it sends or discards (slide left past CANCEL_SLIDE_PX to
// cancel) -- this is tracked by clientX from move events rather than by
// which element the release lands on, deliberately: touchend always fires
// on the element touchstart began on (not whatever's currently under the
// finger), so a plain "drop it on a Cancel button" approach would not
// reliably fire once the recording UI has replaced the button the touch
// actually started on.
function VoiceRecorderButton({ onSend, onRecordingChange }) {
  const {
    status,
    elapsedSeconds,
    level,
    permissionError,
    nearingLimit,
    startRecording,
    stopAndSend,
    cancel
  } = useVoiceRecorder({
    onComplete: onSend,
    maxDurationSeconds: MAX_DURATION_SECONDS,
    warningThresholdSeconds: WARNING_THRESHOLD_SECONDS
  });

  const isRecording = status === 'recording' || status === 'requesting-permission';
  const [slideRatio, setSlideRatio] = useState(0); // 0 (not sliding) -> 1 (at/past the cancel threshold)
  const touchActiveRef = useRef(false); // a touch already handled this press -- ignore the synthetic mousedown/mouseup that follows on some devices
  const startXRef = useRef(0);
  const dragXRef = useRef(0);

  // Lets the composer hide the text input/Send button while this takes over
  // the row -- kept as a side-effect rather than MessageComposer reaching
  // into this component's state, so this stays a self-contained, droppable
  // control (matches MessageStatusIcon/other messages/ components owning
  // their own presentation).
  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    if (!isRecording) return;

    const handleMove = (clientX) => {
      dragXRef.current = Math.min(0, clientX - startXRef.current); // only leftward slide counts
      setSlideRatio(Math.min(1, Math.abs(dragXRef.current) / CANCEL_SLIDE_PX));
    };
    const handleMouseMove = (e) => handleMove(e.clientX);
    const handleTouchMove = (e) => {
      if (e.touches[0]) handleMove(e.touches[0].clientX);
      e.preventDefault(); // don't let the page scroll while sliding to cancel
    };
    const handleRelease = () => {
      if (Math.abs(dragXRef.current) >= CANCEL_SLIDE_PX) {
        cancel();
      } else {
        stopAndSend();
      }
      dragXRef.current = 0;
      setSlideRatio(0);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') cancel();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchend', handleRelease);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('touchend', handleRelease);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRecording, cancel, stopAndSend]);

  const handleMouseDown = (e) => {
    if (touchActiveRef.current) return;
    e.preventDefault();
    startXRef.current = e.clientX;
    dragXRef.current = 0;
    startRecording();
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    touchActiveRef.current = true;
    if (e.touches[0]) startXRef.current = e.touches[0].clientX;
    dragXRef.current = 0;
    startRecording();
    // The browser fires synthetic mousedown/mouseup shortly after real touch
    // events on some devices -- keep the guard up long enough to absorb those.
    setTimeout(() => {
      touchActiveRef.current = false;
    }, 500);
  };

  if (isRecording) {
    const isCancelling = slideRatio >= 1;
    const hint =
      status === 'requesting-permission' ? 'Requesting mic access…' : isCancelling ? 'Release to cancel' : '‹ Slide to cancel';

    return (
      <div
        className={`messages-recording-row${isCancelling ? ' messages-recording-row-cancelling' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span className={`messages-recording-dot${nearingLimit ? ' messages-recording-dot-warning' : ''}`} aria-hidden="true" />
        <span className={`messages-recording-timer${nearingLimit ? ' messages-recording-timer-warning' : ''}`}>
          {formatTimer(elapsedSeconds)}
        </span>
        <span className="messages-recording-bars" aria-hidden="true">
          {level.map((v, i) => (
            <span key={i} className="messages-recording-bar" style={{ transform: `scaleY(${0.2 + v * 0.8})` }} />
          ))}
        </span>
        <span
          className="messages-recording-cancel-hint"
          style={{ opacity: 0.5 + slideRatio * 0.5 }}
        >
          {hint}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="messages-mic-btn"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        aria-label="Hold to record a voice message"
        title="Hold to record a voice message"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" fill="currentColor" />
          <path d="M19 11a7 7 0 0 1-14 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {permissionError && (
        <p className="messages-mic-error" role="alert">
          {permissionError}
        </p>
      )}
    </>
  );
}

export default VoiceRecorderButton;
