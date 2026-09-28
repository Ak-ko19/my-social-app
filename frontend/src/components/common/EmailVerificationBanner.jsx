import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useEmailEnabled } from '../../hooks/useEmailEnabled';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../utils/serverError';
import { resendVerification } from '../../services/accountService';
import './EmailVerificationBanner.css';

// Shown on Home whenever the logged-in user's email isn't verified yet --
// "at minimum show a persistent banner" is the spec's own fallback for
// accounts created before this session ever confirmed the value, so
// emailVerified === null (never recorded) intentionally does NOT show this;
// only a confirmed `false` does.
//
// Hidden when the server can't send emails (production without an email
// provider): there'd be no way to verify, so don't ask. Verification isn't
// required for anything, so nobody is locked out either way.
function EmailVerificationBanner() {
  const { token, emailVerified } = useAuth();
  const emailEnabled = useEmailEnabled();
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (emailVerified !== false || emailEnabled !== true) return null;

  const handleResend = () => {
    setPending(true);
    setError('');
    resendVerification(token)
      .then(() => setSent(true))
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'verify.resendFailed'));
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="email-verify-banner" role="status">
      <span>
        {sent ? t('verify.bannerSent') : t('verify.bannerPrompt')}
      </span>
      {!sent && (
        <button type="button" onClick={handleResend} disabled={pending}>
          {pending ? t('verify.sending') : t('verify.resend')}
        </button>
      )}
      {error && <span className="email-verify-banner-error">{error}</span>}
    </div>
  );
}

export default EmailVerificationBanner;
