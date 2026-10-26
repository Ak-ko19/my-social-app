import { useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';
import ConversationListItem from './ConversationListItem';

// Window-scoped virtualization, same approach as FeedList (see its comment)
// -- ordinary page/document scrolling rather than a fixed-height inner
// scroll container, for consistency with the rest of the app.
//
// `onlineUserIds` is a stubbed presence signal (Step 8 doesn't exist yet):
// a Set of user ids currently known to be online, or undefined/empty if the
// caller has nothing to report yet -- in which case no row shows a dot.
// Days 97-98: onOptions(conversation) -- a "More options" button beside
// each row (pin, archive), named after the chat.
function ConversationList({ conversations, onlineUserIds, onOpenConversation, onOptions }) {
  const { t } = useTranslation();
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
            {onOptions && (
              <IconButton
                icon={MoreHorizontal}
                className="messages-row-options"
                aria-label={t('messages.organise.options', { name: conversation.username })}
                onClick={() => onOptions(conversation)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default ConversationList;
