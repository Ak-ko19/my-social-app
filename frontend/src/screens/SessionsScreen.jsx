import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Monitor, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Badge, ConfirmDialog } from '../components/ui';
import { useAuth, forceLogout } from '../hooks/useAuth';
import { fetchSessions, revokeSession, revokeOtherSessions } from '../services/sessionService';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { formatDate } from '../i18n';
import FeedErrorState from '../components/feed/FeedErrorState';
import './SessionsScreen.css';

// "last_seen_at" is refreshed at most every 5 minutes (backend
// touchSession), so anything within 10 minutes counts as active now.
const ACTIVE_NOW_MS = 10 * 60 * 1000;

// Day 8: where you're logged in -- each device signed in to this account,
// with a way to log any of them (or all the others) out.
function SessionsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [sessions, setSessions] = useState(null); // null while loading
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // No synchronous setState in the effect body (see useFeed): updates only
  // happen in the promise callbacks.
  const load = useCallback(() => {
    fetchSessions(token)
      .then((list) => {
        // The clock is read here, not during render (render must be pure).
        setLoadedAt(Date.now());
        setSessions(list);
      })
      .catch((err) => {
        console.error(err);
        setError(t('sessions.loadFailed'));
      });
  }, [token, t]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const retry = () => {
    setError('');
    setSessions(null);
    load();
  };

  const handleRevoke = (id) => {
    setRevokingId(id);
    setActionError('');
    setNotice('');
    revokeSession(id, token)
      .then(({ current }) => {
        if (current) forceLogout();
        else setSessions((list) => list.filter((s) => s.id !== id));
      })
      .catch((err) => {
        console.error(err);
        setActionError(t('sessions.actionFailed'));
      })
      .finally(() => setRevokingId(null));
  };

  const handleRevokeOthers = async () => {
    setActionError('');
    try {
      await revokeOtherSessions(token);
      setSessions((list) => list.filter((s) => s.current));
      setNotice(t('sessions.loggedOutOthers'));
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      setActionError(t('sessions.actionFailed'));
      setConfirmOpen(false);
    }
  };

  // Each name is bidi-isolated (FSI...PDI) so the SENTENCE follows the page
  // direction: isolating the whole label instead made Arabic read
  // "Windows on Edge" (its first strong letter is Latin, so it ran LTR).
  const isolate = (name) => `⁨${name}⁩`;
  const deviceName = (device) => {
    if (!device.browser && !device.os) return t('sessions.unknownDevice');
    if (!device.os) return isolate(device.browser);
    return t('sessions.device', {
      browser: device.browser ? isolate(device.browser) : t('sessions.unknownBrowser'),
      os: isolate(device.os)
    });
  };

  const others = sessions ? sessions.filter((s) => !s.current) : [];

  return (
    <div className="screen-enter">
      <header className="sessions-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="sessions-header-title">{t('sessions.title')}</h1>
      </header>
      <p className="sessions-intro">{t('sessions.intro')}</p>

      {!sessions && !error && (
        <ul className="sessions-list" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1].map((i) => (
            <li key={i} className="sessions-row sessions-skeleton" aria-hidden="true">
              <span className="sessions-icon sessions-skeleton-block" />
              <span className="sessions-text">
                <span className="sessions-skeleton-block sessions-skeleton-line" />
                <span className="sessions-skeleton-block sessions-skeleton-line sessions-skeleton-short" />
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <FeedErrorState message={error} onRetry={retry} />}
      {actionError && <p className="sessions-status sessions-status-error" role="alert">{actionError}</p>}
      {notice && <p className="sessions-status" role="status">{notice}</p>}

      {sessions && (
        <>
          <ul className="sessions-list">
            {sessions.map((s) => {
              const Icon = s.device.kind === 'mobile' ? Smartphone : Monitor;
              const lastSeen = new Date(s.last_seen_at).getTime();
              const activeNow = s.current || loadedAt - lastSeen < ACTIVE_NOW_MS;
              return (
                <li key={s.id} className="sessions-row">
                  <span className="sessions-icon" aria-hidden="true"><Icon size={20} /></span>
                  <span className="sessions-text">
                    <span className="sessions-device">
                      <span>{deviceName(s.device)}</span>
                      {s.current && <Badge className="sessions-current-badge">{t('sessions.thisDevice')}</Badge>}
                    </span>
                    <span className="sessions-meta">
                      {activeNow ? t('sessions.activeNow') : t('sessions.lastActive', { time: formatRelativeTime(s.last_seen_at) })}
                      {' · '}
                      <time dateTime={s.created_at}>{t('sessions.signedIn', { date: formatDate(s.created_at, 'long') })}</time>
                    </span>
                  </span>
                  {!s.current && (
                    <button
                      type="button"
                      className="sessions-logout-btn"
                      onClick={() => handleRevoke(s.id)}
                      disabled={revokingId === s.id}
                      aria-label={`${t('sessions.logOut')}: ${deviceName(s.device)}`}
                    >
                      {revokingId === s.id ? t('sessions.loggingOut') : t('sessions.logOut')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length === 0 ? (
            !notice && <p className="sessions-status">{t('sessions.onlyThisDevice')}</p>
          ) : (
            <div className="sessions-footer">
              <button type="button" className="sessions-logout-all-btn" onClick={() => setConfirmOpen(true)}>
                {t('sessions.logOutOthers')}
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRevokeOthers}
        title={t('sessions.confirmTitle')}
        description={t('sessions.confirmBody')}
        confirmLabel={t('sessions.confirm')}
        danger
      />
    </div>
  );
}

export default SessionsScreen;
