import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useTrendingHashtags, usePopularPosts } from '../hooks/useExplore';
import TrendingHashtags from '../components/explore/TrendingHashtags';
import PeopleYouMayKnow from '../components/explore/PeopleYouMayKnow';
import PostCard from '../components/feed/PostCard';
import PostCardSkeleton from '../components/feed/PostCardSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import '../components/feed/Feed.css';
import '../components/explore/Explore.css';

// B7 Explore: this week's trending hashtags + popular posts (ranked by
// engagement with time decay on the backend -- see exploreController).
function ExploreScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const trending = useTrendingHashtags(token);
  const popular = usePopularPosts(token);

  let postsSection;
  if (popular.loading) {
    postsSection = <PostCardSkeleton />;
  } else if (popular.error && popular.posts.length === 0) {
    postsSection = <FeedErrorState message={popular.error} onRetry={popular.reload} />;
  } else if (popular.posts.length === 0) {
    postsSection = <p className="screen-status">{t('explore.empty')}</p>;
  } else {
    postsSection = (
      <>
        {popular.posts.map((p) => (
          <PostCard key={p.id} post={p} onRemovePost={popular.removePost} onRemovePostsByUser={popular.reload} onUpdatePost={() => {}} />
        ))}
        {popular.hasMore && (
          <div className="explore-more">
            <button type="button" className="feed-btn" onClick={popular.loadMore} disabled={popular.loadingMore}>
              {popular.loadingMore ? t('common.loading') : t('common.loadMore')}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="screen-header-title">{t('explore.title')}</h1>
      </header>
      <div className="screen-body explore-body">
        <PeopleYouMayKnow token={token} />
        <TrendingHashtags tags={trending.tags} loaded={trending.loaded} failed={trending.failed} onRetry={trending.retry} />
        <h2 className="section-heading">{t('explore.popular')}</h2>
      </div>
      <div className="explore-posts">{postsSection}</div>
    </div>
  );
}

export default ExploreScreen;
