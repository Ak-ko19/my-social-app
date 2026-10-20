import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Modal } from '../ui';
import { resolveImageUrl } from '../../api';
import { fetchConversations } from '../../services/messageService';
import { serverErrorText } from '../../utils/serverError';

// Day 32: forward a message -- pick up to MAX chats (search by name), Send.
// Each chat succeeds or fails on its own (the server answers per chat):
// all sent -> onDone(count) and close; some refused -> stay open, name
// them, and untick the ones that went. The parent mounts it fresh for each
// message (so no state carries over between forwards).
// Day 70: it lists your most recent chats; typing searches all of them on
// the server. Picks stay picked (and named) while a search hides them.
export const MAX_FORWARD_TARGETS = 5;
const SEARCH_DELAY_MS = 250;

function ForwardSheet({ open, onClose, token, onSend, onDone }) {
  const { t } = useTranslation();
  const [chats, setChats] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Every chat shown so far, by id -> name (for the "couldn't send to ..." line).
  const names = useRef(new Map());

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const q = query.trim();
    const timer = setTimeout(() => {
      fetchConversations(token, { q })
        .then(({ conversations }) => {
          if (cancelled) return;
          conversations.forEach((c) => names.current.set(c.conversation_id, c.username));
          setChats(conversations);
          setLoadError('');
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setLoadError(t('messages.forwardLoadFailed'));
        });
    }, q ? SEARCH_DELAY_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, token, query, t]);

  const visible = chats || [];
  const nameOf = (id) => names.current.get(id) || '';
  const full = picked.length >= MAX_FORWARD_TARGETS;

  const toggle = (id) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const result = await onSend(picked);
      if (result.failed.length === 0) {
        onDone(result.forwarded.length);
        onClose();
        return;
      }
      const sent = new Set(result.forwarded.map((m) => m.conversation_id));
      setPicked((current) => current.filter((id) => !sent.has(id)));
      setError(t('messages.forwardFailedSome', { names: result.failed.map((f) => nameOf(f.conversationId)).join(', ') }));
      if (result.forwarded.length > 0) onDone(result.forwarded.length);
    } catch (err) {
      // Every chat refused (the answer is the first refusal) or the request failed.
      const failed = err.response?.data?.failed;
      setError(failed
        ? t('messages.forwardFailedSome', { names: failed.map((f) => nameOf(f.conversationId)).join(', ') })
        : serverErrorText(err, 'messages.forwardFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('messages.forwardTitle')} variant="sheet" className="forward-sheet">
      <h2 className="forward-sheet-title">{t('messages.forwardTitle')}</h2>
      <input
        type="search"
        className="forward-sheet-search"
        placeholder={t('messages.searchChats')}
        aria-label={t('messages.searchChats')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="forward-sheet-hint" id="forward-limit">{t('messages.forwardLimit', { max: MAX_FORWARD_TARGETS })}</p>
      {loadError && <p className="forward-sheet-error" role="alert">{loadError}</p>}
      {!chats && !loadError && <p className="forward-sheet-hint" role="status">{t('common.loading')}</p>}
      {chats && visible.length === 0 && <p className="forward-sheet-hint">{t('messages.forwardNoChats')}</p>}
      {chats && visible.length > 0 && (
        <ul className="forward-sheet-list" aria-describedby="forward-limit">
          {visible.map((c) => {
            const checked = picked.includes(c.conversation_id);
            return (
              <li key={c.conversation_id}>
                <label className={`forward-sheet-row${!checked && full ? ' is-disabled' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(c.conversation_id)} />
                  <span aria-hidden="true"><Avatar src={resolveImageUrl(c.avatar_url)} size={36} initials={(c.username || '?').slice(0, 2).toUpperCase()} alt="" /></span>
                  <span className="forward-sheet-name" dir="auto">{c.username}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="forward-sheet-error" role="alert">{error}</p>}
      <div className="forward-sheet-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={send} disabled={picked.length === 0 || sending}>
          {sending ? t('messages.forwardSending') : t('messages.forwardSend', { count: picked.length })}
        </button>
      </div>
    </Modal>
  );
}

export default ForwardSheet;
