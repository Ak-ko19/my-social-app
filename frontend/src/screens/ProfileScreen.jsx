import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Flag, MoreHorizontal, ShieldCheck, ShieldMinus, UserX, Volume2, VolumeX } from 'lucide-react';
import { Avatar, IconButton, ActionSheet, ConfirmDialog } from '../components/ui';
import ReportDialog from '../components/feed/ReportDialog';
import ProfileTabs from '../components/profile/ProfileTabs';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { fetchMutualFriends, fetchProfile } from '../services/profileService';
import { fetchFollowCounts, followUser, unfollowUser } from '../services/postService';
import { blockUser } from '../services/blockService';
import { muteUser, unmuteUser } from '../services/muteService';
import { restrictUser, unrestrictUser } from '../services/restrictService';
import { createConversation } from '../services/messageService';
import { resolveImageUrl } from '../api';
import { Trans, useTranslation } from 'react-i18next';
import { serverErrorText } from '../utils/serverError';
import './ProfileScreen.css';
import '../components/feed/Feed.css';
import ProfileDetails from '../components/profile/ProfileDetails';
import CoverPhoto from '../components/profile/CoverPhoto';
import { followLabelKey } from '../utils/followLabel';

// The @mention / hashtag-adjacent "view someone else's profile" page --
// didn't exist anywhere in the app before mentions needed somewhere to link
// to. Reached via /profile/:id (numeric) or /profile/:username (a mention
// link) -- backend profileController.getProfile accepts either.
function ProfileScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
        setError(isNotFound ? t('profile.notFound') : t('profile.loadFailed'));
      });
  }, [id, token, attempt, t]);

  const retry = () => {
    setError('');
    setNotFound(false);
    setAttempt((n) => n + 1);
  };

  if (error || !profile) {
    return (
      <div className="screen-enter">
        <header className="profile-screen-header">
          <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        </header>
        {error && !notFound ? (
          <FeedErrorState message={error} onRetry={retry} />
        ) : (
          <p className="profile-screen-status">{error || t('common.loading')}</p>
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
  const { t } = useTranslation();
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
  // Day 47: muted -- their posts and stories stay out of your Home.
  const [muted, setMuted] = useState(Boolean(profile.is_muted_by_me));
  const [muteNote, setMuteNote] = useState('');

  // Day 47: restricted -- their comments on your posts wait for you.
  const [restricted, setRestricted] = useState(Boolean(profile.is_restricted_by_me));
  const toggleRestrict = async () => {
    setMuteNote('');
    try {
      if (restricted) await unrestrictUser(profile.id, token);
      else await restrictUser(profile.id, token);
      setMuteNote(t(restricted ? 'restricted.unrestrictedNote' : 'restricted.restrictedNote', { name: profile.username }));
      setRestricted(!restricted);
    } catch (err) {
      console.error(err);
      setMuteNote(serverErrorText(err, 'muted.failed'));
    }
  };

  const toggleMute = async () => {
    setMuteNote('');
    try {
      if (muted) await unmuteUser(profile.id, token);
      else await muteUser(profile.id, token);
      setMuteNote(t(muted ? 'muted.unmutedNote' : 'muted.mutedNote', { name: profile.username }));
      setMuted(!muted);
    } catch (err) {
      console.error(err);
      setMuteNote(serverErrorText(err, 'muted.failed'));
    }
  };

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
        setFollowError(serverErrorText(err, 'common.somethingWentWrong'));
      })
      .finally(() => setFollowPending(false));
  };

  // Day 37: "Follow back" when they already follow you.
  const followLabel = t(followLabelKey(followState, profile.follows_you));

  // Day 37: friends in common ("3 mutual friends: alice, bob, carol").
  const [mutual, setMutual] = useState(null);
  useEffect(() => {
    if (!token || isOwnProfile) return undefined;
    let cancelled = false;
    fetchMutualFriends(profile.id, token)
      .then((data) => { if (!cancelled) setMutual(data); })
      .catch(() => {}); // e.g. a private account you don't follow: nothing to show
    return () => { cancelled = true; };
  }, [profile.id, token, isOwnProfile]);

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
      setBlockError(serverErrorText(err, 'postMenu.blockFailed'));
    }
  };

  if (blocked) {
    return (
      <div className="screen-enter">
        <header className="profile-screen-header">
          <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        </header>
        <p className="profile-screen-status">{t('profile.blocked', { name: profile.username })}</p>
      </div>
    );
  }

  const initials = (profile.username || '?').slice(0, 2).toUpperCase();

  return (
    <div className="screen-enter">
      <header className="profile-screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="profile-screen-header-title">{profile.username}</h1>
        {!isOwnProfile && (
          <IconButton icon={MoreHorizontal} aria-label={t('postMenu.moreOptions')} onClick={() => setSheetOpen(true)} />
        )}
      </header>

      <div className="profile-screen-body">
        <CoverPhoto src={profile.cover_url} />
        <Avatar size={84} src={resolveImageUrl(profile.avatar_url)} initials={initials} alt="" />
        <h2 className="profile-screen-username">{profile.username}</h2>
        {profile.bio && <p className="profile-screen-bio" dir="auto">{profile.bio}</p>}
        <ProfileDetails links={profile.links} joinedAt={profile.created_at} />

        {counts && (
          <div className="profile-screen-counts">
            {/* Day 37: each count opens that list (friends = follow each other). */}
            <Link to={`/profile/${profile.id}/connections?tab=friends`} className="profile-count-link">
              <Trans i18nKey="profile.friendsCount" count={counts.friendsCount ?? 0} values={{ count: counts.friendsCount ?? 0 }} components={{ b: <strong /> }} />
            </Link>
            <Link to={`/profile/${profile.id}/connections?tab=followers`} className="profile-count-link">
              <Trans i18nKey="profile.followers" count={counts.followersCount} values={{ count: counts.followersCount }} components={{ b: <strong /> }} />
            </Link>
            <Link to={`/profile/${profile.id}/connections?tab=following`} className="profile-count-link">
              <Trans i18nKey="profile.following" values={{ count: counts.followingCount }} components={{ b: <strong /> }} />
            </Link>
          </div>
        )}
        {mutual?.count > 0 && (
          <p className="profile-mutual">
            {t('profile.mutualFriends', { count: mutual.count, names: mutual.sample.map((m) => m.username).join(', ') })}
          </p>
        )}

        <div className="profile-screen-actions">
          {isOwnProfile ? (
            <button type="button" className="profile-screen-btn profile-screen-btn-primary" onClick={() => navigate('/edit-profile')}>
              {t('profile.editProfile')}
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
                {t('common.message')}
              </button>
            </>
          )}
        </div>
        {followError && (
          <p className="profile-screen-error" role="alert">
            {followError}
          </p>
        )}
        {muteNote && <p className="profile-screen-note" role="status">{muteNote}</p>}
      </div>

      <ProfileTabs userId={profile.id} username={profile.username} isOwn={isOwnProfile} token={token} />

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('profile.options')}
        items={[
          muted
            ? { key: 'unmute', label: t('muted.unmuteName', { name: profile.username }), icon: Volume2, onSelect: toggleMute }
            : { key: 'mute', label: t('muted.muteName', { name: profile.username }), icon: VolumeX, onSelect: toggleMute },
          restricted
            ? { key: 'unrestrict', label: t('restricted.unrestrictName', { name: profile.username }), icon: ShieldCheck, onSelect: toggleRestrict }
            : { key: 'restrict', label: t('restricted.restrictName', { name: profile.username }), icon: ShieldMinus, onSelect: toggleRestrict },
          { key: 'report', label: t('postMenu.reportUser', { name: profile.username }), icon: Flag, onSelect: () => setReportOpen(true) },
          { key: 'block', label: t('postMenu.block', { name: profile.username }), icon: UserX, danger: true, onSelect: () => setConfirmBlockOpen(true) }
        ]}
      />
      <ConfirmDialog
        open={confirmBlockOpen}
        onClose={() => {
          setConfirmBlockOpen(false);
          setBlockError('');
        }}
        onConfirm={handleBlock}
        title={t('postMenu.blockTitle', { name: profile.username })}
        description={t('postMenu.blockDescription', { name: profile.username })}
        confirmLabel={t('postMenu.blockConfirm')}
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
