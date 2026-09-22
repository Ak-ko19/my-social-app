import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import FeedList from '../components/feed/FeedList';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { useHashtagFeed } from '../hooks/useHashtagFeed';
import '../components/feed/Feed.css';
import './HashtagFeedScreen.css';

function HashtagFeedScreen() {
  const navigate = useNavigate();
  const { tag } = useParams();
  const { token } = useAuth();
  const { posts, loading, loadingMore, error, hasMore, loadMore } = useHashtagFeed(tag, token);

  const state = loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  return (
    <div className="screen-enter">
      <header className="hashtag-feed-header">
        <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate(-1)} />
        <h1 className="hashtag-feed-header-title">#{tag}</h1>
      </header>

      {state === 'loading' && <FeedSkeleton />}
      {state === 'error' && <FeedErrorState message={error} />}
      {state === 'empty' && <p className="hashtag-feed-empty">No posts yet for #{tag}.</p>}
      {state === 'list' && <FeedList posts={posts} hasMore={hasMore} isLoadingMore={loadingMore} onLoadMore={loadMore} />}
    </div>
  );
}

export default HashtagFeedScreen;
