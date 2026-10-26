import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStoriesTray, createStory, markStoryViewed, deleteStory, replyToStory, reactToStory } from '../services/storyService';
import { serverErrorText } from '../utils/serverError';

// Owns the Home screen's stories tray (B3): load, post a new story,
// mark one seen (optimistically -- the ring should flip the moment it's
// watched), delete your own, and (Day 100) reply or react to someone's.
// Same stale-response guard as useFeed.
export function useStories(token) {
  const [tray, setTray] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    if (!token) return;
    const requestId = ++requestIdRef.current;
    fetchStoriesTray(token)
      .then((data) => {
        if (requestId === requestIdRef.current) setTray(data);
      })
      .catch((err) => {
        // The tray is secondary content: a failure hides it quietly rather
        // than putting an error banner above the feed.
        console.error(err);
      });
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addStory = useCallback(
    (file, options) => {
      if (!file) return;
      setUploading(true);
      setError(null);
      createStory(file, token, options)
        .then(() => reload())
        .catch((err) => {
          console.error(err);
          setError(serverErrorText(err, 'stories.postFailed'));
        })
        .finally(() => setUploading(false));
    },
    [token, reload]
  );

  const markViewed = useCallback(
    (storyId) => {
      setTray((current) =>
        current.map((group) => {
          if (!group.stories.some((s) => s.id === storyId && !s.seen)) return group;
          const stories = group.stories.map((s) => (s.id === storyId ? { ...s, seen: true } : s));
          return { ...group, stories, all_seen: stories.every((s) => s.seen) };
        })
      );
      markStoryViewed(storyId, token).catch((err) => console.error(err));
    },
    [token]
  );

  const removeStory = useCallback(
    (storyId) =>
      deleteStory(storyId, token).then(() => {
        setTray((current) =>
          current
            .map((group) => ({ ...group, stories: group.stories.filter((s) => s.id !== storyId) }))
            .filter((group) => group.stories.length > 0)
        );
      }),
    [token]
  );

  // Day 100: { text } or { emoji }; resolves to { conversationId, message }.
  const sendReply = useCallback(
    (storyId, { text, emoji }) => (emoji ? reactToStory(storyId, emoji, token) : replyToStory(storyId, text, token)),
    [token]
  );

  return { tray, uploading, error, addStory, markViewed, removeStory, sendReply, reload };
}
