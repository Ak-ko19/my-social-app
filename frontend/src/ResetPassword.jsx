import { useState } from 'react';
import api from './api';
import { useParams, useNavigate } from 'react-router-dom';

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
    <div style={{ padding: '20px' }}>
      <h2>Reset Password</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>New Password: </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>Password reset successfully! Redirecting to login...</p>}
        <button type="submit" style={{ marginTop: '10px' }}>Reset Password</button>
      </form>
      <p><a href="/login">Back to Login</a></p>
    </div>
  );
}

export default ResetPassword;
