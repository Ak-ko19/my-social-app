import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronLeft, FileText, ImageIcon, ListChecks, Plus } from 'lucide-react';
import clsx from 'clsx';
import { IconButton, ConfirmDialog } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../i18n';
import { serverErrorText, serverText } from '../utils/serverError';
import { arrowStep } from '../utils/direction';
import {
  fetchDrafts, publishDraft, deleteDraft, scheduleDraft, toLocalInputValue, fromLocalInputValue, scheduleProblem,
  MIN_SCHEDULE_MINUTES, MAX_SCHEDULE_DAYS
} from '../services/draftService';
import './DraftsScreen.css';

// Day 45: /drafts -- your drafts and scheduled posts (like Facebook's), in
// two tabs. Only you ever see them; a scheduled post goes up by itself at
// its time, or comes back here with the reason if it couldn't.
const TABS = ['drafts', 'scheduled'];

function DraftsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('tab') === 'scheduled' ? 'scheduled' : 'drafts';
  const [drafts, setDrafts] = useState([]);
  const [state, setState] = useState('loading'); // loading | error | ready
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({}); // id -> message
  const [posted, setPosted] = useState(null); // the post just published
  const [confirmDelete, setConfirmDelete] = useState(null); // draft
  const [rescheduling, setRescheduling] = useState(null); // { id, value }
  const tabRefs = useRef({});

  const load = useCallback(() => {
    setState('loading');
    fetchDrafts(token)
      .then((list) => {
        setDrafts(list);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const select = (tab) => {
    setSearchParams(tab === 'scheduled' ? { tab } : {}, { replace: true });
    setRescheduling(null);
    tabRefs.current[tab]?.focus();
  };
  const handleTabKey = (e, index) => {
    const step = arrowStep(e.key);
    let next = null;
    if (step) next = (index + step + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(TABS[next]);
    }
  };

  const replace = (draft) => setDrafts((list) => list.map((d) => (d.id === draft.id ? draft : d)));
  const drop = (id) => setDrafts((list) => list.filter((d) => d.id !== id));
  const act = async (id, work, fallbackKey) => {
    if (busyId) return;
    setBusyId(id);
    setRowError((errors) => ({ ...errors, [id]: '' }));
    try {
      await work();
    } catch (err) {
      setRowError((errors) => ({ ...errors, [id]: serverErrorText(err, fallbackKey) }));
    } finally {
      setBusyId(null);
    }
  };

  const postNow = (draft) => act(draft.id, async () => {
    const post = await publishDraft(draft.id, token);
    drop(draft.id);
    setPosted(post);
  }, 'drafts.publishFailed');

  const remove = async () => {
    const draft = confirmDelete;
    await act(draft.id, async () => {
      await deleteDraft(draft.id, token);
      drop(draft.id);
    }, 'drafts.actionFailed');
    setConfirmDelete(null);
  };

  const saveSchedule = (draft) => {
    const when = fromLocalInputValue(rescheduling.value);
    const problem = scheduleProblem(when);
    if (problem) {
      setRowError((errors) => ({ ...errors, [draft.id]: t(problem, { min: MIN_SCHEDULE_MINUTES, max: MAX_SCHEDULE_DAYS }) }));
      return;
    }
    act(draft.id, async () => {
      replace(await scheduleDraft(draft.id, when.toISOString(), token));
      setRescheduling(null);
    }, 'drafts.actionFailed');
  };
  const unschedule = (draft) => act(draft.id, async () => {
    replace(await scheduleDraft(draft.id, null, token));
  }, 'drafts.actionFailed');

  const shown = drafts
    .filter((d) => (active === 'scheduled') === Boolean(d.scheduled_for))
    // Scheduled: soonest first; drafts: last edited first (the server's order).
    .sort((a, b) => (active === 'scheduled' ? new Date(a.scheduled_for) - new Date(b.scheduled_for) : 0));
  const counts = { drafts: drafts.filter((d) => !d.scheduled_for).length, scheduled: drafts.filter((d) => d.scheduled_for).length };

  const renderDraft = (draft) => {
    const busy = busyId === draft.id;
    const isRescheduling = rescheduling?.id === draft.id;
    const place = draft.community_name
      ? t('drafts.inGroup', { name: draft.community_name })
      : draft.page_name ? t('drafts.asPage', { name: draft.page_name }) : null;
    return (
      <li key={draft.id} className="draft-card">
        {draft.content.trim()
          ? <p className="draft-card-text" dir="auto">{draft.content}</p>
          : <p className="draft-card-text draft-card-text-empty">{t('drafts.noText')}</p>}
        <p className="draft-card-meta">
          {place && <span><bdi>{place}</bdi></span>}
          {draft.media.length > 0 && (
            <span><ImageIcon size={14} aria-hidden="true" /> {t('drafts.photos', { count: draft.media.length })}</span>
          )}
          {draft.poll && <span><ListChecks size={14} aria-hidden="true" /> {t('drafts.poll')}</span>}
          {draft.scheduled_for
            ? <span className="draft-card-when"><CalendarClock size={14} aria-hidden="true" /> {t('drafts.postsOn', { date: formatDate(draft.scheduled_for, 'longTime') })}</span>
            : <span>{t('drafts.edited', { date: formatDate(draft.updated_at, 'longTime') })}</span>}
        </p>
        {draft.last_error && (
          <p className="draft-card-failed" role="status">{t('drafts.failedReason', { reason: serverText(draft.last_error) })}</p>
        )}
        {isRescheduling && (
          <div className="draft-card-reschedule">
            <label className="form-field">
              <span className="form-label">{t('drafts.when')}</span>
              <input
                type="datetime-local"
                className="form-input"
                value={rescheduling.value}
                onChange={(e) => setRescheduling({ id: draft.id, value: e.target.value })}
                dir="ltr"
              />
            </label>
            <div className="draft-card-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveSchedule(draft)} disabled={busy}>{t('drafts.saveTime')}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRescheduling(null)} disabled={busy}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
        {rowError[draft.id] && <p className="form-error" role="alert">{rowError[draft.id]}</p>}
        {!isRescheduling && (
          <div className="draft-card-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => postNow(draft)} disabled={busy}>
              {busy ? t('compose.posting') : t('drafts.postNow')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/create-post?draftId=${draft.id}`)} disabled={busy}>
              {t('drafts.edit')}
            </button>
            {draft.scheduled_for ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRescheduling({ id: draft.id, value: toLocalInputValue(draft.scheduled_for) })}
                  disabled={busy}
                >
                  {t('drafts.reschedule')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => unschedule(draft)} disabled={busy}>
                  {t('drafts.unschedule')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setRescheduling({ id: draft.id, value: toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)) })}
                disabled={busy}
              >
                {t('drafts.scheduleIt')}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm draft-card-delete" onClick={() => setConfirmDelete(draft)} disabled={busy}>
              {t('drafts.delete')}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="screen-header-title">{t('drafts.title')}</h1>
        <IconButton icon={Plus} aria-label={t('drafts.new')} onClick={() => navigate('/create-post')} />
      </header>

      <div role="tablist" aria-label={t('drafts.tabs')} className="drafts-tablist">
        {TABS.map((tab, i) => {
          const selected = tab === active;
          return (
            <button
              key={tab}
              ref={(el) => { tabRefs.current[tab] = el; }}
              type="button"
              role="tab"
              id={`drafts-tab-${tab}`}
              aria-selected={selected}
              aria-controls="drafts-tabpanel"
              tabIndex={selected ? 0 : -1}
              className={clsx('drafts-tab', selected && 'is-active')}
              onClick={() => select(tab)}
              onKeyDown={(e) => handleTabKey(e, i)}
            >
              {tab === 'drafts' ? <FileText size={16} aria-hidden="true" /> : <CalendarClock size={16} aria-hidden="true" />}
              <span>{t(`drafts.tab.${tab}`)}</span>
              {state === 'ready' && <span className="drafts-tab-count">{counts[tab]}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="drafts-tabpanel" aria-labelledby={`drafts-tab-${active}`} className="screen-body drafts-panel">
        {posted && (
          <p className="drafts-posted" role="status">
            {t('drafts.posted')} <Link to={`/posts/${posted.id}`} className="screen-link">{t('drafts.viewPost')}</Link>
          </p>
        )}
        {state === 'loading' && (
          <ul className="drafts-list" aria-busy="true" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => <li key={i} className="draft-card draft-card-skeleton" />)}
          </ul>
        )}
        {state === 'error' && <FeedErrorState message={t('drafts.loadFailed')} onRetry={load} />}
        {state === 'ready' && shown.length === 0 && (
          <p className="screen-status" role="status">{t(active === 'scheduled' ? 'drafts.emptyScheduled' : 'drafts.emptyDrafts')}</p>
        )}
        {state === 'ready' && shown.length > 0 && <ul className="drafts-list">{shown.map(renderDraft)}</ul>}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title={t('drafts.deleteTitle')}
        description={t('drafts.deleteText')}
        confirmLabel={t('drafts.delete')}
        danger
      />
    </div>
  );
}

export default DraftsScreen;
