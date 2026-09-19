import { useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import ConversationListItem from './ConversationListItem';

// Window-scoped virtualization, same approach as FeedList (see its comment)
// -- ordinary page/document scrolling rather than a fixed-height inner
// scroll container, for consistency with the rest of the app.
//
// `onlineUserIds` is a stubbed presence signal (Step 8 doesn't exist yet):
// a Set of user ids currently known to be online, or undefined/empty if the
// caller has nothing to report yet -- in which case no row shows a dot.
function ConversationList({ conversations, onlineUserIds, onOpenConversation }) {
  const listRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: conversations.length,
    // Rough guess only -- measureElement (below) corrects it per row.
    estimateSize: () => 80,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => conversations[index]?.conversation_id ?? index
  });

  return (
    <ul ref={listRef} className="messages-list" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const conversation = conversations[virtualRow.index];
        if (!conversation) return null;
        return (
          <li
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="messages-list-item"
            style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            <ConversationListItem
              conversation={conversation}
              isOnline={Boolean(onlineUserIds?.has(conversation.other_user_id))}
              onClick={() => onOpenConversation(conversation)}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default ConversationList;
