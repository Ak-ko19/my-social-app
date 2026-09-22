import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { verifyEmail } from '../services/accountService';
import { useAuth, setEmailVerified } from '../hooks/useAuth';
import './VerifyEmailScreen.css';

function VerifyEmailScreen() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { userId } = useAuth();
  const [status, setStatus] = useState('pending'); // 'pending' | 'success' | 'error'
  const [message, setMessage] = useState('');
  // Guards against React StrictMode's dev-only double-invocation of this
  // effect (mount -> cleanup -> remount) firing the verify request twice --
  // the token is single-use server-side, so a genuine second call would
  // always get "Link expired or invalid" and stomp the first call's real
  // success once it resolves. Ref (not state) so the guard itself doesn't
  // trigger a re-render/second effect run.
  const requestedTokenRef = useRef(null);

  useEffect(() => {
    if (requestedTokenRef.current === token) return;
    requestedTokenRef.current = token;

    verifyEmail(token)
      .then(() => {
        setStatus('success');
        // Only meaningful if the verifying browser is also the logged-in
        // owner of the account -- a link opened on a different device/
        // browser still verifies server-side, it just can't update this
        // tab's local session state.
        if (userId) setEmailVerified(true);
      })
      .catch((err) => {
        console.error(err);
        setStatus('error');
        setMessage(err.response?.data || 'Verification failed');
      });
  }, [token, userId]);

  return (
    <div className="screen-enter">
      <header className="verify-email-header">
        <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate('/')} />
        <h1 className="verify-email-header-title">Verify Email</h1>
      </header>

      <div className="verify-email-body">
        {status === 'pending' && <p>Verifying your email…</p>}
        {status === 'success' && (
          <>
            <p className="verify-email-success">Your email has been verified!</p>
            <button type="button" className="verify-email-btn" onClick={() => navigate('/')}>
              Go to Home
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="verify-email-error">{message}</p>
            <button type="button" className="verify-email-btn" onClick={() => navigate('/')}>
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailScreen;
