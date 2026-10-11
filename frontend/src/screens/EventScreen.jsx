import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ChevronLeft, Globe, MapPin, Pencil, Star, Users } from 'lucide-react';
import clsx from 'clsx';
import { Avatar, ConfirmDialog, IconButton } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { resolveImageUrl } from '../api';
import { useAuth } from '../hooks/useAuth';
import {
  cancelEvent, deleteEvent, fetchEvent, fetchEventGuests, removeEventResponse, respondToEvent
} from '../services/eventService';
import { eventBadge, formatEventTime } from '../utils/eventTime';
import { serverErrorText } from '../utils/serverError';
import './EventsScreen.css';

const initials = (name) => (name || '?').slice(0, 2).toUpperCase();

// Who's going / interested, a page at a time.
function Guests({ event, token }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('going');
  const [list, setList] = useState(null); // { guests, page, hasMore }
  const [failed, setFailed] = useState(false);

  const load = useCallback((page = 1) => {
    fetchEventGuests(event.id, status, token, { page })
      .then((d) => {
        setFailed(false);
        setList((prev) => (page === 1 ? d : { ...d, guests: [...prev.guests, ...d.guests] }));
      })
      .catch(() => setFailed(true));
  }, [event.id, status, token]);
  // Reloads when the counts change too (you answered).
  useEffect(() => load(1), [load, event.going_count, event.interested_count]);

  return (
    <section className="event-guest-tabs" aria-labelledby="event-guests-heading">
      <h2 id="event-guests-heading" className="section-heading">{t('events.guests')}</h2>
      <div className="events-tablist" role="group" aria-label={t('events.guests')}>
        {['going', 'interested'].map((s) => (
          <button key={s} type="button" className={clsx('events-tab', s === status && 'is-active')} aria-pressed={s === status}
            onClick={() => setStatus(s)}>
            {t(`events.guestTab.${s}`, { count: s === 'going' ? event.going_count : event.interested_count })}
          </button>
        ))}
      </div>
      {failed && <FeedErrorState message={t('events.guestsFailed')} onRetry={() => load(1)} />}
      {list && list.guests.length === 0 && <p className="screen-status">{t(`events.noGuests.${status}`)}</p>}
      {list && list.guests.length > 0 && (
        <ul className="card-list">
          {list.guests.map((g) => (
            <li key={g.id} className="card-row group-member-row">
              <Avatar src={resolveImageUrl(g.avatar_url)} initials={initials(g.username)} size={36} alt="" />
              <Link to={`/profile/${g.id}`} className="card-row-body">{g.username}</Link>
            </li>
          ))}
        </ul>
      )}
      {list?.hasMore && (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => load(list.page + 1)}>{t('common.loadMore')}</button>
      )}
    </section>
  );
}

