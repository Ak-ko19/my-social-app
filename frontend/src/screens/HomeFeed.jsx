import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFeed } from '../hooks/useFeed';
import TopAppBar from '../components/layout/TopAppBar';
import StoriesRow from '../components/feed/StoriesRow';
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

// Placeholder mock data, shaped the way it will eventually come back from
// a real GET /stories (or similar) -- StoriesRow itself takes this as a
// plain prop and doesn't know it's fake, so swapping this for a real
// useStories()-style hook later is a one-line change here, not a change
// to StoriesRow.
const MOCK_STORIES = [
  { id: 1, name: 'Aiko', initials: 'AI', bg: 'var(--badge-pink-bg)', color: 'var(--badge-pink-fg)', hasStory: true },
  { id: 2, name: 'Ben', initials: 'BE', bg: 'var(--badge-blue-bg)', color: 'var(--badge-blue-fg)', hasStory: true },
  { id: 3, name: 'Chidi', initials: 'CH', bg: 'var(--badge-green-bg)', color: 'var(--badge-green-fg)', hasStory: false },
  { id: 4, name: 'Dana', initials: 'DA', bg: 'var(--badge-purple-bg)', color: 'var(--badge-purple-fg)', hasStory: true },
  { id: 5, name: 'Eli', initials: 'EL', bg: 'var(--badge-orange-bg)', color: 'var(--badge-orange-fg)', hasStory: false },
  { id: 6, name: 'Farah', initials: 'FA', bg: 'var(--badge-teal-bg)', color: 'var(--badge-teal-fg)', hasStory: true },
  { id: 7, name: 'Gus', initials: 'GU', bg: 'var(--badge-amber-bg)', color: 'var(--badge-amber-fg)', hasStory: false }
];

// Real feed, same as Feed.jsx (/feed): the same useFeed hook, the same
// FeedList (real pagination/virtualization) rendering real <PostCard
// post={p} />, and the same loading/error/empty states -- this screen
// doesn't reimplement any of that, it's the same real data wired into the
// new layout shell. Stories/composer stay mock/stubbed exactly as before
// (no real stories API exists yet); only the post feed below them is real.
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
      <StoriesRow stories={MOCK_STORIES} currentUser={CURRENT_USER} />
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
