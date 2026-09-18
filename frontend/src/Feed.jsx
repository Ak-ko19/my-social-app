import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from './hooks/useAuth';
import { useFeed } from './hooks/useFeed';
import { useUnreadCount } from './hooks/useUnreadCount';
import { FeedActionsProvider } from './context/FeedActionsProvider';
import FeedList from './components/feed/FeedList';
import FeedSkeleton from './components/feed/FeedSkeleton';
import FeedEmptyState from './components/feed/FeedEmptyState';
import FeedErrorState from './components/feed/FeedErrorState';
import { DURATION_NORMAL, EASE_STANDARD } from './utils/motionTokens';
import './components/feed/Feed.css';

function Feed() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { posts, loading, loadingMore, error, hasMore, reload, loadMore, removePost } = useFeed(token);
  const { unreadCount } = useUnreadCount(token);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  if (!token) {
    return null;
  }

  // One of four mutually-exclusive states. Used only to key a single
  // one-time crossfade below -- `loadMore` appending posts never changes
  // this value (it stays 'list'), so it does not fire on every scroll or
  // page load, only on genuine loading -> content/error/empty transitions.
  const feedState = loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  return (
    <FeedActionsProvider value={{ removePost }}>
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

        <AnimatePresence initial={false}>
          <motion.div
            key={feedState}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
          >
            {feedState === 'loading' && <FeedSkeleton />}
            {feedState === 'error' && <FeedErrorState message={error} onRetry={reload} />}
            {feedState === 'empty' && <FeedEmptyState />}
            {feedState === 'list' && (
              <FeedList posts={posts} hasMore={hasMore} isLoadingMore={loadingMore} onLoadMore={loadMore} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </FeedActionsProvider>
  );
}

export default Feed;
