import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useTranslation } from 'react-i18next';
import FeedList from '../components/feed/FeedList';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { useHashtagFeed } from '../hooks/useHashtagFeed';
import '../components/feed/Feed.css';
import './HashtagFeedScreen.css';

function HashtagFeedScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tag } = useParams();
  const { token } = useAuth();
  const { posts, loading, loadingMore, error, hasMore, loadMore, reload } = useHashtagFeed(tag, token);

  const state = loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  return (
    <div className="screen-enter">
      <header className="hashtag-feed-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="hashtag-feed-header-title">#{tag}</h1>
      </header>

      {state === 'loading' && <FeedSkeleton />}
      {state === 'error' && <FeedErrorState message={error} onRetry={reload} />}
      {state === 'empty' && <p className="hashtag-feed-empty">{t('hashtag.empty', { tag })}</p>}
      {state === 'list' && <FeedList posts={posts} hasMore={hasMore} isLoadingMore={loadingMore} onLoadMore={loadMore} />}
    </div>
  );
}

export default HashtagFeedScreen;
