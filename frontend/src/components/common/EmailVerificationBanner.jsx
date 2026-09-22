import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { resendVerification } from '../../services/accountService';
import './EmailVerificationBanner.css';

// Shown on Home whenever the logged-in user's email isn't verified yet --
// "at minimum show a persistent banner" is the spec's own fallback for
// accounts created before this session ever confirmed the value, so
// emailVerified === null (never recorded) intentionally does NOT show this;
// only a confirmed `false` does.
function EmailVerificationBanner() {
  const { token, emailVerified } = useAuth();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (emailVerified !== false) return null;

  const handleResend = () => {
    setPending(true);
    setError('');
    resendVerification(token)
      .then(() => setSent(true))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data || 'Failed to resend email');
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="email-verify-banner" role="status">
      <span>
        {sent ? 'Verification email sent — check your inbox.' : "Please verify your email address."}
      </span>
      {!sent && (
        <button type="button" onClick={handleResend} disabled={pending}>
          {pending ? 'Sending…' : 'Resend email'}
        </button>
      )}
      {error && <span className="email-verify-banner-error">{error}</span>}
    </div>
  );
}

export default EmailVerificationBanner;
