import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useFeed } from './hooks/useFeed';
import { useUnreadCount } from './hooks/useUnreadCount';
import { FeedActionsProvider } from './context/FeedActionsProvider';
import FeedList from './components/feed/FeedList';
import FeedSkeleton from './components/feed/FeedSkeleton';
import FeedEmptyState from './components/feed/FeedEmptyState';
import FeedErrorState from './components/feed/FeedErrorState';
import './components/feed/Feed.css';

function Feed() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { posts, loading, error, reload, removePost } = useFeed(token);
  const { unreadCount } = useUnreadCount(token);

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  if (!token) {
    return null;
  }

  return (
    <FeedActionsProvider value={{ refreshFeed: reload, removePost }}>
      <div style={{ padding: '20px' }}>
        <h2>My Feed</h2>
        <p>
          <a href="/create-post">+ Create New Post</a>
          {' | '}
          <a href="/edit-profile">Edit Profile</a>
          {' | '}
          <a href="/notifications">Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}</a>
          {' | '}
          <a href="/messages">Messages</a>
          {' | '}
          <a href="/search">Search</a>
        </p>

        {loading && <FeedSkeleton />}
        {!loading && error && <FeedErrorState message={error} onRetry={reload} />}
        {!loading && !error && posts.length === 0 && <FeedEmptyState />}
        {!loading && !error && posts.length > 0 && <FeedList posts={posts} />}
      </div>
    </FeedActionsProvider>
  );
}

export default Feed;
