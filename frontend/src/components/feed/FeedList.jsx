import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import PostCard from './PostCard';
import PostCardSkeleton from './PostCardSkeleton';

// Window-scoped virtualization (not a fixed-height inner scroll container)
// so the Feed keeps using ordinary page/document scrolling -- the simplest
// fit for this app's existing layout and the most natural behavior on
// mobile, where a nested scroll area inside the page would feel wrong.
function FeedList({ posts, hasMore, isLoadingMore, onLoadMore }) {
  const listRef = useRef(null);
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
      {isLoadingMore && (
        <div className="feed-loading-more" role="status" aria-label="Loading more posts">
          <PostCardSkeleton />
          <span className="feed-visually-hidden">Loading more posts…</span>
        </div>
      )}
    </>
  );
}

export default FeedList;
