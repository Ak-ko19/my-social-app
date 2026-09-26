import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Grid3x3, Image as ImageIcon, AtSign, Lock } from 'lucide-react';
import clsx from 'clsx';
import PostCard from '../feed/PostCard';
import PostCardSkeleton from '../feed/PostCardSkeleton';
import FeedErrorState from '../feed/FeedErrorState';
import { useProfileTabPosts } from '../../hooks/useProfileTabPosts';
import { getOptimizedImageUrl } from '../../utils/cloudinaryImage';
import '../feed/Feed.css';
import './ProfileTabs.css';

const ALL_TABS = [
  { key: 'posts', label: 'Posts', icon: Grid3x3, empty: 'No posts yet.' },
  { key: 'photos', label: 'Photos', icon: ImageIcon, empty: 'No photos yet.' },
  { key: 'saved', label: 'Saved', icon: Bookmark, empty: 'Nothing saved yet.', ownOnly: true },
  { key: 'tagged', label: 'Tagged', icon: AtSign, empty: 'No posts mention them yet.' }
];

// Profile tabs (B6): Posts / Photos / Saved (own profile only) / Tagged.
// WAI-ARIA tabs pattern: roving tabindex, Left/Right/Home/End move focus
// and select. Photos is a thumbnail grid (tap -> the post); the other
// tabs render full PostCards with "Load more".
function ProfileTabs({ userId, username, isOwn, token }) {
  const tabs = ALL_TABS.filter((t) => !t.ownOnly || isOwn);
  const [active, setActive] = useState('posts');
  const tabRefs = useRef({});
  const { posts, loading, loadingMore, error, isPrivate, hasMore, loadMore, reload, removePost } = useProfileTabPosts(
    userId,
    active,
    token
  );
  const current = tabs.find((t) => t.key === active);

  const select = (key) => {
    setActive(key);
    tabRefs.current[key]?.focus();
  };

  const handleKeyDown = (e, index) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(tabs[next].key);
    }
  };

  let panel;
  if (loading) {
    panel = active === 'photos' ? <div className="profile-photos-grid profile-photos-grid-loading" aria-busy="true" /> : <PostCardSkeleton />;
  } else if (isPrivate) {
    panel = (
      <div className="profile-tab-status">
        <Lock size={22} aria-hidden="true" />
        <p>This account is private. Follow {username} to see their posts.</p>
      </div>
    );
  } else if (error && posts.length === 0) {
    panel = <FeedErrorState message={error} onRetry={reload} />;
  } else if (posts.length === 0) {
    panel = <p className="profile-tab-status">{current.empty}</p>;
  } else if (active === 'photos') {
    panel = (
      <ul className="profile-photos-grid">
        {posts.map((p) => {
          const first = p.media?.[0]?.url || p.image_url;
          return (
            <li key={p.id}>
              <Link to={`/posts/${p.id}`} className="profile-photo-link" aria-label={`Open post: ${p.content.slice(0, 60)}`}>
                <img src={getOptimizedImageUrl(first, 300)} alt="" loading="lazy" />
                {p.media?.length > 1 && <span className="profile-photo-multi" aria-hidden="true">{p.media.length}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  } else {
    panel = (
      <div className="profile-tab-posts">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} onRemovePost={removePost} onRemovePostsByUser={() => reload()} onUpdatePost={() => {}} />
        ))}
      </div>
    );
  }

  return (
    <section className="profile-tabs">
      <div role="tablist" aria-label="Profile sections" className="profile-tablist">
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              type="button"
              role="tab"
              id={`profile-tab-${t.key}`}
              aria-selected={selected}
              aria-controls="profile-tabpanel"
              tabIndex={selected ? 0 : -1}
              className={clsx('profile-tab', selected && 'is-active')}
              onClick={() => setActive(t.key)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="profile-tabpanel" aria-labelledby={`profile-tab-${active}`} className="profile-tabpanel">
        {panel}
        {!loading && hasMore && (
          <div className="profile-tab-more">
            <button type="button" className="feed-btn" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        {error && posts.length > 0 && (
          <p className="feed-error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

export default ProfileTabs;
