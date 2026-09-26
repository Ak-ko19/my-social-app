import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import api from '../api';
import '../components/feed/Feed.css';
import './NotificationSettingsScreen.css';

// B11: which notifications you receive. Keys match the backend categories
// (services/notificationService.CATEGORIES). Turning one off only stops NEW
// notifications of that kind -- existing ones stay in your list.
const SETTINGS = [
  { key: 'likes', title: 'Likes and reactions', description: 'When someone reacts to your post or likes your comment' },
  { key: 'comments', title: 'Comments and replies', description: 'When someone comments on your post or replies to you' },
  { key: 'mentions', title: 'Mentions', description: 'When someone @mentions you in a post or comment' },
  { key: 'follows', title: 'New followers', description: 'New followers and follow requests' },
  { key: 'follow_accepted', title: 'Accepted requests', description: 'When someone accepts your follow request' }
];

const authHeaders = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function NotificationSettingsScreen() {
  const navigate = useNavigate();
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
        setLoadError('Could not load your notification settings');
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
        if (!cancelled) setLoadError('Could not load your notification settings');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
        setSaveError('Could not save that change. Please try again.');
      })
      .finally(() => setPendingKey(null));
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Settings" onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">Notification Settings</h1>
      </header>
      <div className="screen-body">
        <p className="notif-settings-intro">Choose what you get notified about. Turning something off won't remove notifications you already have.</p>
        {loadError && <FeedErrorState message={loadError} onRetry={load} />}
        {!prefs && !loadError && <p className="screen-status" role="status">Loading…</p>}
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        {prefs && (
          <ul className="notif-settings-list">
            {SETTINGS.map((s) => (
              <li key={s.key} className="notif-settings-row">
                <span className="notif-settings-text" id={`notif-${s.key}-label`}>
                  <span className="notif-settings-title">{s.title}</span>
                  <span className="notif-settings-desc" id={`notif-${s.key}-desc`}>{s.description}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="theme-switch"
                  aria-checked={Boolean(prefs[s.key])}
                  aria-labelledby={`notif-${s.key}-label`}
                  aria-describedby={`notif-${s.key}-desc`}
                  disabled={pendingKey === s.key}
                  onClick={() => toggle(s.key)}
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
