import { useState } from 'react';
import api from './api';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Logo from './components/layout/Logo';

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { token } = useParams();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('New password is required');
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError('Password must be between 8 and 72 characters long');
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
      setError(err.response?.data || 'Failed to reset password. Please try again.');
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-subtitle">Choose a new password (8–72 characters).</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">New password</span>
            <input className="form-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">Password reset successfully! Redirecting to login...</p>}
          <button type="submit" className="btn btn-primary btn-block">Reset password</button>
        </form>
      </div>
      <p className="auth-footer"><Link to="/login" className="screen-link">Back to login</Link></p>
    </div>
  );
}

export default ResetPassword;
