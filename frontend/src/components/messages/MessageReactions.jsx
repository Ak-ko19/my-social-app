import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REACTIONS, REACTION_BY_KEY } from '../../utils/reactions';

// Day 31: reactions on a message (like Messenger) -- the same six as posts,
// one per person. MessageReactionPicker is the row of six to pick from;
// MessageReactionChips is the little pill under a bubble (most-used emojis
// and the total), whose label says who reacted with what.

// Picking your current reaction again removes it. Arrow keys move along the
// row, Escape (or a click elsewhere) closes it and gives focus back to the
// button that opened it.
export function MessageReactionPicker({ myReaction, onPick, onClose, returnFocusRef }) {
  const { t } = useTranslation();
  const rowRef = useRef(null);
  // Opens above the bubble; if something covers it there (the sticky chat
  // header, for a message near the top), it opens below the bubble instead.
  const [below, setBelow] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || typeof document.elementFromPoint !== 'function') return;
    const rect = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2);
    if (rect.top < 0 || (hit && !row.contains(hit))) setBelow(true);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    const start = row?.querySelector('[aria-pressed="true"]') || row?.querySelector('button');
    start?.focus();
    const handleDown = (e) => {
      if (row && !row.contains(e.target) && !returnFocusRef?.current?.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose, returnFocusRef]);

  const close = () => {
    onClose();
    returnFocusRef?.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = [...rowRef.current.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const rtl = document.documentElement.dir === 'rtl';
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
    e.preventDefault();
  };

  return (
    <div className={`messages-reaction-picker${below ? ' messages-reaction-picker-below' : ''}`} role="group" aria-label={t('reactions.choose')} ref={rowRef} onKeyDown={handleKeyDown}>
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          className="messages-reaction-option"
          aria-label={t(`reactions.${r.key}`)}
          title={t(`reactions.${r.key}`)}
          aria-pressed={myReaction === r.key}
          onClick={() => {
            onPick(myReaction === r.key ? null : r.key);
            close();
          }}
        >
          <span aria-hidden="true">{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}

export function MessageReactionChips({ reactions, nameOf, onOpen }) {
  const { t } = useTranslation();
  if (!reactions || reactions.length === 0) return null;

  const byReaction = new Map();
  for (const { user_id: userId, reaction } of reactions) {
    if (!REACTION_BY_KEY[reaction]) continue;
    if (!byReaction.has(reaction)) byReaction.set(reaction, []);
    byReaction.get(reaction).push(nameOf(userId));
  }
  const ordered = [...byReaction.entries()].sort((a, b) => b[1].length - a[1].length);
  const list = ordered.map(([key, names]) => `${t(`reactions.${key}`)}: ${names.join(', ')}`).join('; ');
  const label = t('messages.reactionsSummary', { list });

  return (
    <button type="button" className="messages-reactions" onClick={onOpen} aria-label={label} title={list}>
      <span aria-hidden="true">{ordered.slice(0, 3).map(([key]) => REACTION_BY_KEY[key].emoji).join('')}</span>
      {reactions.length > 1 && <span className="messages-reactions-count" aria-hidden="true">{reactions.length}</span>}
    </button>
  );
}
