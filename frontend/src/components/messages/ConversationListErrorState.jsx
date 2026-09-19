function ConversationListErrorState({ message, onRetry }) {
  return (
    <div className="messages-error-state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="messages-btn">
          Try again
        </button>
      )}
    </div>
  );
}

export default ConversationListErrorState;
