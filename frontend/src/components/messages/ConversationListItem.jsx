import { memo } from 'react';
import { BellOff, Pin } from 'lucide-react';
import GroupAvatar from './GroupAvatar';
import Avatar from '../common/Avatar';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../i18n';

// The API labels media/deleted previews in English (conversationController,
// useConversations' messagePreviewText) -- shown in the app's language here.
function localizePreview(text, t) {
  if (text === 'This message was deleted') return t('messages.preview.deleted');
  if (text === 'Voice message') return t('messages.preview.voice');
  if (text === 'Photo') return t('messages.preview.photo');
  if (text?.startsWith('Photo: ')) return t('messages.preview.photoCaption', { caption: text.slice(7) });
  return text;
}

// Deliberately a single component rather than split into sub-parts like
// PostCard -- a conversation row has none of
// PostCard's per-part reuse/complexity (no comments, no media, no separate
// like/follow mutations), so that split would be premature here.
//
// `isOnline` is a plain boolean prop, not a live subscription -- presence
// (Step 8) doesn't exist yet, so callers pass whatever they have (or
// nothing, which just hides the dot) rather than this component reaching
// into a socket itself.
//
// Memoized for the same reason as PostCard: ConversationList is virtualized,
// and a `conversations` array update (e.g. a different row moving to the
// top on a new message) would otherwise re-render every already-mounted row.
function ConversationListItem({ conversation, isOnline = false, onClick }) {
  const { t } = useTranslation();
  const {
    username,
    avatar_url: avatarUrl,
    last_message: lastMessage,
    last_message_at: lastMessageAt,
    unread_count: unreadCount,
    type,
    member_count: memberCount,
    muted,
    pinned
  } = conversation;
  const isGroup = type === 'group';

  const hasUnread = unreadCount > 0;

  return (
    <button
      type="button"
      className={`messages-row ${hasUnread ? 'messages-row-unread' : ''}`.trim()}
      onClick={onClick}
    >
      <span className="messages-avatar-wrap">
        {isGroup ? (
          // Day 34: the group's photo, or the group glyph (GroupAvatar).
          <GroupAvatar src={avatarUrl} size={48} />
        ) : (
          <Avatar src={avatarUrl} size={48} alt={t('messages.profilePicture', { name: username })} />
        )}
        {isOnline && <span className="messages-online-dot" aria-label={t('messages.online')} />}
      </span>

      <span className="messages-body">
        <span className="messages-top-row">
          <span className="messages-name">
            {username}
            {isGroup && <span className="messages-member-count"> · {t('messages.memberCount', { count: memberCount })}</span>}
            {/* Day 23 */}
            {muted && <BellOff size={13} className="messages-muted-icon" aria-label={t('messages.mute.mutedLabel')} role="img" />}
            {/* Days 97-98 */}
            {pinned && <Pin size={13} className="messages-muted-icon" aria-label={t('messages.organise.pinnedLabel')} role="img" />}
          </span>
          {lastMessageAt && (
            <time
              className="messages-time"
              dateTime={lastMessageAt}
              title={formatDate(lastMessageAt)}
            >
              {formatRelativeTime(lastMessageAt)}
            </time>
          )}
        </span>
        <span className="messages-bottom-row">
          <span className="messages-preview" dir="auto">{localizePreview(lastMessage, t) || t('messages.sayHello')}</span>
          {hasUnread && (
            <span className="messages-unread-badge" aria-label={t('messages.unread', { count: unreadCount })}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default memo(ConversationListItem);