// Day 55: /events/:id -- when and where, the host, details, Going /
// Interested, the guests; the host edits, cancels or deletes it.
function EventScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useAuth();
  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // 'cancel' | 'delete'
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchEvent(id, token)
      .then((e) => {
        if (!cancelled) setEvent(e);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.status === 404 ? 'gone' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, reloadKey]);

  // Going / Interested: pressing your current answer takes it back.
  const answer = async (status) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setEvent(event.my_response === status ? await removeEventResponse(event.id, token) : await respondToEvent(event.id, status, token));
    } catch (err) {
      setError(serverErrorText(err, 'events.answerFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async () => {
    setError('');
    try {
      if (confirm === 'delete') {
        await deleteEvent(event.id, token);
        navigate('/events', { replace: true });
        return;
      }
      setEvent(await cancelEvent(event.id, token));
      setConfirm(null);
    } catch (err) {
      setConfirm(null);
      setError(serverErrorText(err, 'events.actionFailed'));
    }
  };

  const header = (
    <header className="screen-header">
      <IconButton icon={ChevronLeft} aria-label={t('events.backToEvents')} onClick={() => navigate('/events')} />
      <h1 className="screen-header-title">{event?.name || t('events.event')}</h1>
      {event?.is_host && !event.cancelled_at && !event.has_ended && (
        <IconButton icon={Pencil} aria-label={t('events.edit')} onClick={() => navigate(`/events/${event.id}/edit`)} />
      )}
    </header>
  );

  if (loadError) {
    return (
      <div className="screen-enter">
        {header}
        <FeedErrorState
          message={loadError === 'gone' ? t('events.gone') : t('events.loadFailed')}
          onRetry={loadError === 'gone' ? undefined : () => { setLoadError(''); setReloadKey((k) => k + 1); }}
        />
      </div>
    );
  }
  if (!event) return <p className="screen-status" role="status">{t('common.loading')}</p>;

  const badge = eventBadge(event.starts_at);
  const open = !event.cancelled_at && !event.has_ended;
  return (
    <div className="screen-enter">
      {header}
      <div className="screen-body event-page">
        <div className="event-hero">
          <span className="event-badge" aria-hidden="true">
            <span className="event-badge-month">{badge.month}</span>
            <span className="event-badge-day">{badge.day}</span>
          </span>
          <div className="event-hero-text">
            <p className="event-when">{formatEventTime(event.starts_at, event.ends_at)}</p>
            <h2 className="event-title" dir="auto">{event.name}</h2>
          </div>
        </div>
        {event.cancelled_at && <p className="event-notice event-notice-cancelled" role="status">{t('events.cancelledNotice')}</p>}
        {!event.cancelled_at && event.has_ended && <p className="event-notice" role="status">{t('events.endedNotice')}</p>}

        <ul className="event-facts">
          <li className="event-fact">
            <Users size={16} aria-hidden="true" />
            <span>
              {t('events.hostedBy', { name: event.host_username })}
              {' · '}{t('events.goingCount', { count: event.going_count })}
              {' · '}{t('events.interestedCount', { count: event.interested_count })}
            </span>
          </li>
          {event.location && (
            <li className="event-fact">
              <MapPin size={16} aria-hidden="true" />
              <span dir="auto">{event.location}</span>
            </li>
          )}
          <li className="event-fact">
            {event.audience === 'public' ? <Globe size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}
            <span>{t(`events.audienceNote.${event.audience}`)}</span>
          </li>
        </ul>
        {event.description && <p className="event-details" dir="auto">{event.description}</p>}

        {token && !event.is_host && open && (
          <div className="event-actions">
            <button type="button" className={clsx('btn', event.my_response === 'going' ? 'btn-primary' : 'btn-secondary')}
              aria-pressed={event.my_response === 'going'} onClick={() => answer('going')} disabled={busy}>
              <CalendarCheck size={16} aria-hidden="true" /> {t('events.going')}
            </button>
            <button type="button" className={clsx('btn', event.my_response === 'interested' ? 'btn-primary' : 'btn-secondary')}
              aria-pressed={event.my_response === 'interested'} onClick={() => answer('interested')} disabled={busy}>
              <Star size={16} aria-hidden="true" /> {t('events.interested')}
            </button>
          </div>
        )}
        {event.is_host && open && (
          <div className="event-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm('cancel')}>{t('events.cancel')}</button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>{t('events.delete')}</button>
          </div>
        )}
        {event.is_host && !open && (
          <div className="event-actions">
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>{t('events.delete')}</button>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}

        <Guests event={event} token={token} />
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmAction}
        title={confirm === 'delete' ? t('events.deleteTitle', { name: event.name }) : t('events.cancelTitle', { name: event.name })}
        description={confirm === 'delete' ? t('events.deleteText') : t('events.cancelText')}
        confirmLabel={confirm === 'delete' ? t('events.delete') : t('events.cancel')}
        cancelLabel={t('events.keep')}
        danger
      />
    </div>
  );
}

export default EventScreen;
