// Purely presentational: all state and mutation logic lives in
// useLikeToggle (owned by PostCard), passed in as `like`. A single toggle
// button now that the feed actually returns per-post liked/count state,
// rather than two independent Like/Unlike actions with no visible state.
function LikeButton({ like }) {
  const { likedByMe, likeCount, pending, error, toggle } = like;

  return (
    <span className="feed-like-actions">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={likedByMe}
        aria-label={likedByMe ? 'Unlike this post' : 'Like this post'}
        className="feed-btn feed-btn-secondary"
      >
        {likedByMe ? 'Unlike' : 'Like'} ({likeCount})
      </button>
      {error && (
        <span className="feed-error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export default LikeButton;
