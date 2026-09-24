import { useState, useEffect } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';

function EditProfile() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
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

    api.get('/profile/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setUsername(response.data.username);
      setEmail(response.data.email);
      setBio(response.data.bio || '');
      setAvatarUrl(response.data.avatar_url || null);
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to load profile');
      setLoading(false);
    });
  }, [token, navigate]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0] || null;
    setAvatar(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('username', username);
    formData.append('email', email);
    formData.append('bio', bio);
    if (avatar) {
      formData.append('avatar', avatar);
    }

    api.put('/profile',
      formData,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then((response) => {
      setSuccess('Profile updated successfully!');
      setAvatarUrl(response.data.avatar_url || null);
      setAvatar(null);
      setAvatarPreview(null);
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
          {(avatarPreview || avatarUrl) ? (
            <img
              src={avatarPreview || resolveImageUrl(avatarUrl)}
              alt="Avatar"
              style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              backgroundColor: '#ddd', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#888', fontSize: '12px'
            }}>
              No Avatar
            </div>
          )}
          <label>Profile Picture: </label>
          <input type="file" accept="image/*" onChange={handleAvatarChange} />
        </div>
        <div style={{ marginTop: '10px' }}>
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
      <p><a href="/">Back to Feed</a></p>
    </div>
  );
}

export default EditProfile;
