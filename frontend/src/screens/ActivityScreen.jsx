import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Heart, MessageCircle, Search } from 'lucide-react';
import clsx from 'clsx';
import { IconButton, ConfirmDialog } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../i18n';
import { arrowStep } from '../utils/direction';
import { serverErrorText } from '../utils/serverError';
import { REACTION_BY_KEY } from '../utils/reactions';
import { fetchActivity } from '../services/activityService';
import { unlikePost, unlikeComment, deleteComment } from '../services/postService';
import { fetchSearchHistory, deleteSearch, clearSearchHistory } from '../services/searchService';
import './ActivityScreen.css';

// Day 48: /activity -- your activity log (Facebook's): what you liked, what
// you commented and what you searched, each one removable. Only you see it.
const TABS = [
  { key: 'likes', icon: Heart },
  { key: 'comments', icon: MessageCircle },
  { key: 'searches', icon: Search }
];

function ActivityScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = TABS.some((tab) => tab.key === searchParams.get('tab')) ? searchParams.get('tab') : 'likes';
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading'); // loading | error | ready
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [actionError, setActionError] = useState('');
  const [confirm, setConfirm] = useState(null); // { kind: 'comment', item } | { kind: 'clear' }
  const tabRefs = useRef({});
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const request = ++requestRef.current;
    const work = active === 'searches'
      ? fetchSearchHistory(token).then((list) => ({ items: list, hasMore: false }))
      : fetchActivity(active, token);
    work
      .then((data) => {
        if (request !== requestRef.current) return;
        setItems(data.items);
        setHasMore(data.hasMore);
        setPage(1);
        setState('ready');
      })
      .catch(() => {
        if (request === requestRef.current) setState('error');
      });
  }, [active, token]);

  useEffect(() => {
    load();
  }, [load]);

  const select = (key) => {
    setState('loading');
    setItems([]);
    setActionError('');
    setSearchParams(key === 'likes' ? {} : { tab: key }, { replace: true });
    tabRefs.current[key]?.focus();
  };
  const handleTabKey = (e, index) => {
    const step = arrowStep(e.key);
    let next = null;
    if (step) next = (index + step + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(TABS[next].key);
    }
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchActivity(active, token, { page: page + 1 });
      setItems((list) => [...list, ...data.items]);
      setHasMore(data.hasMore);
      setPage(page + 1);
    } catch (err) {
      setActionError(serverErrorText(err, 'activity.loadFailed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const keyOf = (item) => (active === 'likes' ? `${item.kind}-${item.comment_id ?? item.post_id}` : String(item.id));
  const remove = async (item, work) => {
    const key = keyOf(item);
    if (busyKey) return;
    setBusyKey(key);
    setActionError('');
    try {
      await work();
      setItems((list) => list.filter((i) => keyOf(i) !== key));
    } catch (err) {
      setActionError(serverErrorText(err, 'activity.removeFailed'));
    } finally {
      setBusyKey(null);
    }
  };
  const removeLike = (item) => remove(item, () => (item.kind === 'post' ? unlikePost(item.post_id, token) : unlikeComment(item.comment_id, token)));
  const removeSearch = (item) => remove(item, () => deleteSearch(item.id, token));
  const confirmAction = async () => {
    if (confirm.kind === 'comment') {
      await remove(confirm.item, () => deleteComment(confirm.item.id, token));
    } else {
      try {
        await clearSearchHistory(token);
        setItems([]);
      } catch (err) {
        setActionError(serverErrorText(err, 'activity.removeFailed'));
      }
    }
    setConfirm(null);
  };

  const likeText = (item) => {
    if (item.kind === 'comment') return t('activity.likedComment', { name: item.comment_author });
    const reaction = REACTION_BY_KEY[item.reaction] || REACTION_BY_KEY.like;
    return t('activity.reacted', { reaction: t(`reactions.${reaction.key}`), name: item.post_author });
  };

  const row = (item) => {
    const busy = busyKey === keyOf(item);
    if (active === 'searches') {
      return (
        <li key={item.id} className="activity-row">
          <Search size={18} aria-hidden="true" className="activity-icon" />
          <div className="activity-body">
            <Link to={`/search?q=${encodeURIComponent(item.query)}`} className="activity-title" dir="auto">{item.query}</Link>
            <span className="activity-time">{formatDate(item.searched_at, 'longTime')}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeSearch(item)} disabled={busy}
            aria-label={t('activity.removeSearch', { query: item.query })}>
            {t('activity.remove')}
          </button>
        </li>
      );
    }
    const isLike = active === 'likes';
    const reaction = isLike && item.kind === 'post' ? REACTION_BY_KEY[item.reaction] || REACTION_BY_KEY.like : null;
    return (
      <li key={keyOf(item)} className="activity-row">
        {reaction
          ? <span className="activity-icon activity-emoji" aria-hidden="true">{reaction.emoji}</span>
          : isLike ? <Heart size={18} aria-hidden="true" className="activity-icon" /> : <MessageCircle size={18} aria-hidden="true" className="activity-icon" />}
        <div className="activity-body">
          <Link to={`/posts/${item.post_id}`} className="activity-title">
            {isLike ? likeText(item) : t(item.is_reply ? 'activity.replied' : 'activity.commented', { name: item.post_author })}
          </Link>
          {isLike && item.kind === 'comment' && <p className="activity-quote" dir="auto">“{item.comment_content}”</p>}
          {!isLike && <p className="activity-quote activity-mine" dir="auto">{item.content}</p>}
          {item.post_content && <p className="activity-post" dir="auto">{item.post_content}</p>}
          <span className="activity-time">{formatDate(item.created_at, 'longTime')}</span>
        </div>
        {isLike ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeLike(item)} disabled={busy}
            aria-label={item.kind === 'post' ? t('activity.unreactLabel', { name: item.post_author }) : t('activity.unlikeCommentLabel', { name: item.comment_author })}>
            {item.kind === 'post' ? t('activity.unreact') : t('activity.unlike')}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm({ kind: 'comment', item })} disabled={busy}
            aria-label={t('activity.deleteCommentLabel', { name: item.post_author })}>
            {t('common.delete')}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('activity.title')}</h1>
      </header>

      <div role="tablist" aria-label={t('activity.tabs')} className="activity-tablist">
        {TABS.map((tab, i) => {
          const Icon = tab.icon;
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[tab.key] = el; }}
              type="button"
              role="tab"
              id={`activity-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls="activity-tabpanel"
              tabIndex={selected ? 0 : -1}
              className={clsx('activity-tab', selected && 'is-active')}
              onClick={() => select(tab.key)}
              onKeyDown={(e) => handleTabKey(e, i)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(`activity.tab.${tab.key}`)}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="activity-tabpanel" aria-labelledby={`activity-tab-${active}`} className="screen-body activity-panel">
        <p className="form-hint">{t('activity.private')}</p>
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {state === 'loading' && <p className="screen-status" role="status">{t('common.loading')}</p>}
        {state === 'error' && <FeedErrorState message={t('activity.loadFailed')} onRetry={() => { setState('loading'); load(); }} />}
        {state === 'ready' && items.length === 0 && <p className="screen-status" role="status">{t(`activity.empty.${active}`)}</p>}
        {state === 'ready' && active === 'searches' && items.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm activity-clear" onClick={() => setConfirm({ kind: 'clear' })}>
            {t('activity.clearSearches')}
          </button>
        )}
        {state === 'ready' && items.length > 0 && <ul className="activity-list">{items.map(row)}</ul>}
        {state === 'ready' && hasMore && (
          <button type="button" className="btn btn-secondary btn-block" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('common.loadMore')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmAction}
        title={confirm?.kind === 'clear' ? t('activity.clearTitle') : t('comments.deleteTitle')}
        description={confirm?.kind === 'clear' ? t('activity.clearText') : t(confirm?.item?.is_reply ? 'comments.deleteText' : 'comments.deleteTextReplies')}
        confirmLabel={confirm?.kind === 'clear' ? t('activity.clear') : t('common.delete')}
        danger
      />
    </div>
  );
}

export default ActivityScreen;
