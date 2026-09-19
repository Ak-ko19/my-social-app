// Initial-load skeleton for the whole thread: alternating left/right bubble
// shapes of varying width, hinting at the real layout without a uniform
// repeated block. Mirrors FeedSkeleton/ConversationListSkeleton's approach.
function MessageThreadSkeleton() {
  const widths = [45, 60, 35, 55, 40];
  return (
    <div className="messages-thread" role="status" aria-label="Loading conversation">
      {widths.map((width, i) => (
        <div key={i} className={`messages-bubble-row${i % 2 === 1 ? ' messages-bubble-row-own' : ''}`}>
          <div
            className="messages-bubble-skeleton messages-skeleton-pulse"
            style={{ width: `${width}%` }}
            aria-hidden="true"
          />
        </div>
      ))}
      <span className="messages-visually-hidden">Loading conversation…</span>
    </div>
  );
}

export default MessageThreadSkeleton;
