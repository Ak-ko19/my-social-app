import TopAppBar from '../components/layout/TopAppBar';
import StoriesRow from '../components/feed/StoriesRow';
import PostComposer from '../components/feed/PostComposer';
import CURRENT_USER from '../data/mockCurrentUser';

// Placeholder mock data, shaped the way it will eventually come back from
// a real GET /stories (or similar) -- StoriesRow itself takes this as a
// plain prop and doesn't know it's fake, so swapping this for a real
// useStories()-style hook later is a one-line change here, not a change
// to StoriesRow.
const MOCK_STORIES = [
  { id: 1, name: 'Aiko', initials: 'AI', bg: 'var(--badge-pink-bg)', color: 'var(--badge-pink-fg)', hasStory: true },
  { id: 2, name: 'Ben', initials: 'BE', bg: 'var(--badge-blue-bg)', color: 'var(--badge-blue-fg)', hasStory: true },
  { id: 3, name: 'Chidi', initials: 'CH', bg: 'var(--badge-green-bg)', color: 'var(--badge-green-fg)', hasStory: false },
  { id: 4, name: 'Dana', initials: 'DA', bg: 'var(--badge-purple-bg)', color: 'var(--badge-purple-fg)', hasStory: true },
  { id: 5, name: 'Eli', initials: 'EL', bg: 'var(--badge-orange-bg)', color: 'var(--badge-orange-fg)', hasStory: false },
  { id: 6, name: 'Farah', initials: 'FA', bg: 'var(--badge-teal-bg)', color: 'var(--badge-teal-fg)', hasStory: true },
  { id: 7, name: 'Gus', initials: 'GU', bg: 'var(--badge-amber-bg)', color: 'var(--badge-amber-fg)', hasStory: false }
];

// Placeholder content only -- real feed comes later. TopAppBar/StoriesRow/
// PostComposer are real (not stubs): they're the first pieces of the
// actual Home screen, mounted in the order they'll appear in the
// finished screen.
function HomeFeed() {
  return (
    <div>
      <TopAppBar />
      <StoriesRow stories={MOCK_STORIES} currentUser={CURRENT_USER} />
      <PostComposer currentUser={CURRENT_USER} />
      <div style={{ padding: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Home screen placeholder.</p>
      </div>
    </div>
  );
}

export default HomeFeed;
