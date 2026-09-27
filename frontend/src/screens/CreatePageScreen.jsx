import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { createPage, PAGE_CATEGORIES } from '../services/pageService';
import './GroupsScreen.css';

// B14: /pages/new
function CreatePageScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('business');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    createPage({ name: name.trim(), category, description }, token)
      .then((p) => navigate(`/pages/${p.id}`, { replace: true }))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data || 'Could not create the page. Please try again.');
        setSubmitting(false);
      });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Pages" onClick={() => navigate('/pages')} />
        <h1 className="screen-header-title">Create page</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">Page name</span>
          <input className="form-input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mingalar Tea House" required />
        </label>
        <label className="form-field">
          <span className="form-label">Category</span>
          <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PAGE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">About (optional)</span>
          <textarea className="form-input" rows="3" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this page about?" />
        </label>
        <p className="group-privacy-hint">Pages are public. Anyone can follow them, and you post as the page, not as yourself.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || submitting}>
          {submitting ? 'Creating…' : 'Create page'}
        </button>
      </form>
    </div>
  );
}

export default CreatePageScreen;
