import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import PostCard from './PostCard';
import PostCardSkeleton from './PostCardSkeleton';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

// Window-scoped virtualization (not a fixed-height inner scroll container)
// so the Feed keeps using ordinary page/document scrolling -- the simplest
// fit for this app's existing layout and the most natural behavior on
// mobile, where a nested scroll area inside the page would feel wrong.
//
// Deliberately NOT animated: the virtualized <ul>/<li> positioning below.
// The virtualizer recalculates `translateY` on every scroll frame, and it
// must be applied instantly -- animating/interpolating that transform would
// desync each row from the actual scroll position and look like severe
// jank, not a micro-interaction. Only the occasional "loading more"
// indicator (which mounts/unmounts far less often than every scroll frame)
// gets a transition.
function FeedList({ posts, hasMore, isLoadingMore, onLoadMore }) {
  const listRef = useRef(null);
  const reduceMotion = useReducedMotion();
  // The virtualizer measures from the top of the document; scrollMargin is
  // this list's own offset from there, needed to translate rows correctly.
  // Read via useLayoutEffect (not a ref) so it lands in state and the
  // virtualizer actually re-renders with the corrected value.
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: posts.length,
    // Rough guess only -- measureElement (below) corrects it per row once
    // each PostCard actually renders, so variable-height cards (with/without
    // an image, with/without open comments) size correctly.
    estimateSize: () => 220,
    overscan: 5,
    scrollMargin,
    getItemKey: (index) => posts[index]?.id ?? index
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= posts.length - 1 && hasMore && !isLoadingMore) {
      onLoadMore();
    }
  }, [virtualItems, hasMore, isLoadingMore, onLoadMore, posts.length]);

  return (
    <>
      <ul ref={listRef} className="feed-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((virtualRow) => {
          const post = posts[virtualRow.index];
          if (!post) return null;
          return (
            <li
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="feed-list-item"
              style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
            >
              <PostCard post={post} />
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {isLoadingMore && (
          <motion.div
            key="loading-more"
            className="feed-loading-more"
            role="status"
            aria-label="Loading more posts"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : DURATION_FAST, ease: EASE_STANDARD }}
          >
            <PostCardSkeleton />
            <span className="feed-visually-hidden">Loading more posts…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default FeedList;
