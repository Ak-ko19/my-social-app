import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { followUser, unfollowUser } from '../../services/postService';
import { serverErrorText } from '../../utils/serverError';
import { followLabelKey } from '../../utils/followLabel';

// Day 37: Follow / Follow back / Requested / Following for one person in a
// list (labels: utils/followLabel.js). Pressing Following or Requested
// unfollows / cancels the request.
function FollowButton({ userId, name, initialState = 'none', followsYou = false, token, className = '' }) {
  const { t } = useTranslation();
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const press = () => {
    setBusy(true);
    setError('');
    const request = state === 'none' ? followUser(userId, token) : unfollowUser(userId, token);
    request
      .then((res) => setState(state === 'none' ? (res.data.status === 'pending' ? 'pending' : 'following') : 'none'))
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'common.somethingWentWrong'));
      })
      .finally(() => setBusy(false));
  };

  const label = t(followLabelKey(state, followsYou));
  return (
    <span className="follow-button-wrap">
      <button
        type="button"
        className={`btn btn-sm ${state === 'none' ? 'btn-primary' : 'btn-secondary'} ${className}`.trim()}
        onClick={press}
        disabled={busy}
        aria-label={t('follow.buttonFor', { action: label, name })}
      >
        {label}
      </button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </span>
  );
}

export default FollowButton;
