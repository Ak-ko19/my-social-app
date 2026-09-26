import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import MemberPicker from '../components/messages/MemberPicker';
import { createGroup } from '../services/messageService';
import '../components/messages/Messages.css';

// B10: /messages/new-group -- name the group, pick people you follow.
function CreateGroupScreen() {
  const navigate = useNavigate();
  const { token, userId } = useAuth();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canCreate = name.trim() && selected.length > 0 && !submitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setError('');
    setSubmitting(true);
    createGroup(name.trim(), selected, token)
      .then((group) => navigate(`/messages/${group.id}`, { replace: true }))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data || 'Could not create the group. Please try again.');
        setSubmitting(false);
      });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Messages" onClick={() => navigate('/messages')} />
        <h1 className="screen-header-title">New group</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Group name</span>
          <input
            className="form-input"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekend plans"
            required
          />
        </label>
        <div className="form-field">
          <span className="form-label">Add people{selected.length > 0 && ` · ${selected.length} selected`}</span>
          <MemberPicker userId={userId} token={token} selectedIds={selected} onChange={setSelected} />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!canCreate}>
          {submitting ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  );
}

export default CreateGroupScreen;
