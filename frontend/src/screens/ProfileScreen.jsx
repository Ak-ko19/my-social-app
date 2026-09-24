import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Flag, MoreHorizontal, UserX } from 'lucide-react';
import { Avatar, IconButton, ActionSheet, ConfirmDialog } from '../components/ui';
import ReportDialog from '../components/feed/ReportDialog';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { fetchProfile } from '../services/profileService';
import { fetchFollowCounts, followUser, unfollowUser } from '../services/postService';
import { blockUser } from '../services/blockService';
import { createConversation } from '../services/messageService';
import { resolveImageUrl } from '../api';
import './ProfileScreen.css';
import '../components/feed/Feed.css';

// The @mention / hashtag-adjacent "view someone else's profile" page --
// didn't exist anywhere in the app before mentions needed somewhere to link
// to. Reached via /profile/:id (numeric) or /profile/:username (a mention
// link) -- backend profileController.getProfile accepts either.
function ProfileScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { token, userId: viewerId } = useAuth();

  const [profile, setProfile] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  // Bumped by the retry button to re-run the fetch effect below.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    fetchProfile(id, token)
      .then((data) => {
        setProfile(data);
        return fetchFollowCounts(data.id);
      })
      .then(setCounts)
      .catch((err) => {
        console.error(err);
        const isNotFound = err.response?.status === 404;
        setNotFound(isNotFound);
        setError(isNotFound ? 'User not found' : 'Failed to load profile');
      });
  }, [id, token, attempt]);

  const retry = () => {
    setError('');
    setNotFound(false);
    setAttempt((n) => n + 1);
  };

  if (error || !profile) {
    return (
      <div className="screen-enter">
        <header className="profile-screen-header">
          <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate(-1)} />
        </header>
        {error && !notFound ? (
          <FeedErrorState message={error} onRetry={retry} />
        ) : (
          <p className="profile-screen-status">{error || 'Loading…'}</p>
        )}
      </div>
    );
  }

  // Keyed by profile.id so navigating between two different profiles (or
  // this initial "not loaded yet" -> "loaded" transition) mounts a fresh
  // ProfileScreenBody instance -- useFollowToggle inside it only seeds its
  // isFollowing state from its OWN first render, so it must genuinely
  // remount to pick up a different profile's is_following value, not just
  // re-render with new props.
  return (
    <ProfileScreenBody
      key={profile.id}
      profile={profile}
      counts={counts}
      token={token}
      viewerId={viewerId}
      navigate={navigate}
    />
  );
}

// 'none' | 'pending' | 'following' -- a plain useState (not useFollowToggle's
// optimistic isFollowing boolean) because a private account's follow
// request lands as a third, distinct state the boolean toggle has no
// concept of.
function ProfileScreenBody({ profile, counts, token, viewerId, navigate }) {
  const isOwnProfile = viewerId === profile.id;
  const [followState, setFollowState] = useState(
    profile.is_following ? 'following' : profile.follow_request_pending ? 'pending' : 'none'
  );
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [blocked, setBlocked] = useState(false);

  const handleFollowClick = () => {
    setFollowPending(true);
    setFollowError('');
    const action = followState === 'none' ? followUser(profile.id, token) : unfollowUser(profile.id, token);
    action
      .then((res) => {
        if (followState === 'none') {
          setFollowState(res.data.status === 'pending' ? 'pending' : 'following');
        } else {
          setFollowState('none');
        }
      })
      .catch((err) => {
        console.error(err);
        setFollowError(err.response?.data || 'Something went wrong');
      })
      .finally(() => setFollowPending(false));
  };

  const followLabel = { none: 'Follow', pending: 'Requested', following: 'Following' }[followState];

  const handleMessage = () => {
    createConversation(profile.id, token)
      .then((conversation) => navigate(`/messages/${conversation.id}`))
      .catch((err) => console.error(err));
  };

  const handleBlock = async () => {
    setBlockError('');
    try {
      await blockUser(profile.id, token);
      setConfirmBlockOpen(false);
      setBlocked(true);
    } catch (err) {
      console.error(err);
      setBlockError(err.response?.data || 'Failed to block user');
    }
  };

  if (blocked) {
    return (
      <div className="screen-enter">
        <header className="profile-screen-header">
          <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate(-1)} />
        </header>
        <p className="profile-screen-status">You've blocked {profile.username}.</p>
      </div>
    );
  }

  const initials = (profile.username || '?').slice(0, 2).toUpperCase();

  return (
    <div className="screen-enter">
      <header className="profile-screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back" onClick={() => navigate(-1)} />
        <h1 className="profile-screen-header-title">{profile.username}</h1>
        {!isOwnProfile && (
          <IconButton icon={MoreHorizontal} aria-label="More options" onClick={() => setSheetOpen(true)} />
        )}
      </header>

      <div className="profile-screen-body">
        <Avatar size={84} src={resolveImageUrl(profile.avatar_url)} initials={initials} alt="" />
        <h2 className="profile-screen-username">{profile.username}</h2>
        {profile.bio && <p className="profile-screen-bio">{profile.bio}</p>}

        {counts && (
          <div className="profile-screen-counts">
            <span>
              <strong>{counts.followersCount}</strong> followers
            </span>
            <span>
              <strong>{counts.followingCount}</strong> following
            </span>
          </div>
        )}

        <div className="profile-screen-actions">
          {isOwnProfile ? (
            <button type="button" className="profile-screen-btn profile-screen-btn-primary" onClick={() => navigate('/edit-profile')}>
              Edit Profile
            </button>
          ) : (
            <>
              <button
                type="button"
                className="profile-screen-btn profile-screen-btn-primary"
                onClick={handleFollowClick}
                disabled={followPending}
              >
                {followLabel}
              </button>
              <button type="button" className="profile-screen-btn profile-screen-btn-secondary" onClick={handleMessage}>
                Message
              </button>
            </>
          )}
        </div>
        {followError && (
          <p className="profile-screen-error" role="alert">
            {followError}
          </p>
        )}
      </div>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Profile options"
        items={[
          { key: 'report', label: `Report ${profile.username}`, icon: Flag, onSelect: () => setReportOpen(true) },
          { key: 'block', label: `Block ${profile.username}`, icon: UserX, danger: true, onSelect: () => setConfirmBlockOpen(true) }
        ]}
      />
      <ConfirmDialog
        open={confirmBlockOpen}
        onClose={() => {
          setConfirmBlockOpen(false);
          setBlockError('');
        }}
        onConfirm={handleBlock}
        title={`Block ${profile.username}?`}
        description={`You won't see posts, follows, or messages from ${profile.username} anymore, and they won't see yours.`}
        confirmLabel="Block"
        danger
        error={blockError}
      />
      {reportOpen && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="user"
          targetId={profile.id}
          label={profile.username}
        />
      )}
    </div>
  );
}

export default ProfileScreen;
