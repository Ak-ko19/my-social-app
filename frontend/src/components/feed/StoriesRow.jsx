import { Plus } from 'lucide-react';
import { Avatar } from '../ui';
import './StoriesRow.css';

// Purely presentational/data-driven -- no mock data lives in here. The
// caller (currently screens/HomeFeed.jsx) owns providing `stories`, the
// same way it'll own calling a real stories API later; this component
// doesn't know or care where the array came from.
//
// `currentUser` is optional (own avatar for the "Your story" item) since
// this component shouldn't reach into auth state itself -- same reasoning
// as everything else in components/ui/: props in, nothing assumed.
function StoriesRow({ stories = [], currentUser, className }) {
  const own = currentUser || { initials: 'ME', bg: 'var(--color-subtle-bg)', color: 'var(--color-text)' };

  return (
    <div className={className ? `stories-row ${className}` : 'stories-row'}>
      <div className="stories-item">
        <Avatar
          size={56}
          initials={own.initials}
          bg={own.bg}
          color={own.color}
          alt=""
          badge={
            <span className="stories-plus-badge">
              <Plus size={10} strokeWidth={3} />
            </span>
          }
        />
        <span className="stories-label">Your story</span>
      </div>

      {stories.map((story) => (
        <div className="stories-item" key={story.id}>
          <Avatar size={56} initials={story.initials} bg={story.bg} color={story.color} ring={story.hasStory} alt="" />
          <span className="stories-label">{story.name}</span>
        </div>
      ))}
    </div>
  );
}

export default StoriesRow;
