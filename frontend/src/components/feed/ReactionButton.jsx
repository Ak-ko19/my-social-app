import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ThumbsUp } from 'lucide-react';
import { REACTIONS, REACTION_BY_KEY } from '../../utils/reactions';

const LONG_PRESS_MS = 450;
const HOVER_OPEN_MS = 450;
const HOVER_CLOSE_MS = 300;

// PostCard's Like action with a reaction picker (B1), all state owned by
// useLikeToggle (passed in as `like`):
// - tap/click: like, or remove whatever reaction is set (same as before);
// - long-press (touch) or hover (mouse): open the picker;
// - keyboard: ArrowUp on the button opens it; Left/Right move between
//   reactions; Escape closes and returns focus to the button.
function ReactionButton({ like }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const optionRefs = useRef([]);
  const timerRef = useRef(null);
  const suppressClickRef = useRef(false);

  const current = like.myReaction ? REACTION_BY_KEY[like.myReaction] : null;

  const clearTimer = () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const openPicker = (focusFirst = false) => {
    clearTimer();
    setOpen(true);
    if (focusFirst) requestAnimationFrame(() => optionRefs.current[0]?.focus());
  };

  const closePicker = (returnFocus = false) => {
    clearTimer();
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // Dismiss on a tap/click anywhere outside the button + picker.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handlePointerDown = (e) => {
    if (e.pointerType !== 'touch') return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      suppressClickRef.current = true; // the finger lifting shouldn't also toggle Like
      openPicker();
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    clearTimer();
    setOpen(false);
    like.toggle();
  };

  const handleMouseEnter = (e) => {
    if (e.pointerType === 'touch') return;
    clearTimer();
    if (!open) timerRef.current = setTimeout(() => openPicker(), HOVER_OPEN_MS);
  };

  // Also arm on movement: after a click the pointer is already inside, so
  // no new pointerenter fires -- resting there should still open the picker.
  const handlePointerMove = (e) => {
    if (e.pointerType === 'touch' || open || timerRef.current) return;
    timerRef.current = setTimeout(() => openPicker(), HOVER_OPEN_MS);
  };

  const handleMouseLeave = (e) => {
    if (e.pointerType === 'touch') return;
    clearTimer();
    if (open) timerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };

  const handleButtonKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      openPicker(true);
    } else if (e.key === 'Escape' && open) {
      closePicker();
    }
  };

  const handleOptionKeyDown = (e, index) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePicker(true);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      optionRefs.current[(index + step + REACTIONS.length) % REACTIONS.length]?.focus();
    }
  };

  const choose = (key) => {
    closePicker(true);
    like.react(key);
  };

  return (
    <div
      ref={wrapRef}
      className="reaction-wrap"
      onPointerEnter={handleMouseEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handleMouseLeave}
    >
      {open && (
        <div className="reaction-picker" role="toolbar" aria-label="Choose a reaction">
          {REACTIONS.map((r, i) => (
            <button
              key={r.key}
              ref={(el) => { optionRefs.current[i] = el; }}
              type="button"
              className={clsx('reaction-option', like.myReaction === r.key && 'reaction-option-selected')}
              aria-label={r.label}
              aria-pressed={like.myReaction === r.key}
              title={r.label}
              onClick={() => choose(r.key)}
              onKeyDown={(e) => handleOptionKeyDown(e, i)}
            >
              <span aria-hidden="true">{r.emoji}</span>
            </button>
          ))}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={clsx('post-card-action', current && 'post-card-action-active')}
        style={current ? { color: current.color } : undefined}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => {
          // Long-press on mobile would otherwise also open the browser's
          // context menu over the picker.
          if (timerRef.current || open) e.preventDefault();
        }}
        onKeyDown={handleButtonKeyDown}
        // Not `disabled` while a request is in flight: disabling the focused
        // button would throw keyboard focus back to <body> right after a
        // picker choice. useLikeToggle already ignores clicks while pending.
        aria-busy={like.pending}
        aria-pressed={Boolean(current)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={current ? `${current.label} (reacted). Press to remove; Arrow Up for more reactions` : 'Like. Arrow Up for more reactions'}
      >
        {current && current.key !== 'like' ? (
          <span className="reaction-current-emoji" aria-hidden="true">{current.emoji}</span>
        ) : (
          <ThumbsUp size={18} aria-hidden="true" fill={current ? 'currentColor' : 'none'} />
        )}
        <span>{current ? current.label : 'Like'}</span>
      </button>
    </div>
  );
}

export default ReactionButton;
