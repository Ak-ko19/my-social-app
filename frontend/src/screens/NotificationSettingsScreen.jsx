import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import PushSwitch from '../components/common/PushSwitch';
import { useTranslation } from 'react-i18next';
import api from '../api';
import '../components/feed/Feed.css';
import './NotificationSettingsScreen.css';

// B11: which notifications you receive. Keys match the backend categories
// (services/notificationService.CATEGORIES). Turning one off only stops NEW
// notifications of that kind -- existing ones stay in your list.
// Titles/descriptions: notifSettings.items.<key>.
const SETTINGS = ['likes', 'comments', 'mentions', 'follows', 'follow_accepted', 'messages', 'groups', 'pages', 'events'];

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function NotificationSettingsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [pendingKey, setPendingKey] = useState(null);

  const load = () => {
    setLoadError('');
    api
      .get('/notification-preferences', authHeaders(token))
      .then((res) => setPrefs(res.data))
      .catch((err) => {
        console.error(err);
        setLoadError(t('notifSettings.loadFailed'));
      });
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get('/notification-preferences', authHeaders(token))
      .then((res) => {
        if (!cancelled) setPrefs(res.data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoadError(t('notifSettings.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const toggle = (key) => {
    if (!prefs || pendingKey) return;
    const next = !prefs[key];
    setSaveError('');
    setPendingKey(key);
    setPrefs((p) => ({ ...p, [key]: next })); // optimistic
    api
      .put('/notification-preferences', { [key]: next }, authHeaders(token))
      .then((res) => setPrefs(res.data))
      .catch((err) => {
        console.error(err);
        setPrefs((p) => ({ ...p, [key]: !next })); // revert
        setSaveError(t('notifSettings.saveFailed'));
      })
      .finally(() => setPendingKey(null));
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('notifSettings.title')}</h1>
      </header>
      <div className="screen-body">
        <p className="notif-settings-intro">{t('notifSettings.intro')}</p>
        {/* Day 22: this device's push switch (hidden where push can't work). */}
        <PushSwitch />
        {loadError && <FeedErrorState message={loadError} onRetry={load} />}
        {!prefs && !loadError && <p className="screen-status" role="status">{t('common.loading')}</p>}
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        {prefs && (
          <ul className="notif-settings-list">
            {SETTINGS.map((key) => (
              <li key={key} className="notif-settings-row">
                <span className="notif-settings-text" id={`notif-${key}-label`}>
                  <span className="notif-settings-title">{t(`notifSettings.items.${key}.title`)}</span>
                  <span className="notif-settings-desc" id={`notif-${key}-desc`}>{t(`notifSettings.items.${key}.description`)}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="theme-switch"
                  aria-checked={Boolean(prefs[key])}
                  aria-labelledby={`notif-${key}-label`}
                  aria-describedby={`notif-${key}-desc`}
                  disabled={pendingKey === key}
                  onClick={() => toggle(key)}
                >
                  <span className="theme-switch-thumb" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default NotificationSettingsScreen;
