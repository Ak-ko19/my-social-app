import { useState, useEffect, useCallback, useRef } from 'react';
import { resolveImageUrl } from './api';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from './components/ui';
import FeedErrorState from './components/feed/FeedErrorState';
import { Trans, useTranslation } from 'react-i18next';
import { formatDate } from './i18n';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from './services/notificationService';
import { useSocketEvent } from './hooks/useSocketEvent';
import { arrowStep } from './utils/direction';
import './components/feed/Feed.css';
import './components/profile/ProfileTabs.css';
import './Notifications.css';

// i18n key under notifications.types -- each is a whole sentence with the
// actor's name in it, since word order differs between languages.
function notificationKey(n) {
  if (n.type === 'like') return 'like';
  if (n.type === 'comment') return 'comment';
  if (n.type === 'follow') return 'follow';
  if (n.type === 'mention') return n.comment_id ? 'mentionComment' : 'mentionPost';
  if (n.type === 'follow_request') return 'followRequest';
  if (n.type === 'follow_accepted') return 'followAccepted';
  if (n.type === 'reply') return 'reply';
  if (n.type === 'comment_like') return 'commentLike';
  // Day 45: about your own scheduled post.
  if (n.type === 'scheduled_post') return 'scheduledPost';
  if (n.type === 'scheduled_failed') return 'scheduledFailed';
  if (n.type === 'poll_ended') return 'pollEnded';
  if (n.type === 'poll_ended_own') return 'pollEndedOwn';
  // Day 50: groups.
  if (n.type === 'group_request') return 'groupRequest';
  if (n.type === 'group_approved') return 'groupApproved';
  // Day 53: made an admin of a page.
  if (n.type === 'page_admin') return 'pageAdmin';
  // Day 55: events you answered.
  if (n.type === 'event_reminder') return 'eventReminder';
  if (n.type === 'event_cancelled') return 'eventCancelled';
  // Day 77: a login on a new kind of device.
  if (n.type === 'new_login') return 'newLogin';
  // Day 82: an admin removed something of yours after a report.
  if (n.type === 'content_removed') return 'contentRemoved';
  // Day 84: you have memories today.
  if (n.type === 'memories') return 'memories';
  return 'other';
}

// Day 81: the kinds the server groups (backend notificationController),
// and their key under notifications.grouped.
const GROUPED = { like: 'like', comment: 'comment', comment_like: 'commentLike', follow: 'follow' };

// Day 77: a new_login alert's device ({ browser, os }) in words, as the
// Sessions screen writes it.
function deviceWords(device, t) {
  if (!device) return '';
  return t('sessions.device', { browser: device.browser || t('sessions.unknownBrowser'), os: device.os || t('sessions.unknownDevice') });
}

// Day 82: what was removed and why, in words (content_removed).
function removedWords(details, t) {
  if (!details) return {};
  return { kind: t(`notifications.removedKinds.${details.kind}`), reason: t(`report.reasons.${details.reason}`) };
}

// Day 81: where tapping a notification takes you (null: nowhere -- its own
// buttons say what you can do).
function targetOf(n, myId) {
  switch (n.type) {
    case 'like': case 'comment': case 'mention': case 'reply': case 'comment_like':
    case 'scheduled_post': case 'poll_ended': case 'poll_ended_own':
      return n.post_id ? `/posts/${n.post_id}` : null;
    case 'follow':
      return n.actor_count > 1 ? `/profile/${myId}/connections?tab=followers` : `/profile/${n.actor_id}`;
    case 'follow_accepted':
      return `/profile/${n.actor_id}`;
    case 'follow_request':
      return '/settings/follow-requests';
    case 'scheduled_failed':
      return '/drafts';
    case 'group_request':
      return n.community_id ? `/groups/${n.community_id}/manage` : null;
    case 'group_approved':
      return n.community_id ? `/groups/${n.community_id}` : null;
    case 'page_admin':
      return n.page_id ? `/pages/${n.page_id}` : null;
    case 'event_reminder': case 'event_cancelled':
      return n.event_id ? `/events/${n.event_id}` : null;
    case 'new_login':
      return '/settings/sessions';
    case 'memories':
      return '/memories';
    default:
      return null;
  }
}

const FILTERS = ['all', 'unread', 'mentions', 'follows'];
const EMPTY_KEY = { all: 'notifications.empty', unread: 'notifications.emptyUnread', mentions: 'notifications.emptyMentions', follows: 'notifications.emptyFollows' };

