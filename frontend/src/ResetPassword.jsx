import { useState } from 'react';
import api from './api';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Logo from './components/layout/Logo';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError(t('auth.newPasswordRequired'));
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError(t('auth.passwordLength'));
      return;
    }

    api.post(`/reset-password/${token}`, { password })
    .then(() => {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    })
    .catch((err) => {
      console.error(err);
      setError(serverErrorText(err, 'auth.resetFailed'));
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">{t('auth.resetTitle')}</h1>
        <p className="auth-subtitle">{t('auth.resetSubtitle')}</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">{t('auth.newPassword')}</span>
            <input className="form-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{t('auth.resetSuccess')}</p>}
          <button type="submit" className="btn btn-primary btn-block">{t('auth.resetButton')}</button>
        </form>
      </div>
      <p className="auth-footer"><Link to="/login" className="screen-link">{t('auth.backToLogin')}</Link></p>
    </div>
  );
}

export default ResetPassword;
