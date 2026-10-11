import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Plus } from 'lucide-react';
import clsx from 'clsx';
import { IconButton } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { arrowStep } from '../utils/direction';
import { fetchEvents } from '../services/eventService';
import { formatEventTime, eventBadge } from '../utils/eventTime';
import './EventsScreen.css';

const TABS = ['mine', 'discover'];

// One event in a list: a calendar badge, its name, when, and who.
export function EventRow({ event }) {
  const { t } = useTranslation();
  const badge = eventBadge(event.starts_at);
  const status = event.cancelled_at ? 'cancelled' : event.is_host ? 'hosting' : event.my_response;
  return (
    <li className="event-row">
      <Link to={`/events/${event.id}`} className="event-row-link">
        <span className="event-badge" aria-hidden="true">
          <span className="event-badge-month">{badge.month}</span>
          <span className="event-badge-day">{badge.day}</span>
        </span>
        <span className="event-row-text">
          <span className="event-row-name" dir="auto">{event.name}</span>
          <span className="event-row-meta">{formatEventTime(event.starts_at, event.ends_at)}</span>
          <span className="event-row-meta">
            {t('events.hostedBy', { name: event.host_username })} · {t('events.goingCount', { count: event.going_count })}
          </span>
        </span>
        {status && <span className={clsx('event-status', `event-status-${status}`)}>{t(`events.status.${status}`)}</span>}
      </Link>
    </li>
  );
}

// Day 55: /events -- your events (hosting or answered) and events to
// discover, each upcoming soonest first, a page at a time.
function EventsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('tab') === 'discover' ? 'discover' : 'mine';
  const [list, setList] = useState({ events: [], page: 1, hasMore: false });
  const [state, setState] = useState('loading'); // loading | error | ready
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const tabRefs = useRef({});
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const request = ++requestRef.current;
    fetchEvents(active, token)
      .then((d) => {
        if (request !== requestRef.current) return;
        setList({ events: d.events, page: 1, hasMore: d.hasMore });
        setState('ready');
      })
      .catch(() => {
        if (request === requestRef.current) setState('error');
      });
  }, [active, token]);
  useEffect(load, [load]);

  const select = (tab) => {
    setState('loading');
    setMoreError('');
    setSearchParams(tab === 'mine' ? {} : { tab }, { replace: true });
    tabRefs.current[tab]?.focus();
  };
  const onTabKey = (e, i) => {
    const step = arrowStep(e.key);
    if (!step) return;
    e.preventDefault();
    select(TABS[(i + step + TABS.length) % TABS.length]);
  };

  const more = async () => {
    setLoadingMore(true);
    setMoreError('');
    try {
      const d = await fetchEvents(active, token, { page: list.page + 1 });
      setList((prev) => ({ events: [...prev.events, ...d.events], page: prev.page + 1, hasMore: d.hasMore }));
    } catch {
      setMoreError(t('events.loadFailed'));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToMenu')} onClick={() => navigate('/menu')} />
        <h1 className="screen-header-title">{t('events.title')}</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/events/new')}>
          <Plus size={14} aria-hidden="true" /> {t('common.create')}
        </button>
      </header>

      <div role="tablist" aria-label={t('events.title')} className="events-tablist">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            ref={(el) => { tabRefs.current[tab] = el; }}
            type="button"
            role="tab"
            id={`events-tab-${tab}`}
            aria-selected={tab === active}
            aria-controls="events-panel"
            tabIndex={tab === active ? 0 : -1}
            className={clsx('events-tab', tab === active && 'is-active')}
            onClick={() => select(tab)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t(`events.tab.${tab}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="events-panel" aria-labelledby={`events-tab-${active}`} className="screen-body">
        {state === 'loading' && <p className="screen-status" role="status">{t('common.loading')}</p>}
        {state === 'error' && <FeedErrorState message={t('events.loadFailed')} onRetry={() => { setState('loading'); load(); }} />}
        {state === 'ready' && list.events.length === 0 && <p className="screen-status">{t(`events.empty.${active}`)}</p>}
        {state === 'ready' && list.events.length > 0 && (
          <ul className="event-list">
            {list.events.map((event) => <EventRow key={event.id} event={event} />)}
          </ul>
        )}
        {state === 'ready' && list.hasMore && (
          <button type="button" className="btn btn-secondary btn-block" onClick={more} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('common.loadMore')}
          </button>
        )}
        {moreError && <p className="form-error" role="alert">{moreError}</p>}
      </div>
    </div>
  );
}

export default EventsScreen;
