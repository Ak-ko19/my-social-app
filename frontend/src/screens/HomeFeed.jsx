import { useEffect, useState } from 'react';
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
import { useCurrentUserSummary } from '../hooks/useCurrentUserSummary';
import { useStories } from '../hooks/useStories';
import StoriesRow from '../components/feed/StoriesRow';
import StoryViewer from '../components/feed/StoryViewer';
// Self-imported here (not just relying on Feed.jsx having already loaded
// it elsewhere in the bundle) since this is the first place FeedList/
// FeedSkeleton/etc. render outside of Feed.jsx itself -- same "own your
// styles" reasoning as TopAppBar/Logo importing layout.css directly.
import '../components/feed/Feed.css';

// Real feed: the shared useFeed hook, FeedList (real pagination/
// virtualization) rendering real <PostCard post={p} />, plus the real
// stories tray (B3, useStories + StoriesRow + StoryViewer) above it.
function HomeFeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const currentUser = useCurrentUserSummary();
  const justReactivated = Boolean(location.state?.reactivated);
  const stories = useStories(token);
  // Index into stories.tray of the person whose stories are open, or null.
  const [openStoryGroup, setOpenStoryGroup] = useState(null);
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
      <StoriesRow
        tray={stories.tray}
        currentUser={currentUser}
        uploading={stories.uploading}
        error={stories.error}
        onAddStory={stories.addStory}
        onOpenGroup={setOpenStoryGroup}
      />
      {openStoryGroup !== null && (
        <StoryViewer
          tray={stories.tray}
          startGroupIndex={openStoryGroup}
          onClose={() => setOpenStoryGroup(null)}
          onViewed={stories.markViewed}
          onDelete={stories.removeStory}
        />
      )}
      <PostComposer currentUser={currentUser} />
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
