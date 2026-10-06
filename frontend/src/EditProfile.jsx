import { useState, useEffect } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';
import { setEmailVerified } from './hooks/useAuth';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from './components/ui';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';

// Day 36: same limit as the server (backend/utils/profileLinks.js).
const MAX_LINKS = 3;

function EditProfile() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  // Day 36: up to MAX_LINKS links, edited as text fields.
  const [links, setLinks] = useState(['']);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

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
      setLinks(response.data.links?.length ? response.data.links : ['']);
      setAvatarUrl(response.data.avatar_url || null);
      // Changing the email resets verification server-side -- sync it so
      // the verify-email banner reappears without a reload.
      setEmailVerified(Boolean(response.data.email_verified));
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setError(t('editProfile.loadFailed'));
      setLoading(false);
    });
  }, [token, navigate, t]);

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
    formData.append('links', JSON.stringify(links.map((l) => l.trim()).filter(Boolean)));
    if (avatar) {
      formData.append('avatar', avatar);
    }

    api.put('/profile',
      formData,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then((response) => {
      setSuccess(t('editProfile.updated'));
      setAvatarUrl(response.data.avatar_url || null);
      setAvatar(null);
      setAvatarPreview(null);
    })
    .catch((err) => {
      console.error(err);
      setError(serverErrorText(err, 'editProfile.updateFailed'));
    });
  };

  if (loading) return <p className="screen-status" role="status">{t('editProfile.loading')}</p>;

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('editProfile.title')}</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={handleSubmit}>
        <div className="edit-profile-avatar">
          <Avatar
            size={96}
            src={avatarPreview || resolveImageUrl(avatarUrl)}
            initials={(username || '?').slice(0, 2).toUpperCase()}
            alt={t('editProfile.avatarAlt')}
          />
          <label className="form-field">
            <span className="form-label">{t('editProfile.picture')}</span>
            <input className="form-file" type="file" accept="image/*" onChange={handleAvatarChange} />
          </label>
        </div>
        <label className="form-field">
          <span className="form-label">{t('auth.username')}</span>
          <input className="form-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="form-field">
          <span className="form-label">{t('auth.email')}</span>
          <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="form-field">
          <span className="form-label">{t('editProfile.bio')}</span>
          <textarea
            className="form-input"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t('editProfile.bioPlaceholder')}
            rows="4"
          />
        </label>
        <fieldset className="form-field edit-profile-links">
          <legend className="form-label">{t('editProfile.links')}</legend>
          {links.map((link, i) => (
            <div className="edit-profile-link-row" key={i}>
              <input
                className="form-input"
                type="text"
                inputMode="url"
                autoComplete="url"
                dir="ltr"
                maxLength={200}
                value={link}
                onChange={(e) => setLinks((current) => current.map((l, j) => (j === i ? e.target.value : l)))}
                placeholder={t('editProfile.linkPlaceholder')}
                aria-label={t('editProfile.linkN', { n: i + 1 })}
              />
              {(links.length > 1 || link) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setLinks((current) => (current.length > 1 ? current.filter((_, j) => j !== i) : ['']))}
                  aria-label={t('editProfile.removeLinkN', { n: i + 1 })}
                >
                  {t('editProfile.removeLink')}
                </button>
              )}
            </div>
          ))}
          {links.length < MAX_LINKS && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLinks((current) => [...current, ''])}>
              {t('editProfile.addLink')}
            </button>
          )}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-success" role="status">{success}</p>}
        <button type="submit" className="btn btn-primary btn-block">{t('common.saveChanges')}</button>
      </form>
    </div>
  );
}

export default EditProfile;
