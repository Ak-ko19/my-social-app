import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import PostCard from '../components/feed/PostCard';
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
  const { id } = useParams();
  const { token } = useAuth();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  // Compared against `id` below (not a separate boolean) so switching to a
  // different post id re-enters the loading state without any synchronous
  // setState in the effect body -- same "no direct setState in an effect"
  // reasoning as useFeed's fetchInitial.
  const [loadedId, setLoadedId] = useState(null);

  useEffect(() => {
    fetchPost(id, token)
      .then((data) => {
        setPost(data);
        setError('');
        setLoadedId(id);
      })
      .catch((err) => {
        console.error(err);
        setError(err.response?.status === 404 ? 'Post not found' : 'Failed to load post');
        setLoadedId(id);
      });
  }, [id, token]);

  const loading = loadedId !== id;

  return (
    <div className="screen-enter">
      <header className="post-detail-header">
        <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate(-1)} />
        <h1 className="post-detail-header-title">Post</h1>
      </header>

      {loading && <p className="post-detail-status">Loading…</p>}
      {!loading && error && <p className="post-detail-status">{error}</p>}
      {!loading && !error && post && <PostCard post={post} />}
    </div>
  );
}

export default PostDetailScreen;
