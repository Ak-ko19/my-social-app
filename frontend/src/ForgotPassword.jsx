import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from './api';
import Logo from './components/layout/Logo';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    api.post('/forgot-password', { email: email.trim() })
    .then((response) => {
      setMessage(response.data);
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Something went wrong. Please try again.');
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">Forgot password</h1>
        <p className="auth-subtitle">We'll email you a link to reset it.</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">Email</span>
            <input className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button type="submit" className="btn btn-primary btn-block">Send reset link</button>
        </form>
      </div>
      <p className="auth-footer"><Link to="/login" className="screen-link">Back to login</Link></p>
    </div>
  );
}

export default ForgotPassword;
