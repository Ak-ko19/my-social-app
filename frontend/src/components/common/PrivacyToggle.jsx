import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { Lock, LockOpen } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Same real-switch pattern as ThemeToggle (role="switch", sliding thumb
// driven by aria-checked) -- reuses its .theme-switch/.theme-switch-thumb
// CSS rather than a third near-identical switch style.
function PrivacyToggle() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [isPrivate, setIsPrivate] = useState(null); // null = not loaded yet
  const [pending, setPending] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // No token = logging out right now (Settings stays on screen for a
    // moment): asking would only earn a 401 (Day 16).
    if (!token) return undefined;
    let active = true;
    api
      .get('/profile/me', authHeaders(token))
      .then((res) => {
        if (active) setIsPrivate(Boolean(res.data.is_private));
      })
      .catch((err) => {
        if (active) console.error(err);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const toggle = () => {
    if (isPrivate === null || pending) return;
    const next = !isPrivate;
    setPending(true);
    setIsPrivate(next); // optimistic
    api
      .put('/profile/privacy', { isPrivate: next }, authHeaders(token))
      .catch((err) => {
        console.error(err);
        setIsPrivate(!next); // revert
      })
      .finally(() => setPending(false));
  };

  if (isPrivate === null) return <span className="theme-switch" aria-hidden="true" />;

  return (
    <m.button
      type="button"
      role="switch"
      aria-checked={isPrivate}
      onClick={toggle}
      disabled={pending}
      className="theme-switch"
      aria-label={isPrivate ? t('ui.makeAccountPublic') : t('ui.makeAccountPrivate')}
      title={isPrivate ? t('ui.accountIsPrivate') : t('ui.accountIsPublic')}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
    >
      <span className="theme-switch-thumb">
        {isPrivate ? <Lock size={12} aria-hidden="true" /> : <LockOpen size={12} aria-hidden="true" />}
      </span>
    </m.button>
  );
}

export default PrivacyToggle;
