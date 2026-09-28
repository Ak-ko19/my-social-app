import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from './api';
import Logo from './components/layout/Logo';
import { useTranslation } from 'react-i18next';
import { serverErrorText, serverText } from './utils/serverError';
import { useEmailEnabled } from './hooks/useEmailEnabled';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { t } = useTranslation();
  const emailEnabled = useEmailEnabled();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }

    api.post('/forgot-password', { email: email.trim() })
    .then((response) => {
      setMessage(serverText(response.data));
    })
    .catch((err) => {
      console.error(err);
      setError(serverErrorText(err, 'common.somethingWentWrong'));
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.forgotTitle')}</h1>
        {emailEnabled === false ? (
          // No email provider on the server: the link could never arrive,
          // so say so instead of showing a form that silently does nothing.
          <p className="auth-subtitle" role="status">{t('auth.resetUnavailable')}</p>
        ) : (
          <>
            <p className="auth-subtitle">{t('auth.forgotSubtitle')}</p>
            <form className="form-stack" onSubmit={handleSubmit} noValidate>
              <label className="form-field">
                <span className="form-label">{t('auth.email')}</span>
                <input className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              {message && <p className="form-success" role="status">{message}</p>}
              <button type="submit" className="btn btn-primary btn-block">{t('auth.sendResetLink')}</button>
            </form>
          </>
        )}
      </div>
      <p className="auth-footer"><Link to="/login" className="screen-link">{t('auth.backToLogin')}</Link></p>
    </div>
  );
}

export default ForgotPassword;
