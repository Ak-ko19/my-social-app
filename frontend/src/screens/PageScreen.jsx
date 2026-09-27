import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Flag, Pencil } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import PostCard from '../components/feed/PostCard';
import PostCardSkeleton from '../components/feed/PostCardSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { categoryLabel, fetchPage, fetchPagePosts, followPage, unfollowPage } from '../services/pageService';
import '../components/feed/Feed.css';
import './GroupsScreen.css';

// B14: /pages/:id -- page header, Follow/Following, the page's posts. The
// owner gets "Post as page" and an Edit button.
function PageScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { token } = useAuth();
  const [page, setPage] = useState(null);
  const [pageError, setPageError] = useState('');
  const [posts, setPosts] = useState(null);
  const [postsError, setPostsError] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPage(id, token), fetchPagePosts(id, token, { page: 1 })])
      .then(([p, d]) => {
        if (cancelled) return;
        setPage(p);
        setPosts(d.posts);
        setHasMore(d.hasMore);
        setPageNum(1);
        setPageError('');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status !== 404) console.error(err);
        setPageError(err.response?.status === 404 ? 'This page is not available.' : 'Could not load the page.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, reloadKey]);

  const loadMore = () =>
    fetchPagePosts(id, token, { page: pageNum + 1 })
      .then((d) => {
        setPosts((cur) => [...(cur || []), ...d.posts]);
        setHasMore(d.hasMore);
        setPageNum((n) => n + 1);
        setPostsError('');
      })
      .catch((err) => {
        console.error(err);
        setPostsError('Could not load more posts');
      });

  const toggleFollow = () => {
    setBusy(true);
    (page.is_following ? unfollowPage : followPage)(id, token)
      .then((p) => setPage((cur) => ({ ...cur, ...p })))
      .catch((err) => console.error(err))
      .finally(() => setBusy(false));
  };

  const removePost = useCallback((postId) => setPosts((cur) => (cur || []).filter((p) => p.id !== postId)), []);
  // Blocking the owner from a post's menu hides the whole page.
  const ownerBlocked = useCallback(() => setReloadKey((k) => k + 1), []);

  if (pageError) {
    return (
      <div className="screen-enter">
        <header className="screen-header">
          <IconButton icon={ChevronLeft} aria-label="Back to Pages" onClick={() => navigate('/pages')} />
          <h1 className="screen-header-title">Page</h1>
        </header>
        <FeedErrorState message={pageError} onRetry={() => { setPageError(''); setReloadKey((k) => k + 1); }} />
      </div>
    );
  }
  if (!page) return <p className="screen-status" role="status">Loading page…</p>;

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Pages" onClick={() => navigate('/pages')} />
        <h1 className="screen-header-title">{page.name}</h1>
        {page.is_owner && <IconButton icon={Pencil} aria-label="Edit page" onClick={() => navigate(`/pages/${id}/edit`)} />}
      </header>

      <div className="screen-body">
        <div className="community-hero">
          <span className="group-row-icon page-icon community-hero-icon" aria-hidden="true">
            <Flag size={26} />
          </span>
          <p className="community-meta">
            {categoryLabel(page.category)} · {page.follower_count} {page.follower_count === 1 ? 'follower' : 'followers'}
          </p>
          {page.description && <p className="community-description">{page.description}</p>}
          <div className="community-actions">
            {page.is_owner ? (
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/create-post?pageId=${id}`)}>
                Post as page
              </button>
            ) : (
              <button
                type="button"
                className={page.is_following ? 'btn btn-secondary' : 'btn btn-primary'}
                onClick={toggleFollow}
                disabled={busy}
                aria-pressed={page.is_following}
              >
                {page.is_following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="community-feed">
        {posts === null && <PostCardSkeleton />}
        {posts && posts.length === 0 && <p className="screen-status">No posts yet.</p>}
        {posts &&
          posts.map((p) => (
            <PostCard key={p.id} post={p} onRemovePost={removePost} onRemovePostsByUser={ownerBlocked} onUpdatePost={() => {}} />
          ))}
        {postsError && <FeedErrorState message={postsError} onRetry={loadMore} />}
        {hasMore && (
          <div className="community-more">
            <button type="button" className="feed-btn" onClick={loadMore}>Load more</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PageScreen;
