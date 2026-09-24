import { useEffect, useState } from 'react';
import api from './api';
import { Link, useNavigate } from 'react-router-dom';
import Logo from './components/layout/Logo';
import { notifyAuthChange } from './hooks/useAuth';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

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
      setError('Email and password are required');
      return;
    }

    api.post('/login', {
      email: email.trim(),
      password: password
    })
    .then((response) => {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.id);
      localStorage.setItem('username', response.data.username);
      localStorage.setItem('emailVerified', String(Boolean(response.data.emailVerified)));
      notifyAuthChange();
      // A deactivated account reactivates on this exact login (see backend
      // authController.login) -- passed via router state (not a query
      // param) so it's a one-time signal, not something a refresh replays.
      navigate('/', response.data.reactivated ? { state: { reactivated: true } } : undefined);
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Login failed. Please check your email and password.');
    });
  };

  return (
    <div className="auth-screen screen-enter">
      <div className="auth-logo"><Logo /></div>
      <div className="auth-card">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Log in to continue.</p>
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">Email</span>
            <input className="form-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">Password</span>
            <input className="form-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <Link to="/forgot-password" className="screen-link auth-inline-link">Forgot password?</Link>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block">Log in</button>
        </form>
      </div>
      <p className="auth-footer">Don't have an account? <Link to="/signup" className="screen-link">Sign up</Link></p>
    </div>
  );
}

export default Login;