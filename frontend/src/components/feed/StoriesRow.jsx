import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { Avatar } from '../ui';
import { resolveImageUrl } from '../../api';
import './StoriesRow.css';

const initialsOf = (name) => (name || '?').slice(0, 2).toUpperCase();

// The Home stories tray (B3). Presentational: HomeFeed owns the data via
// useStories and passes the grouped tray in.
// - "Your story": opens your own stories if you have any; the "+" badge
//   (or the whole item, when you have none) opens the image picker.
// - Everyone else: accent ring while something is unseen, grey once all
//   of their stories have been seen.
function StoriesRow({ tray = [], currentUser, uploading, error, onAddStory, onOpenGroup, className }) {
  const fileInputRef = useRef(null);
  const own = currentUser || { initials: 'ME', bg: 'var(--color-subtle-bg)', color: 'var(--color-text)' };
  const ownGroupIndex = tray.findIndex((g) => g.is_own);
  const ownGroup = ownGroupIndex === -1 ? null : tray[ownGroupIndex];

  const pickImage = () => fileInputRef.current?.click();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onAddStory(file);
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
          aria-label={ownGroup ? 'View your story' : 'Add to your story'}
        >
          <Avatar
            size={56}
            src={own.avatarUrl}
            initials={own.initials}
            bg={own.bg}
            color={own.color}
            ring={ownGroup ? (ownGroup.all_seen ? 'var(--color-border)' : true) : false}
            alt=""
          />
        </button>
        <button
          type="button"
          className="stories-add-btn"
          onClick={pickImage}
          disabled={uploading}
          aria-label="Add to your story"
        >
          <Plus size={10} strokeWidth={3} aria-hidden="true" />
        </button>
        <span className="stories-label">{uploading ? 'Posting…' : 'Your story'}</span>
      </div>

      {tray.map((group, index) =>
        group.is_own ? null : (
          <div className="stories-item" key={group.user_id}>
            <button
              type="button"
              className="stories-avatar-btn"
              onClick={() => onOpenGroup(index)}
              aria-label={`View ${group.username}'s story${group.all_seen ? '' : ' (new)'}`}
            >
              <Avatar
                size={56}
                src={resolveImageUrl(group.avatar_url)}
                initials={initialsOf(group.username)}
                ring={group.all_seen ? 'var(--color-border)' : true}
                alt=""
              />
            </button>
            <span className="stories-label">{group.username}</span>
          </div>
        )
      )}

      {error && (
        <p className="stories-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default StoriesRow;