// The sentence: one person ("Alice liked your post"), or a group ("Alice,
// Bob and 3 others liked your post").
function Sentence({ n, t }) {
  const group = GROUPED[n.type];
  const actors = n.actors || [];
  if (group && n.actor_count > 1 && actors.length > 1) {
    const [first, second] = actors;
    return n.actor_count === 2 ? (
      <Trans i18nKey={`notifications.grouped.${group}Two`} values={{ name: first.username, name2: second.username }} components={{ b: <strong /> }} />
    ) : (
      <Trans i18nKey={`notifications.grouped.${group}Many`} count={n.actor_count - 2} values={{ name: first.username, name2: second.username, count: n.actor_count - 2 }} components={{ b: <strong /> }} />
    );
  }
  return (
    <Trans i18nKey={`notifications.types.${notificationKey(n)}`} count={n.type === 'memories' ? n.details?.yearsAgo : undefined} values={{ name: n.actor_username, group: n.community_name, page: n.page_name, event: n.event_name, time: n.event_starts_at ? formatDate(n.event_starts_at, 'time') : '', device: deviceWords(n.device, t), ...removedWords(n.details, t) }} components={{ b: <strong /> }} />
  );
}

// Day 81: up to two faces for a group, one otherwise.
function Faces({ n }) {
  const actors = n.actor_count > 1 && n.actors?.length > 1 ? n.actors.slice(0, 2) : [{ id: n.actor_id, username: n.actor_username, avatar_url: n.actor_avatar_url }];
  return (
    <span className={actors.length > 1 ? 'notif-faces is-group' : 'notif-faces'} aria-hidden="true">
      {actors.map((a) => (
        <Avatar key={a.id} size={actors.length > 1 ? 30 : 36} src={resolveImageUrl(a.avatar_url)} initials={(a.username || '?').slice(0, 2).toUpperCase()} alt="" />
      ))}
    </span>
  );
}

