import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormGuard } from './hooks/useFormGuard';
import Logo from './components/layout/Logo';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
import { formatDate } from './i18n';
import { syncLanguageAtLogin } from './utils/languageChoice';
import { notifyAuthChange } from './hooks/useAuth';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Honeypot only: login has no minimum fill time (password managers).
  const { honeypot, guardedPost } = useFormGuard();

  // Already-logged-in users shouldn't land on the login form -- send them
  // straight to the real Home screen instead. A plain localStorage read
  // (not useAuth()) is enough here: this only needs to run once, on
  // mount, before the form ever renders.
  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/');
    }
  }, [navigate]);

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
    .then(async (response) => {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.id);
      localStorage.setItem('username', response.data.username);
      localStorage.setItem('emailVerified', String(Boolean(response.data.emailVerified)));
      notifyAuthChange();
      // Day 16: device vs account language (utils/languageChoice.js).
      await syncLanguageAtLogin(response.data.language, response.data.token);
      // A deactivated account reactivates on this exact login (see backend
      // authController.login) -- passed via router state (not a query
      // param) so it's a one-time signal, not something a refresh replays.
      navigate('/', response.data.reactivated ? { state: { reactivated: true } } : undefined);
    })
    .catch((err) => {
      console.error(err);
      // Day 12: a suspension says until when.
      const until = err.response?.data?.until;
      setError(until ? t('auth.suspendedUntil', { date: formatDate(until, 'longTime') }) : serverErrorText(err, 'auth.loginFailed'));
    });
  };

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