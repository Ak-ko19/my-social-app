import { useRef, useState } from 'react';
import { Globe, Plus, Star } from 'lucide-react';
import { ActionSheet, Avatar } from '../ui';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../api';
import './StoriesRow.css';

const initialsOf = (name) => (name || '?').slice(0, 2).toUpperCase();

// The Home stories tray (B3). Presentational: HomeFeed owns the data via
// useStories and passes the grouped tray in.
// - "Your story": opens your own stories if you have any; the "+" badge
//   (or the whole item, when you have none) opens the image picker.
// - Everyone else: accent ring while something is unseen, grey once all
//   of their stories have been seen. Day 47: green while their newest
//   unseen (or newest) story is for close friends, like Instagram.
const CLOSE_FRIENDS_RING = 'var(--color-close-friends)';
const ringFor = (group) => {
  if (group.stories.some((s) => s.close_friends && !s.seen)) return CLOSE_FRIENDS_RING;
  return group.all_seen ? 'var(--color-border)' : true;
};
function StoriesRow({ tray = [], currentUser, uploading, error, onAddStory, onOpenGroup, className }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const own = currentUser || { initials: 'ME', bg: 'var(--color-subtle-bg)', color: 'var(--color-text)' };
  const ownGroupIndex = tray.findIndex((g) => g.is_own);
  const ownGroup = ownGroupIndex === -1 ? null : tray[ownGroupIndex];

  const pickImage = () => fileInputRef.current?.click();
  // Day 47: after picking a photo, who it's for.
  const [picked, setPicked] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPicked(file);
  };
  const share = (closeFriends) => {
    onAddStory(picked, { closeFriends });
    setPicked(null);
  };

  return (
    <div className={className ? `stories-row ${className}` : 'stories-row'}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        onChange={handleFile}
      />

      <div className="stories-item">
        <button
          type="button"
          className="stories-avatar-btn"
          onClick={ownGroup ? () => onOpenGroup(ownGroupIndex) : pickImage}
          disabled={uploading}
          aria-label={ownGroup ? t('stories.viewYours') : t('stories.add')}
        >
          <Avatar
            size={56}
            src={own.avatarUrl}
            initials={own.initials}
            bg={own.bg}
            color={own.color}
            ring={ownGroup ? ringFor(ownGroup) : false}
            alt=""
            // Day 75: the button's label says what it does (axe:
            // label-content-name-mismatch on the initials as text).
            decorative
          />
        </button>
        <button
          type="button"
          className="stories-add-btn"
          onClick={pickImage}
          disabled={uploading}
          aria-label={t('stories.add')}
        >
          <Plus size={10} strokeWidth={3} aria-hidden="true" />
        </button>
        <span className="stories-label">{uploading ? t('stories.posting') : t('stories.yours')}</span>
      </div>

      {tray.map((group, index) =>
        group.is_own ? null : (
          <div className="stories-item" key={group.user_id}>
            <button
              type="button"
              className="stories-avatar-btn"
              onClick={() => onOpenGroup(index)}
              aria-label={t(group.all_seen ? 'stories.view' : 'stories.viewNew', { name: group.username })}
            >
              <Avatar
                size={56}
                src={resolveImageUrl(group.avatar_url)}
                initials={initialsOf(group.username)}
                ring={ringFor(group)}
                alt=""
              />
            </button>
            <span className="stories-label">{group.username}</span>
          </div>
        )
      )}

      <ActionSheet
        open={Boolean(picked)}
        onClose={() => setPicked(null)}
        title={t('stories.shareTo')}
        items={[
          { key: 'everyone', label: t('stories.shareYourStory'), icon: Globe, onSelect: () => share(false) },
          { key: 'close-friends', label: t('stories.shareCloseFriends'), icon: Star, onSelect: () => share(true) }
        ]}
      />

      {error && (
        <p className="stories-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default StoriesRow;
