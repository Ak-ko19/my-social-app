import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { currentSubscription, disablePush, enablePush, fetchPushKey, pushSupported } from '../../utils/push';

// Day 22: "Push notifications on this device" (Settings -> Notifications).
// Not shown at all when this browser can't do push or the server has no
// push keys. If the person blocked notifications for this site, it says
// so instead of offering a switch that can't work.
function PushSwitch() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [publicKey, setPublicKey] = useState(null);
  const [on, setOn] = useState(null); // null = still checking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(() => pushSupported() && Notification.permission === 'denied');

  useEffect(() => {
    if (!pushSupported()) return undefined;
    let active = true;
    (async () => {
      const key = await fetchPushKey();
      const sub = key ? await currentSubscription().catch(() => null) : null;
      if (!active) return;
      setPublicKey(key);
      setOn(Boolean(sub) && Notification.permission === 'granted');
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!pushSupported() || !publicKey) return null;

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (on) {
        await disablePush(token);
        setOn(false);
      } else {
        await enablePush(publicKey, token);
        setOn(true);
      }
    } catch (err) {
      if (err.code === 'denied') setBlocked(true);
      else if (err.code !== 'default') setError(t('notifSettings.push.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="notif-settings-row notif-settings-push">
      <span className="notif-settings-text">
        <span className="notif-settings-title" id="notif-push-label">{t('notifSettings.push.title')}</span>
        <span className="notif-settings-desc" id="notif-push-desc">
          {blocked ? t('notifSettings.push.blocked') : t('notifSettings.push.description')}
        </span>
        {error && <span className="form-error" role="alert">{error}</span>}
      </span>
      {!blocked && (
        <button
          type="button"
          role="switch"
          className="theme-switch"
          aria-checked={Boolean(on)}
          aria-labelledby="notif-push-label"
          aria-describedby="notif-push-desc"
          disabled={busy || on === null}
          onClick={toggle}
        >
          <span className="theme-switch-thumb" />
        </button>
      )}
    </div>
  );
}

export default PushSwitch;
