import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/feed/PostCard';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { fetchPost } from '../services/postService';
import '../components/feed/Feed.css';
import './PostDetailScreen.css';

// The direct-link target for Share (PostCard's Share button) and for
// #hashtag / @mention links elsewhere -- optionalAuth on the backend
// (GET /posts/:id) means this loads for a logged-out visitor too, not just
// someone already using the app.
function PostDetailScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useAuth();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  // Compared against `id` below (not a separate boolean) so switching to a
  // different post id re-enters the loading state without any synchronous
  // setState in the effect body -- same "no direct setState in an effect"
  // reasoning as useFeed's fetchInitial.
  const [loadedId, setLoadedId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  // Bumped by the retry button to re-run the fetch effect below.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    fetchPost(id, token)
      .then((data) => {
        setPost(data);
        setError('');
        setNotFound(false);
        setLoadedId(id);
      })
      .catch((err) => {
        console.error(err);
        const isNotFound = err.response?.status === 404;
        setNotFound(isNotFound);
        setError(isNotFound ? t('postDetail.notFound') : t('postDetail.loadFailed'));
        setLoadedId(id);
      });
  }, [id, token, attempt, t]);

  const loading = loadedId !== id;

  const retry = () => {
    setLoadedId(null);
    setError('');
    setAttempt((n) => n + 1);
  };

  return (
    <div className="screen-enter">
      <header className="post-detail-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="post-detail-header-title">{t('postDetail.title')}</h1>
      </header>

      {loading && <p className="post-detail-status">{t('common.loading')}</p>}
      {!loading && error && notFound && <p className="post-detail-status">{error}</p>}
      {!loading && error && !notFound && <FeedErrorState message={error} onRetry={retry} />}
      {!loading && !error && post && <PostCard post={post} standalone groupLocked={post.group_locked} />}
    </div>
  );
}

export default PostDetailScreen;
