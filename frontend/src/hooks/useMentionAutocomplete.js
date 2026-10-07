import { useCallback, useEffect, useRef, useState } from 'react';
import { searchUsers } from '../services/searchService';
import { useAuth } from './useAuth';

// Matches an in-progress "@partial" mention ending exactly at the cursor --
// only triggers right after a word boundary (start of string or
// whitespace) so an email-like "foo@bar" mid-word never opens the dropdown.
// Day 43: names in any script (see utils/renderTextWithLinks).
const ACTIVE_MENTION_REGEX = /(?:^|\s)@([\p{L}\p{M}\p{N}_]*)$/u;

// Shared by the post composer (CreatePost.jsx) and comment composer
// (CommentSection.jsx) -- feed the current text + cursor position on every
// change via handleInputChange, get back the live suggestion list, and use
// applyMentionSelection to splice a chosen username back into the text.
export function useMentionAutocomplete() {
  const { token } = useAuth();
  const [query, setQuery] = useState(null); // null = no active @mention being typed
  const [suggestions, setSuggestions] = useState([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    // No synchronous setState for the "no active query" case -- `active`
    // (derived below from `query`) already gates whether the dropdown
    // renders at all, so stale suggestions sitting unused in state here are
    // harmless; they're simply never shown while inactive, and get replaced
    // for real once a new query's debounced search resolves.
    if (!query) return;

    const requestId = ++requestIdRef.current;
    // Debounced -- avoids firing a search request on every keystroke while
    // someone is still typing the username.
    const timeout = setTimeout(() => {
      searchUsers(query, token)
        .then((users) => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions(users.slice(0, 5));
        })
        .catch((err) => {
          console.error(err);
          if (requestId === requestIdRef.current) setSuggestions([]);
        });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, token]);

  const handleInputChange = useCallback((value, cursorPos) => {
    const match = value.slice(0, cursorPos).match(ACTIVE_MENTION_REGEX);
    setQuery(match ? match[1] : null);
  }, []);

  const reset = useCallback(() => setQuery(null), []);

  return { suggestions, active: query !== null, handleInputChange, reset };
}

// Splices `username` in as a completed mention, replacing the in-progress
// "@partial" text ending at cursorPos. Returns the new full value and where
// the cursor should land (right after the inserted trailing space).
export function applyMentionSelection(value, cursorPos, username) {
  const uptoCursor = value.slice(0, cursorPos);
  const match = uptoCursor.match(ACTIVE_MENTION_REGEX);
  if (!match) return { value, cursorPos };

  const atIndex = uptoCursor.lastIndexOf('@');
  const before = value.slice(0, atIndex);
  const after = value.slice(cursorPos);
  const inserted = `@${username} `;

  return { value: before + inserted + after, cursorPos: before.length + inserted.length };
}
