import PostCardSkeleton from './PostCardSkeleton';
import { useTranslation } from 'react-i18next';

// Initial-load skeleton: a handful of PostCardSkeletons, alternating
// with/without a media block so the loading state hints at the feed's
// actual variable post structure instead of one uniform repeated shape.
function FeedSkeleton({ count = 4 }) {
  const { t } = useTranslation();
  return (
    <div className="feed-skeleton-list" role="status" aria-label={t('feed.loadingFeed')}>
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} withMedia={i % 2 === 0} />
      ))}
      <span className="feed-visually-hidden">{t('feed.loadingFeedDots')}</span>
    </div>
  );
}

export default FeedSkeleton;
