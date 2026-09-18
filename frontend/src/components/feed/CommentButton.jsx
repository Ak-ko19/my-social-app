function CommentButton({ expanded, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="feed-btn feed-btn-secondary"
    >
      {expanded ? 'Hide Comments' : 'Show Comments'}
    </button>
  );
}

export default CommentButton;
