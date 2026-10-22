import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useFormGuard } from './hooks/useFormGuard';
import Logo from './components/layout/Logo';
import { useTranslation } from 'react-i18next';
import api from './api';
import { serverErrorText } from './utils/serverError';
import { formatDate } from './i18n';
import { syncLanguageAtLogin } from './utils/languageChoice';
import { notifyAuthChange } from './hooks/useAuth';
import { safeReturnPath } from './utils/returnPath';

// Day 77: the server's answer when the code step took too long (or the
// password / 2FA changed meanwhile): start again from the password.
const LOGIN_EXPIRED = 'Your login has expired. Please log in again.';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Day 77: two-factor authentication -- after a right password, the
  // challenge for the code step (null: the password step).
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const codeRef = useRef(null);
  const navigate = useNavigate();
  // Day 30: the page RequireAuth sent us from, to return to after login.
  const returnTo = safeReturnPath(useLocation().state?.from);
  const { t } = useTranslation();
  // Honeypot only: login has no minimum fill time (password managers).
  const { honeypot, guardedPost } = useFormGuard();

  // Already-logged-in users shouldn't land on the login form -- send them
  // straight to the real Home screen instead. A plain localStorage read
  // (not useAuth()) is enough here: this only needs to run once, on
  // mount, before the form ever renders.
  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo]);

  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge, useRecovery]);

  const showError = (err) => {
    console.error(err);
    // Day 12: a suspension says until when.
    const until = err.response?.data?.until;
    setError(until ? t('auth.suspendedUntil', { date: formatDate(until, 'longTime') }) : serverErrorText(err, 'auth.loginFailed'));
  };

  // A session: the same for a password-only login and one finished with a code.
  const finishLogin = async (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.id);
    localStorage.setItem('username', data.username);
    localStorage.setItem('emailVerified', String(Boolean(data.emailVerified)));
    notifyAuthChange();
    // Day 16: device vs account language (utils/languageChoice.js).
    await syncLanguageAtLogin(data.language, data.token);
    // A deactivated account reactivates on this exact login (see backend
    // authController.login) -- passed via router state (not a query
    // param) so it's a one-time signal, not something a refresh replays.
    // A reactivation goes Home, where its banner is shown.
    if (data.reactivated) navigate('/', { state: { reactivated: true } });
    // Day 77: a recovery code was used -- the phone may be lost, so show
    // what's left and how to set the app up again.
    else if (data.recoveryCodesLeft !== undefined) navigate('/settings/two-factor', { state: { recoveryCodeLogin: data.recoveryCodesLeft } });
    else navigate(returnTo, { replace: true });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError(t('auth.emailPasswordRequired'));
      return;
    }

    setBusy(true);
    guardedPost('/login', {
      email: email.trim(),
      password: password
    })
    .finally(() => setBusy(false))
    .then((response) => {
      if (response.data.twoFactorRequired) {
        setChallenge(response.data.challengeToken);
        setCode('');
        setUseRecovery(false);
        return undefined;
      }
      return finishLogin(response.data);
    })
    .catch(showError);
  };

  const handleCode = (e) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) {
      setError(t(useRecovery ? 'auth.recoveryCodeRequired' : 'auth.codeRequired'));
      return;
    }
    setBusy(true);
    api.post('/login/2fa', { challengeToken: challenge, ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() }) })
      .finally(() => setBusy(false))
      .then((response) => finishLogin(response.data))
      .catch((err) => {
        if (err.response?.data === LOGIN_EXPIRED) {
          setChallenge(null);
          setPassword('');
        }
        showError(err);
      });
  };

  const backToPassword = () => {
    setChallenge(null);
    setCode('');
    setError('');
  };

  const switchCodeKind = () => {
    setUseRecovery((v) => !v);
    setCode('');
    setError('');
  };

  if (challenge) {
    const label = useRecovery ? t('auth.recoveryCodeLabel') : t('auth.codeLabel');
    return (
      <div className="auth-screen screen-enter">
        <div className="auth-logo"><Logo /></div>
        <div className="auth-card">
          <h1 className="auth-title">{t('auth.twoFactorTitle')}</h1>
          <p className="auth-subtitle">{useRecovery ? t('auth.recoverySubtitle') : t('auth.twoFactorSubtitle')}</p>
          <form className="form-stack" onSubmit={handleCode} noValidate>
            <label className="form-field">
              <span className="form-label">{label}</span>
              <input
                ref={codeRef}
                className="form-input auth-code-input"
                type="text"
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoCapitalize="off"
                spellCheck="false"
                dir="ltr"
                maxLength={useRecovery ? 20 : 7}
                value={code}
                onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/[^\d ]/g, ''))}
                required
              />
            </label>
            <button type="button" className="screen-link auth-inline-link auth-link-btn" onClick={switchCodeKind}>
              {useRecovery ? t('auth.useAppCode') : t('auth.useRecoveryCode')}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{t('auth.verify')}</button>
          </form>
        </div>
        <p className="auth-footer">
          <button type="button" className="screen-link auth-link-btn" onClick={backToPassword}>{t('auth.backToLogin')}</button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.welcomeBack')}</h1>
        <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">{t('auth.email')}</span>
            <input className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">{t('auth.password')}</span>
            <input className="form-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <Link to="/forgot-password" className="screen-link auth-inline-link">{t('auth.forgotPasswordLink')}</Link>
          {honeypot}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{t('auth.logIn')}</button>
        </form>
      </div>
      <p className="auth-footer">{t('auth.noAccount')} <Link to="/signup" className="screen-link">{t('auth.signUp')}</Link></p>
    </div>
  );
}

export default Login;
