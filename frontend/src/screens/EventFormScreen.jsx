import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Globe, Users } from 'lucide-react';
import { IconButton } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { createEvent, fetchEvent, updateEvent } from '../services/eventService';
import { fromLocalInputValue, timeZone, toLocalInputValue } from '../utils/localTime';
import { serverErrorText } from '../utils/serverError';
import './EventsScreen.css';

const HOUR = 60 * 60 * 1000;
const AUDIENCES = [['public', Globe], ['followers', Users]];

// The next whole hour, at least an hour from now: a sensible first pick.
function defaultStart() {
  const d = new Date(Date.now() + 2 * HOUR);
  d.setMinutes(0, 0, 0);
  return toLocalInputValue(d);
}

// Day 55: /events/new and /events/:id/edit (the host). The times are in
// the viewer's own time zone, shown under the pickers.
function EventFormScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useAuth();
  const editing = Boolean(id);
  const [form, setForm] = useState(editing ? null : {
    name: '', startsAt: defaultStart(), endsAt: '', location: '', description: '', audience: 'public'
  });
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!editing) return undefined;
    let cancelled = false;
    fetchEvent(id, token)
      .then((event) => {
        if (cancelled) return;
        if (!event.is_host) {
          setLoadError(t('events.hostOnly'));
          return;
        }
        setForm({
          name: event.name,
          startsAt: toLocalInputValue(event.starts_at),
          endsAt: event.ends_at ? toLocalInputValue(event.ends_at) : '',
          location: event.location || '',
          description: event.description || '',
          audience: event.audience
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(serverErrorText(err, 'events.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [editing, id, token, t, reloadKey]);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const start = fromLocalInputValue(form.startsAt);
    const end = form.endsAt ? fromLocalInputValue(form.endsAt) : null;
    // The server checks again; these catch the common slips before sending.
    if (!start) return setError(t('events.form.pickStart'));
    if (form.endsAt && (!end || end <= start)) return setError(t('events.form.endAfterStart'));
    setSaving(true);
    setError('');
    const fields = {
      name: form.name,
      startsAt: start.toISOString(),
      endsAt: end ? end.toISOString() : null,
      location: form.location,
      description: form.description,
      audience: form.audience
    };
    try {
      const event = editing ? await updateEvent(id, fields, token) : await createEvent(fields, token);
      navigate(`/events/${event.id}`, { replace: editing });
    } catch (err) {
      setError(serverErrorText(err, 'events.form.saveFailed'));
      setSaving(false);
    }
  };

  const zone = timeZone();
  const header = (
    <header className="screen-header">
      <IconButton
        icon={ChevronLeft}
        aria-label={editing ? t('events.backToEvent') : t('events.backToEvents')}
        onClick={() => navigate(editing ? `/events/${id}` : '/events')}
      />
      <h1 className="screen-header-title">{editing ? t('events.form.editTitle') : t('events.form.createTitle')}</h1>
    </header>
  );

  if (loadError) {
    return (
      <div className="screen-enter">
        {header}
        <FeedErrorState message={loadError} onRetry={() => { setLoadError(''); setReloadKey((k) => k + 1); }} />
      </div>
    );
  }
  if (!form) return <p className="screen-status" role="status">{t('common.loading')}</p>;

  return (
    <div className="screen-enter">
      {header}
      <form className="screen-body form-stack event-form" onSubmit={save} noValidate>
        <label className="form-field">
          <span className="form-label">{t('events.form.name')}</span>
          <input className="form-input" dir="auto" maxLength={100} value={form.name} onChange={set('name')} required placeholder={t('events.form.namePlaceholder')} />
        </label>
        <div className="event-times">
          <label className="form-field">
            <span className="form-label">{t('events.form.starts')}</span>
            <input type="datetime-local" className="form-input" dir="ltr" value={form.startsAt} onChange={set('startsAt')} required
              aria-describedby={zone ? 'event-zone' : undefined} />
          </label>
          <label className="form-field">
            <span className="form-label">{t('events.form.ends')}</span>
            <input type="datetime-local" className="form-input" dir="ltr" value={form.endsAt} onChange={set('endsAt')}
              aria-describedby={zone ? 'event-zone' : undefined} />
          </label>
          {zone && <span id="event-zone" className="form-hint">{t('drafts.timeZone', { zone })}</span>}
        </div>
        <label className="form-field">
          <span className="form-label">{t('events.form.location')}</span>
          <input className="form-input" dir="auto" maxLength={200} value={form.location} onChange={set('location')} placeholder={t('events.form.locationPlaceholder')} />
        </label>
        <label className="form-field">
          <span className="form-label">{t('events.form.details')}</span>
          <textarea className="form-input" dir="auto" rows="4" maxLength={2000} value={form.description} onChange={set('description')} />
        </label>
        <fieldset className="audience-picker">
          <legend className="form-label">{t('events.form.audience')}</legend>
          {AUDIENCES.map(([value, Icon]) => (
            <label key={value} className={form.audience === value ? 'audience-option is-selected' : 'audience-option'}>
              <input type="radio" name="audience" value={value} checked={form.audience === value} onChange={set('audience')} />
              <Icon size={15} aria-hidden="true" /> {t(`events.audience.${value}`)}
            </label>
          ))}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving || !form.name.trim()}>
          {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('events.form.create')}
        </button>
      </form>
    </div>
  );
}

export default EventFormScreen;
