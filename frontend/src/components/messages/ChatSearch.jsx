import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search, X } from 'lucide-react';
import { IconButton } from '../ui';
import { searchConversation, fetchMessageContext } from '../../services/messageService';
import { serverErrorText } from '../../utils/serverError';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

// The words that matched, marked inside the text (case-insensitive).
function Highlighted({ text, query }) {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return text;
  const parts = [];
  const lower = text.toLowerCase();
  let from = 0;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return parts;
}

// Day 99: "Search in this chat" (Messenger / WhatsApp). It takes the
// thread's place: a box, the matching messages newest first (the words
// marked), and -- for a result -- the messages around it, read-only, with
// that one highlighted. The live thread itself never jumps (it keeps the
// newest messages, live and offline-queued).
function ChatSearch({ conversationId, token, userId, isGroup, onClose }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState('');
  const [context, setContext] = useState(null); // { messageId, messages } | 'loading' | { error }
  const requestRef = useRef(0);
  const matchRef = useRef(null);
  // Under 2 characters nothing is searched (and older results aren't shown).
  const active = query.trim().length >= MIN_QUERY;

  // Debounced: a request once typing pauses; an older answer never wins.
  useEffect(() => {
    const q = query.trim();
    const request = ++requestRef.current;
    if (q.length < MIN_QUERY) return undefined;
    const timer = setTimeout(() => {
      setStatus('loading');
      searchConversation(conversationId, q, token)
        .then((data) => {
          if (request !== requestRef.current) return;
          setResults(data.results);
          setNextCursor(data.nextCursor);
          setStatus('done');
        })
        .catch((err) => {
          if (request !== requestRef.current) return;
          console.error(err);
          setError(serverErrorText(err, 'messages.search.failed'));
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, conversationId, token]);

  const loadMore = () => {
    const request = requestRef.current;
    searchConversation(conversationId, query.trim(), token, { cursor: nextCursor })
      .then((data) => {
        if (request !== requestRef.current) return;
        setResults((current) => [...current, ...data.results]);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'messages.search.failed'));
      });
  };

  const openResult = (result) => {
    setContext('loading');
    fetchMessageContext(conversationId, result.id, token)
      .then(setContext)
      .catch((err) => {
        console.error(err);
        setContext({ error: serverErrorText(err, 'messages.search.contextFailed') });
      });
  };

  // The match in view once its messages are shown.
  useEffect(() => {
    if (context?.messages) matchRef.current?.scrollIntoView?.({ block: 'center' });
  }, [context]);

  const senderOf = (message) => (message.sender_id === userId ? t('messages.search.you') : message.sender_username);
  const textOf = (message) => {
    if (message.deleted_at) return t('messages.preview.deleted');
    if (message.type === 'voice') return t('messages.preview.voice');
    if (message.type === 'image') return message.content ? t('messages.preview.photoCaption', { caption: message.content }) : t('messages.preview.photo');
    return message.content;
  };

  if (context) {
    return (
      <section className="chat-search" aria-label={t('messages.search.contextTitle')}>
        <div className="chat-search-bar">
          <IconButton icon={ChevronLeft} aria-label={t('messages.search.backToResults')} onClick={() => setContext(null)} />
          <h2 className="chat-search-title">{t('messages.search.contextTitle')}</h2>
          <IconButton icon={X} aria-label={t('messages.search.close')} onClick={onClose} />
        </div>
        {context === 'loading' && <p className="chat-search-status" role="status">{t('common.loading')}</p>}
        {context.error && <p className="form-error" role="alert">{context.error}</p>}
        {context.messages && (
          // Scrolls on its own, so it takes keyboard focus (arrow keys scroll it).
          <ol className="chat-search-context" tabIndex={0} aria-label={t('messages.search.contextTitle')}>
            {context.messages.map((message) => {
              const isMatch = message.id === context.messageId;
              return (
                <li
                  key={message.id}
                  ref={isMatch ? matchRef : undefined}
                  className={`chat-search-bubble${message.sender_id === userId ? ' is-own' : ''}${isMatch ? ' is-match' : ''}`}
                  aria-current={isMatch ? 'true' : undefined}
                >
                  {isGroup && message.sender_id !== userId && <span className="chat-search-sender">{message.sender_username || ''}</span>}
                  <span className="chat-search-text" dir="auto">{isMatch ? <Highlighted text={textOf(message)} query={query} /> : textOf(message)}</span>
                  <time className="chat-search-time" dateTime={message.created_at}>{formatRelativeTime(message.created_at)}</time>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  }

  return (
    <section className="chat-search" aria-label={t('messages.search.open')}>
      <div className="chat-search-bar">
        <label className="chat-search-box">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            className="chat-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('messages.search.placeholder')}
            aria-label={t('messages.search.placeholder')}
            dir="auto"
            maxLength={100}
            // The panel opened for this: straight to typing.
            autoFocus
          />
        </label>
        <IconButton icon={X} aria-label={t('messages.search.close')} onClick={onClose} />
      </div>
      {(!active || status === 'idle') && <p className="chat-search-status">{t('messages.search.hint')}</p>}
      {active && status === 'loading' && <p className="chat-search-status" role="status">{t('common.loading')}</p>}
      {active && status === 'error' && <p className="form-error" role="alert">{error}</p>}
      {active && status === 'done' && results.length === 0 && <p className="chat-search-status" role="status">{t('messages.search.none')}</p>}
      {active && status === 'done' && results.length > 0 && (
        <ul className="chat-search-results" aria-label={t('messages.search.results', { count: results.length })}>
          {results.map((result) => (
            <li key={result.id}>
              <button type="button" className="chat-search-result" onClick={() => openResult(result)}>
                <span className="chat-search-result-top">
                  <span className="chat-search-sender">{senderOf(result)}</span>
                  <time className="chat-search-time" dateTime={result.created_at}>{formatRelativeTime(result.created_at)}</time>
                </span>
                <span className="chat-search-text" dir="auto"><Highlighted text={textOf(result)} query={query} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {active && nextCursor && status === 'done' && (
        <button type="button" className="btn btn-secondary btn-sm chat-search-more" onClick={loadMore}>{t('common.loadMore')}</button>
      )}
    </section>
  );
}

export default ChatSearch;
