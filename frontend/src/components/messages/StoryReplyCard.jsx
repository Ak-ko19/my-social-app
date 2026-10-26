import { useTranslation } from 'react-i18next';
import { getOptimizedImageUrl } from '../../utils/cloudinaryImage';
import { resolveImageUrl } from '../../api';

// Day 100: above a story reply or reaction -- what it answered ("Replied to
// your story", "You reacted to their story"), with the story's photo while
// it is still showing, else "Story unavailable" (Instagram).
function StoryReplyCard({ message, isOwn }) {
  const { t } = useTranslation();
  const kind = message.story_reply === 'reaction' ? 'reacted' : 'replied';
  return (
    <div className="messages-story-card">
      <span className="messages-story-label">{t(`messages.story.${kind}${isOwn ? 'Own' : 'Other'}`)}</span>
      {message.story ? (
        <img
          className="messages-story-thumb"
          src={getOptimizedImageUrl(resolveImageUrl(message.story.media_url), 192)}
          alt={t('messages.story.alt')}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="messages-story-unavailable">{t('messages.story.unavailable')}</span>
      )}
    </div>
  );
}

export default StoryReplyCard;
