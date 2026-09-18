// Mirrors PostCard's actual DOM structure (header/avatar/name/action-slot,
// content lines, optional media block, timestamp, action buttons) so its
// height is a realistic stand-in for a real card, and the swap from
// skeleton -> real content doesn't jump dramatically. `withMedia` lets
// callers vary the shape, since not every real post has an image.
function PostCardSkeleton({ withMedia = false }) {
  return (
    <div className="feed-post-card feed-skeleton-card" aria-hidden="true">
      <div className="feed-skeleton-header">
        <div className="feed-skeleton-avatar feed-skeleton-pulse" />
        <div className="feed-skeleton-line feed-skeleton-line-name feed-skeleton-pulse" />
        <div className="feed-skeleton-header-spacer" />
        <div className="feed-skeleton-pill feed-skeleton-pulse" />
      </div>

      <div className="feed-skeleton-line feed-skeleton-pulse" />
      <div className="feed-skeleton-line feed-skeleton-line-short feed-skeleton-pulse" />

      {withMedia && <div className="feed-skeleton-media feed-skeleton-pulse" />}

      <div className="feed-skeleton-line feed-skeleton-line-tiny feed-skeleton-pulse" />

      <div className="feed-skeleton-actions">
        <div className="feed-skeleton-pill feed-skeleton-pulse" />
        <div className="feed-skeleton-pill feed-skeleton-pulse" />
      </div>
    </div>
  );
}

export default PostCardSkeleton;
