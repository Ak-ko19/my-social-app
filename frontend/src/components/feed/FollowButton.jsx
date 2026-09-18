// Purely presentational: all state and mutation logic lives in
// useFollowToggle (owned by PostCard), passed in as `follow`.
function FollowButton({ follow }) {
  const { isFollowing, pending, error, toggle } = follow;

  return (
    <span className="feed-follow-actions">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isFollowing}
        className="feed-btn feed-btn-secondary"
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
      {error && (
        <span className="feed-error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export default FollowButton;
