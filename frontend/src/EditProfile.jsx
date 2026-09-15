import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function EditProfile() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    axios.get('http://localhost:3000/profile/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setUsername(response.data.username);
      setEmail(response.data.email);
      setBio(response.data.bio || '');
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to load profile');
      setLoading(false);
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    axios.put('http://localhost:3000/profile',
      { username, email, bio },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      setSuccess('Profile updated successfully!');
    })
    .catch((err) => {
      console.error(err);
      setError(err.response?.data || 'Failed to update profile. Please try again.');
    });
  };

  if (loading) return <p>Loading profile...</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Edit Profile</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Username: </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>Email: </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>Bio: </label>
          <br />
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people about yourself..."
            rows="4"
            style={{ width: '100%', maxWidth: '400px' }}
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
        <button type="submit" style={{ marginTop: '10px' }}>Save Changes</button>
      </form>
      <p><a href="/feed">Back to Feed</a></p>
    </div>
  );
}

export default EditProfile;
