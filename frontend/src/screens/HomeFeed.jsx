import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFeed } from '../hooks/useFeed';
import TopAppBar from '../components/layout/TopAppBar';
import PostComposer from '../components/feed/PostComposer';
import FeedList from '../components/feed/FeedList';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedEmptyState from '../components/feed/FeedEmptyState';
import FeedErrorState from '../components/feed/FeedErrorState';
import EmailVerificationBanner from '../components/common/EmailVerificationBanner';
import CURRENT_USER from '../data/mockCurrentUser';
// Self-imported here (not just relying on Feed.jsx having already loaded
// it elsewhere in the bundle) since this is the first place FeedList/
// FeedSkeleton/etc. render outside of Feed.jsx itself -- same "own your
// styles" reasoning as TopAppBar/Logo importing layout.css directly.
import '../components/feed/Feed.css';

// Real feed, same as Feed.jsx (/feed): the same useFeed hook, the same
// FeedList (real pagination/virtualization) rendering real <PostCard
// post={p} />, and the same loading/error/empty states -- this screen
// doesn't reimplement any of that, it's the same real data wired into the
// new layout shell. The composer's avatar stays mock/stubbed as before
// (no real "current user" fetch wired here yet); only the post feed below
// it is real. There's no Stories row here at all -- it used to render
// fake hardcoded people (no /stories API exists anywhere in the backend),
// which would have shown the same made-up 7 "friends" to every real user.
// components/feed/StoriesRow.jsx itself is untouched and still a clean,
// purely prop-driven component -- wiring it back in is a one-line change
// here whenever a real stories feature/endpoint exists, not a rebuild.
function HomeFeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const justReactivated = Boolean(location.state?.reactivated);
  const {
    posts,
    loading,
    loadingMore,
    error,
    hasMore,
    reload,
    loadMore,
    removePost,
    removePostsByUser,
    updatePostContent
  } = useFeed(token);

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  if (!token) {
    return null;
  }

  const feedState = loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  return (
    <div>
      <TopAppBar />
      <EmailVerificationBanner />
      {justReactivated && (
        <p
          role="status"
          style={{ padding: '12px 16px', margin: 0, background: 'var(--badge-green-bg)', color: 'var(--badge-green-fg)', fontSize: 13 }}
        >
          Welcome back! Your account has been reactivated.
        </p>
      )}
      <PostComposer currentUser={CURRENT_USER} />
      {feedState === 'loading' && <FeedSkeleton />}
      {feedState === 'error' && <FeedErrorState message={error} onRetry={reload} />}
      {feedState === 'empty' && <FeedEmptyState />}
      {feedState === 'list' && (
        <FeedList
          posts={posts}
          hasMore={hasMore}
          isLoadingMore={loadingMore}
          onLoadMore={loadMore}
          onRemovePost={removePost}
          onRemovePostsByUser={removePostsByUser}
          onUpdatePost={updatePostContent}
        />
      )}
    </div>
  );
}

export default HomeFeed;
