// Mirrors PostCard's actual new shape (header/avatar/name, content lines,
// optional media block, stats line, 3-button action row) so its height is
// a realistic stand-in and the swap from skeleton -> real content doesn't
// jump. Reuses the existing feed-skeleton-pulse animation (from Feed.css,
// still loaded globally) rather than duplicating an identical keyframe in
// the new system -- only the shapes/colors below are new-token-based.
function PostCardSkeleton({ withMedia = false }) {
  return (
    <div className="post-card post-card-skeleton" aria-hidden="true">
      <div className="post-card-skeleton-header">
        <div className="post-card-skeleton-avatar feed-skeleton-pulse" />
        <div className="post-card-skeleton-line post-card-skeleton-line-name feed-skeleton-pulse" />
      </div>

      <div className="post-card-skeleton-line feed-skeleton-pulse" />
      <div className="post-card-skeleton-line post-card-skeleton-line-short feed-skeleton-pulse" />

      {withMedia && <div className="post-card-skeleton-media feed-skeleton-pulse" />}

      <div className="post-card-skeleton-actions">
        <div className="post-card-skeleton-pill feed-skeleton-pulse" />
        <div className="post-card-skeleton-pill feed-skeleton-pulse" />
        <div className="post-card-skeleton-pill feed-skeleton-pulse" />
      </div>
    </div>
  );
}

export default PostCardSkeleton;
