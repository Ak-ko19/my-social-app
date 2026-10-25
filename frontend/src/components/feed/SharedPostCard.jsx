import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import { resolveImageUrl } from '../../api';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { Avatar } from '../ui';
import MediaCarousel from './MediaCarousel';
import PostText from './PostText';

// Days 93-94: the post a share shares, inside the sharer's card (Facebook's
// shared-post frame). `shared` is the server's shared_post: { id, content,
// created_at, user_id, username, avatar_url, page, media }, or null when
// this viewer may no longer see it (its audience changed, it was deleted,
// a block, a deactivated author) -- then Facebook's honest "isn't available"
// note, never a stale copy. The author line opens the original.
function SharedPostCard({ shared }) {
  const { t } = useTranslation();

  if (!shared) {
    return (
      <div className="shared-post shared-post-unavailable">
        <EyeOff size={20} aria-hidden="true" />
        <div>
          <p className="shared-post-unavailable-title">{t('feed.shareUnavailable')}</p>
          <p className="shared-post-unavailable-help">{t('feed.shareUnavailableHelp')}</p>
        </div>
      </div>
    );
  }

  // B14: a page's post is shown as the page.
  const name = shared.page ? shared.page.name : shared.username;
  return (
    <section className="shared-post" aria-label={t('feed.sharedPostLabel', { name })}>
      <Link to={`/posts/${shared.id}`} className="shared-post-header">
        <Avatar size={32} src={shared.page || !shared.avatar_url ? undefined : resolveImageUrl(shared.avatar_url)} initials={(name || '?').slice(0, 2).toUpperCase()} alt="" />
        <span className="shared-post-header-text">
          <span className="shared-post-author">{name}</span>
          <span className="shared-post-meta">{formatRelativeTime(shared.created_at)}</span>
        </span>
      </Link>
      {shared.content && <PostText content={shared.content} className="shared-post-body" />}
      <MediaCarousel media={shared.media || []} altPrefix={t('feed.imageAlt', { name })} className="shared-post-media" />
    </section>
  );
}

export default SharedPostCard;
