import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
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
  const { token } = useAuth();
  const trending = useTrendingHashtags(token);
  const popular = usePopularPosts(token);

  let postsSection;
  if (popular.loading) {
    postsSection = <PostCardSkeleton />;
  } else if (popular.error && popular.posts.length === 0) {
    postsSection = <FeedErrorState message={popular.error} onRetry={popular.reload} />;
  } else if (popular.posts.length === 0) {
    postsSection = <p className="screen-status">No popular posts this week yet. Reactions and comments bring posts here.</p>;
  } else {
    postsSection = (
      <>
        {popular.posts.map((p) => (
          <PostCard key={p.id} post={p} onRemovePost={popular.removePost} onRemovePostsByUser={popular.reload} onUpdatePost={() => {}} />
        ))}
        {popular.hasMore && (
          <div className="explore-more">
            <button type="button" className="feed-btn" onClick={popular.loadMore} disabled={popular.loadingMore}>
              {popular.loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate(-1)} />
        <h1 className="screen-header-title">Explore</h1>
      </header>
      <div className="screen-body explore-body">
        <PeopleYouMayKnow token={token} />
        <TrendingHashtags tags={trending.tags} loaded={trending.loaded} />
        <h2 className="section-heading">Popular this week</h2>
      </div>
      <div className="explore-posts">{postsSection}</div>
    </div>
  );
}

export default ExploreScreen;
