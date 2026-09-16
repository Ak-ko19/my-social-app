import { useState } from 'react';
import api from './api';

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
    <div style={{ padding: '20px' }}>
      <h2>Forgot Password</h2>
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
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        <button type="submit" style={{ marginTop: '10px' }}>Send Reset Link</button>
      </form>
      <p><a href="/login">Back to Login</a></p>
    </div>
  );
}

export default ForgotPassword;