function Notifications() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.includes(params.get('filter')) ? params.get('filter') : 'all';
  // { filter, items, nextCursor } for the list on screen; null while loading.
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState('');
  const [hasNew, setHasNew] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const tabRefs = useRef({});
  const navigate = useNavigate();
  const { t } = useTranslation();

  const token = localStorage.getItem('token');
  const myId = localStorage.getItem('userId');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return undefined;
    }
    let cancelled = false;
    fetchNotifications(token, { filter })
      .then((data) => {
        if (cancelled) return;
        setList({ filter, items: data.notifications, nextCursor: data.nextCursor });
        setError('');
        setHasNew(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(t('notifications.loadFailed'));
      });
    return () => { cancelled = true; };
  }, [token, navigate, filter, attempt, t]);

  const reload = useCallback(() => {
    setError('');
    setList(null);
    setAttempt((n) => n + 1);
  }, []);

  // Day 81: something new arrived while the list is open: offer it rather
  // than moving the list under the reader's finger.
  useSocketEvent('notification_new', () => setHasNew(true));

  const loadMore = () => {
    if (!list?.nextCursor) return;
    setLoadingMore(true);
    setActionError('');
    fetchNotifications(token, { filter, cursor: list.nextCursor })
      .then((data) => setList((current) => (current?.filter !== filter ? current : {
        ...current,
        items: [...current.items, ...data.notifications.filter((n) => !current.items.some((c) => c.id === n.id))],
        nextCursor: data.nextCursor
      })))
      .catch((err) => {
        console.error(err);
        setActionError(t('notifications.loadMoreFailed'));
      })
      .finally(() => setLoadingMore(false));
  };

  const setRead = (id) => setList((current) => current && { ...current, items: current.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)) });

  const markAsRead = (id) => {
    setActionError('');
    markNotificationRead(id, token)
      .then(() => setRead(id))
      .catch((err) => {
        console.error(err);
        setActionError(t('notifications.markFailed'));
      });
  };

  // Opening a notification reads it (best effort: the page opens anyway).
  const open = (n) => {
    if (!n.is_read) markNotificationRead(n.id, token).catch((err) => console.error(err));
  };

  const markAllAsRead = () => {
    setActionError('');
    markAllNotificationsRead(token)
      .then(() => setList((current) => current && { ...current, items: current.items.map((n) => ({ ...n, is_read: true })) }))
      .catch((err) => {
        console.error(err);
        setActionError(t('notifications.markAllFailed'));
      });
  };

  const select = (next) => {
    setParams(next === 'all' ? {} : { filter: next }, { replace: true });
    tabRefs.current[next]?.focus();
  };
  const handleKeyDown = (e, index) => {
    const step = arrowStep(e.key);
    let next = null;
    if (step) next = (index + step + FILTERS.length) % FILTERS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = FILTERS.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(FILTERS[next]);
    }
  };

  const loading = !error && (!list || list.filter !== filter);
  const items = loading || !list ? [] : list.items;
  const allRead = items.every((n) => n.is_read);

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />
        <h1 className="screen-header-title">{t('notifications.title')}</h1>
        {!loading && !error && items.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={markAllAsRead} disabled={allRead}>
            {t('notifications.markAll')}
          </button>
        )}
      </header>

      <div role="tablist" aria-label={t('notifications.filters')} className="profile-tablist notif-tablist">
        {FILTERS.map((f, i) => (
          <button
            key={f}
            ref={(el) => { tabRefs.current[f] = el; }}
            type="button"
            role="tab"
            id={`notif-tab-${f}`}
            aria-selected={f === filter}
            aria-controls="notif-panel"
            tabIndex={f === filter ? 0 : -1}
            className={`profile-tab${f === filter ? ' is-active' : ''}`}
            onClick={() => select(f)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            {t(`notifications.filter.${f}`)}
          </button>
        ))}
      </div>

      <div className="screen-body" id="notif-panel" role="tabpanel" aria-labelledby={`notif-tab-${filter}`}>
        {hasNew && !loading && (
          <button type="button" className="notif-new-pill" onClick={reload}>{t('notifications.showNew')}</button>
        )}
        {loading && <p className="screen-status" role="status">{t('notifications.loading')}</p>}
        {error && <FeedErrorState message={error} onRetry={reload} />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="screen-status" role="status">{t(EMPTY_KEY[filter])}</p>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="card-list">
            {items.map((n) => {
              const target = targetOf(n, myId);
              const main = (
                <>
                  <Faces n={n} />
                  <span className="notif-text">
                    <span className="notif-sentence"><Sentence n={n} t={t} /></span>
                    {n.post_content && <span className="card-row-quote" dir="auto">“{n.post_content}”</span>}
                    {n.details?.excerpt && <span className="card-row-quote" dir="auto">“{n.details.excerpt}”</span>}
                    <span className="card-row-meta">{formatDate(n.created_at)}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className={n.is_read ? 'card-row notif-row' : 'card-row card-row-highlight notif-row'}>
                  {target ? (
                    <Link to={target} className="notif-main" onClick={() => open(n)}>{main}</Link>
                  ) : (
                    <div className="notif-main">{main}</div>
                  )}
                  <div className="card-row-body notif-actions-wrap">
                    {/* Day 50: where a group notification leads. */}
                    {n.community_id && (
                      <div className="card-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { open(n); navigate(n.type === 'group_request' ? `/groups/${n.community_id}/manage` : `/groups/${n.community_id}`); }}
                          aria-label={t(n.type === 'group_request' ? 'notifications.reviewRequestsIn' : 'notifications.openGroupNamed', { group: n.community_name })}>
                          {t(n.type === 'group_request' ? 'notifications.reviewRequests' : 'notifications.openGroup')}
                        </button>
                      </div>
                    )}
                    {n.event_id && (
                      <div className="card-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { open(n); navigate(`/events/${n.event_id}`); }}
                          aria-label={t('notifications.openEventNamed', { event: n.event_name })}>
                          {t('notifications.openEvent')}
                        </button>
                      </div>
                    )}
                    {n.page_id && (
                      <div className="card-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { open(n); navigate(`/pages/${n.page_id}`); }}
                          aria-label={t('notifications.openPageNamed', { page: n.page_name })}>
                          {t('notifications.openPage')}
                        </button>
                      </div>
                    )}
                    {n.type === 'content_removed' && (
                      <div className="card-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { open(n); navigate('/terms'); }}>
                          {t('notifications.readRules')}
                        </button>
                      </div>
                    )}
                    {n.type === 'new_login' && (
                      <div className="card-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { open(n); navigate('/settings/sessions'); }}>
                          {t('notifications.checkDevices')}
                        </button>
                      </div>
                    )}
                    {!n.is_read && (
                      <div className="card-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => markAsRead(n.id)}>
                          {t('notifications.markRead')}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !error && list?.nextCursor && (
          <button type="button" className="btn btn-secondary btn-block notif-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('common.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}

export default Notifications;
