import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Globe, Lock } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { createCommunity } from '../services/communityService';
import './GroupsScreen.css';

// B13: /groups/new
function CreateCommunityScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    createCommunity({ name: name.trim(), description, privacy }, token)
      .then((g) => navigate(`/groups/${g.id}`, { replace: true }))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data || 'Could not create the group. Please try again.');
        setSubmitting(false);
      });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Groups" onClick={() => navigate('/groups')} />
        <h1 className="screen-header-title">Create group</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">Name</span>
          <input className="form-input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yangon Hikers" required />
        </label>
        <label className="form-field">
          <span className="form-label">Description (optional)</span>
          <textarea className="form-input" rows="3" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group about?" />
        </label>
        <fieldset className="audience-picker">
          <legend className="form-label">Privacy</legend>
          <label className={privacy === 'public' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="privacy" value="public" checked={privacy === 'public'} onChange={() => setPrivacy('public')} />
            <Globe size={15} aria-hidden="true" /> Public
          </label>
          <label className={privacy === 'private' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="privacy" value="private" checked={privacy === 'private'} onChange={() => setPrivacy('private')} />
            <Lock size={15} aria-hidden="true" /> Private
          </label>
        </fieldset>
        <p className="group-privacy-hint">
          {privacy === 'public'
            ? 'Anyone can see posts and join instantly.'
            : 'Anyone can find the group, but only members see posts. You approve who joins.'}
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || submitting}>
          {submitting ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  );
}

export default CreateCommunityScreen;
