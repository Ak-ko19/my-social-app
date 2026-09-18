// Static placeholder for now (no shimmer/animation) -- the Step 4 task
// covers realistic skeleton polish and progressive image loading. This just
// gives the loading state a real component instead of a plain-text message.
function FeedSkeleton({ count = 3 }) {
  return (
    <div className="feed-skeleton-list" role="status" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <div className="feed-skeleton-card" key={i} aria-hidden="true">
          <div className="feed-skeleton-header">
            <div className="feed-skeleton-avatar" />
            <div className="feed-skeleton-line feed-skeleton-line-short" />
          </div>
          <div className="feed-skeleton-line" />
          <div className="feed-skeleton-line feed-skeleton-line-short" />
          <div className="feed-skeleton-media" />
        </div>
      ))}
      <span className="feed-visually-hidden">Loading feed…</span>
    </div>
  );
}

export default FeedSkeleton;
