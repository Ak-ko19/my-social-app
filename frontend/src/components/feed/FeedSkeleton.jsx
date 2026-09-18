import PostCardSkeleton from './PostCardSkeleton';

// Initial-load skeleton: a handful of PostCardSkeletons, alternating
// with/without a media block so the loading state hints at the feed's
// actual variable post structure instead of one uniform repeated shape.
function FeedSkeleton({ count = 4 }) {
  return (
    <div className="feed-skeleton-list" role="status" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} withMedia={i % 2 === 0} />
      ))}
      <span className="feed-visually-hidden">Loading feed…</span>
    </div>
  );
}

export default FeedSkeleton;
