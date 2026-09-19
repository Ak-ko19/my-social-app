import { Link } from 'react-router-dom';

// No dedicated "start a conversation" flow exists yet -- Search is the
// existing entry point for finding another user, so the CTA points there.
function ConversationListEmptyState() {
  return (
    <div className="messages-empty-state" role="status">
      <p>No conversations yet.</p>
      <p>
        <Link to="/search" className="messages-btn-link">
          Find someone to message
        </Link>
      </p>
    </div>
  );
}

export default ConversationListEmptyState;
