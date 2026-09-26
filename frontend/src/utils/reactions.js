// B1 reactions -- keep keys in sync with backend/services/reactionService.js
// (and migration 016's CHECK constraint). Order is the picker's order.
// `color` tints the Like button once that reaction is chosen.
export const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like', color: 'var(--color-accent)' },
  { key: 'love', emoji: '❤️', label: 'Love', color: '#e11d48' },
  { key: 'haha', emoji: '😆', label: 'Haha', color: '#d97706' },
  { key: 'wow', emoji: '😮', label: 'Wow', color: '#d97706' },
  { key: 'sad', emoji: '😢', label: 'Sad', color: '#d97706' },
  { key: 'angry', emoji: '😡', label: 'Angry', color: '#ea580c' }
];

export const REACTION_BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.key, r]));

// Up to `limit` reaction types with the most reactions, most-used first --
// the little emoji cluster next to a post's reaction total.
export function topReactions(reactionCounts, limit = 3) {
  return Object.entries(reactionCounts || {})
    .filter(([key, count]) => count > 0 && REACTION_BY_KEY[key])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => REACTION_BY_KEY[key]);
}
