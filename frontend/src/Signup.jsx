import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormGuard } from './hooks/useFormGuard';
import Logo from './components/layout/Logo';
import { Trans, useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';

function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { honeypot, guardedPost } = useFormGuard(3000);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !email.trim() || !password) {
      setError(t('auth.allFieldsRequired'));
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError(t('auth.passwordLength'));
      return;
    }

    setBusy(true);
    guardedPost('/signup', {
      username: username.trim(),
      email: email.trim(),
      password: password
    })
    .finally(() => setBusy(false))
    .then(() => {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    })
    .catch((err) => {
      console.error(err);
      setError(serverErrorText(err, 'auth.signupFailed'));
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.createAccount')}</h1>
        <p className="auth-subtitle">{t('auth.signupSubtitle')}</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">{t('auth.username')}</span>
            <input className="form-input" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">{t('auth.email')}</span>
            <input className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">{t('auth.password')}</span>
            <input className="form-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {honeypot}
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && (
            <p className="form-success" role="status">
              {t('auth.signupSuccess')}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || success}>{t('auth.signUp')}</button>
        </form>
      </div>
      <p className="auth-legal">
        <Trans i18nKey="legal.agree" components={{ terms: <Link to="/terms" className="screen-link" />, privacy: <Link to="/privacy" className="screen-link" /> }} />
      </p>
      <p className="auth-footer">{t('auth.haveAccount')} <Link to="/login" className="screen-link">{t('auth.logIn')}</Link></p>
    </div>
  );
}

export default Signup;