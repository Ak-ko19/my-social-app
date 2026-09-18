function FeedErrorState({ message, onRetry }) {
  return (
    <div className="feed-error-state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="feed-btn">
          Try again
        </button>
      )}
    </div>
  );
}

export default FeedErrorState;
