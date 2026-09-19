// Mirrors ConversationListItem's actual DOM structure (avatar, name/time
// row, preview row) so its height is a realistic stand-in for a real row.
function ConversationListItemSkeleton() {
  return (
    <div className="messages-skeleton-row" aria-hidden="true">
      <div className="messages-skeleton-avatar messages-skeleton-pulse" />
      <div className="messages-skeleton-body">
        <div className="messages-skeleton-line messages-skeleton-line-name messages-skeleton-pulse" />
        <div className="messages-skeleton-line messages-skeleton-line-preview messages-skeleton-pulse" />
      </div>
    </div>
  );
}

export default ConversationListItemSkeleton;
