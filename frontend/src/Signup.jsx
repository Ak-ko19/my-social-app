import { useState } from 'react';
import api from './api';
import { Link, useNavigate } from 'react-router-dom';
import Logo from './components/layout/Logo';

function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !email.trim() || !password) {
      setError('Username, email, and password are all required');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError('Password must be between 8 and 72 characters long');
      return;
    }

    api.post('/signup', {
      username: username.trim(),
      email: email.trim(),
      password: password
    })
    .then(() => {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Signup failed. Email or username may already be taken.');
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">It only takes a minute.</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">Username</span>
            <input className="form-input" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">Email</span>
            <input className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">Password</span>
            <input className="form-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && (
            <p className="form-success" role="status">
              Signup successful! Check your email to verify your account. Redirecting to login...
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block">Sign up</button>
        </form>
      </div>
      <p className="auth-footer">Already have an account? <Link to="/login" className="screen-link">Log in</Link></p>
    </div>
  );
}

export default Signup;