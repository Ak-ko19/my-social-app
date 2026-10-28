import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Hash } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchFollowedHashtags, unfollowHashtag } from '../services/hashtagService';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useTranslation } from 'react-i18next';
import './BlockedUsersScreen.css';
import './FollowedHashtagsScreen.css';
import '../components/feed/Feed.css';

// Days 107-108: Settings -> Hashtags you follow. Same layout as Muted
// accounts (its CSS); each tag opens its posts, and Unfollow takes its
// posts off Home.
function FollowedHashtagsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyTag, setBusyTag] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    fetchFollowedHashtags(token)
      .then((data) => setTags(data.hashtags))
      .catch((err) => {
        console.error(err);
        setError(t('followedTags.loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const handleUnfollow = (tag) => {
    setBusyTag(tag);
    setActionError('');
    unfollowHashtag(tag, token)
      .then(() => setTags((current) => current.filter((h) => h.tag !== tag)))
      .catch((err) => {
        console.error(err);
        setActionError(t('followedTags.unfollowFailed'));
      })
      .finally(() => setBusyTag(null));
  };

  return (
    <div className="screen-enter">
      <header className="blocked-users-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="blocked-users-header-title">{t('followedTags.title')}</h1>
      </header>

      {loading && <p className="blocked-users-status">{t('common.loading')}</p>}
      {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
      {actionError && <p className="blocked-users-status" role="alert">{actionError}</p>}
      {!loading && !error && (
        <p className="blocked-users-status">{tags.length === 0 ? t('followedTags.empty') : t('followedTags.explain')}</p>
      )}

      <ul className="blocked-users-list">
        {tags.map(({ tag }) => (
          <li key={tag} className="blocked-users-row">
            <span className="followed-tag-icon" aria-hidden="true"><Hash size={18} /></span>
            <Link to={`/hashtag/${encodeURIComponent(tag)}`} className="blocked-users-name followed-tag-link"><bdi>#{tag}</bdi></Link>
            <button
              type="button"
              className="blocked-users-unblock-btn"
              onClick={() => handleUnfollow(tag)}
              disabled={busyTag === tag}
              aria-label={t('followedTags.unfollowTag', { tag })}
            >
              {busyTag === tag ? t('followedTags.unfollowing') : t('followedTags.unfollow')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FollowedHashtagsScreen;
