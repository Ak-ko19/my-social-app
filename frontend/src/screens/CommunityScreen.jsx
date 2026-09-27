import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Globe, Lock, Settings2, UsersRound } from 'lucide-react';
import { IconButton, ConfirmDialog } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import PostCard from '../components/feed/PostCard';
import PostCardSkeleton from '../components/feed/PostCardSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { fetchCommunity, fetchCommunityPosts, joinCommunity, removeCommunityMember } from '../services/communityService';
import '../components/feed/Feed.css';
import './GroupsScreen.css';

// B13: /groups/:id -- header, join/leave, "Write a post" for members,
// and the group's feed. Admins get a Manage button and can delete any
// post here (PostCard's canModerate).
function CommunityScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { token, userId } = useAuth();
  const [group, setGroup] = useState(null);
  const [groupError, setGroupError] = useState('');
  const [posts, setPosts] = useState(null);
  const [postsError, setPostsError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const loadGroup = useCallback(
    () =>
      fetchCommunity(id, token)
        .then((g) => {
          setGroup(g);
          setGroupError('');
          return g;
        })
        .catch((err) => {
          if (err.response?.status !== 404) console.error(err);
          setGroupError(err.response?.status === 404 ? 'This group no longer exists.' : 'Could not load the group.');
          return null;
        }),
    [id, token]
  );

  const loadPosts = useCallback(
    (nextPage = 1) =>
      fetchCommunityPosts(id, token, { page: nextPage })
        .then((d) => {
          setPosts((cur) => (nextPage === 1 ? d.posts : [...(cur || []), ...d.posts]));
          setHasMore(d.hasMore);
          setPage(nextPage);
          setPostsError('');
        })
        .catch((err) => {
          if (err.response?.status === 403) {
            setPosts([]); // private + not a member: the header explains it
            return;
          }
          console.error(err);
          setPostsError('Could not load posts');
        }),
    [id, token]
  );

  useEffect(() => {
    let cancelled = false;
    fetchCommunity(id, token)
      .then((g) => {
        if (cancelled) return;
        setGroup(g);
        if (g.can_read) {
          return fetchCommunityPosts(id, token, { page: 1 }).then((d) => {
            if (!cancelled) {
              setPosts(d.posts);
              setHasMore(d.hasMore);
            }
          });
        }
        setPosts([]);
        return undefined;
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status !== 404) console.error(err);
        setGroupError(err.response?.status === 404 ? 'This group no longer exists.' : 'Could not load the group.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const join = () => {
    setBusy(true);
    joinCommunity(id, token)
      .then((g) => {
        setGroup(g);
        if (g.can_read) loadPosts(1);
      })
      .catch((err) => console.error(err))
      .finally(() => setBusy(false));
  };

  const leave = async () => {
    const result = await removeCommunityMember(id, userId, token);
    setConfirmLeave(false);
    if (result.deleted) {
      navigate('/groups', { replace: true });
      return;
    }
    const g = await loadGroup();
    if (g && !g.can_read) setPosts([]);
  };

  const removePost = useCallback((postId) => setPosts((cur) => (cur || []).filter((p) => p.id !== postId)), []);

  if (groupError) {
    return (
      <div className="screen-enter">
        <header className="screen-header">
          <IconButton icon={ChevronLeft} aria-label="Back to Groups" onClick={() => navigate('/groups')} />
          <h1 className="screen-header-title">Group</h1>
        </header>
        <FeedErrorState message={groupError} onRetry={() => { setGroupError(''); loadGroup(); }} />
      </div>
    );
  }
  if (!group) return <p className="screen-status" role="status">Loading group…</p>;

  const pending = group.my_status === 'pending';

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Groups" onClick={() => navigate('/groups')} />
        <h1 className="screen-header-title">{group.name}</h1>
        {group.is_admin && (
          <IconButton icon={Settings2} aria-label="Manage group" onClick={() => navigate(`/groups/${id}/manage`)} />
        )}
      </header>

      <div className="screen-body">
        <div className="community-hero">
          <span className="group-row-icon community-hero-icon" aria-hidden="true">
            <UsersRound size={28} />
          </span>
          <p className="community-meta">
            {group.privacy === 'private' ? <Lock size={13} aria-hidden="true" /> : <Globe size={13} aria-hidden="true" />}
            {group.privacy === 'private' ? ' Private group' : ' Public group'} · {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
          </p>
          {group.description && <p className="community-description">{group.description}</p>}

          <div className="community-actions">
            {!group.my_status && (
              <button type="button" className="btn btn-primary" onClick={join} disabled={busy}>
                {group.privacy === 'private' ? 'Request to join' : 'Join group'}
              </button>
            )}
            {pending && (
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmLeave(true)}>
                Requested · Cancel
              </button>
            )}
            {group.is_member && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => navigate(`/create-post?communityId=${id}`)}>
                  Write a post
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmLeave(true)}>
                  Leave
                </button>
              </>
            )}
          </div>
        </div>

        {!group.can_read && (
          <div className="community-locked">
            <Lock size={22} aria-hidden="true" />
            <p>{pending ? 'Your request is waiting for an admin.' : 'This group is private. Join to see its posts.'}</p>
          </div>
        )}
      </div>

      {group.can_read && (
        <div className="community-feed">
          {posts === null && <PostCardSkeleton />}
          {postsError && <FeedErrorState message={postsError} onRetry={() => loadPosts(1)} />}
          {posts && posts.length === 0 && !postsError && <p className="screen-status">No posts yet{group.is_member ? ' — be the first!' : '.'}</p>}
          {posts &&
            posts.map((p) => (
              <PostCard key={p.id} post={p} onRemovePost={removePost} onRemovePostsByUser={() => loadPosts(1)} onUpdatePost={() => {}} canModerate={group.is_admin} />
            ))}
          {hasMore && (
            <div className="community-more">
              <button type="button" className="feed-btn" onClick={() => loadPosts(page + 1)}>Load more</button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={leave}
        title={pending ? 'Cancel your request?' : `Leave ${group.name}?`}
        description={pending ? '' : group.privacy === 'private' ? "You'll need an admin's approval to rejoin." : 'You can rejoin any time.'}
        confirmLabel={pending ? 'Cancel request' : 'Leave'}
        danger={!pending}
      />
    </div>
  );
}

export default CommunityScreen;
