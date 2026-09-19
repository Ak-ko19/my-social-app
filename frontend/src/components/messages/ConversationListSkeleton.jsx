import ConversationListItemSkeleton from './ConversationListItemSkeleton';

// Initial-load skeleton: a handful of rows, mirroring FeedSkeleton's shape.
function ConversationListSkeleton({ count = 6 }) {
  return (
    <div className="messages-skeleton-list" role="status" aria-label="Loading conversations">
      {Array.from({ length: count }).map((_, i) => (
        <ConversationListItemSkeleton key={i} />
      ))}
      <span className="messages-visually-hidden">Loading conversations…</span>
    </div>
  );
}

export default ConversationListSkeleton;
