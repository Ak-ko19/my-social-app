import { useState } from 'react';
import api from './api';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

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
      navigate('/feed');
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Login failed. Please check your email and password.');
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email: </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>Password: </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" style={{ marginTop: '10px' }}>Login</button>
      </form>
      <p><a href="/forgot-password">Forgot password?</a></p>
      <p>Don't have an account? <a href="/signup">Sign up</a></p>
    </div>
  );
}

export default Login;