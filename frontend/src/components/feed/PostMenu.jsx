import { useState } from 'react';
import { Flag, Globe, Lock, MoreHorizontal, Pencil, Pin, PinOff, Trash2, UserX, Users } from 'lucide-react';
import { IconButton, ActionSheet, ConfirmDialog } from '../ui';
import ReportDialog from './ReportDialog';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../utils/serverError';
import { useAuth } from '../../hooks/useAuth';
import { blockUser } from '../../services/blockService';
import { deletePost } from '../../services/postService';

// The post card's "..." menu. Report (Feature 2) and the post owner's
// edit/delete (Feature 4) extend this same sheet rather than building a
// second menu component, so there's exactly one "more options" surface per
// post card. onEdit puts PostCard into inline edit mode; the edit form
// itself lives there, not here, since it needs to replace the post body.
// canModerate (B13): the viewer is an admin of the post's group, so they
// may delete someone else's post there.
// B5 / Day 20: the audiences a post can be switched to (all but its own).
const AUDIENCE_ITEMS = [
  { value: 'public', label: 'postMenu.makePublic', icon: Globe },
  { value: 'followers', label: 'postMenu.makeFollowersOnly', icon: Users },
  { value: 'only_me', label: 'postMenu.makeOnlyMe', icon: Lock }
];

function PostMenu({ post, visibility = 'public', onChangeVisibility, onBlocked, onDeleted, onEdit, onTogglePin, canModerate = false }) {
  const { t } = useTranslation();
  const { token, userId } = useAuth();
  const isOwner = post.user_id === userId;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { type: 'post'|'user', label }
  const [error, setError] = useState('');

  const handleBlock = async () => {
    setError('');
    try {
      await blockUser(post.user_id, token);
      setConfirmBlockOpen(false);
      onBlocked?.(post.user_id);
    } catch (err) {
      console.error(err);
      setError(serverErrorText(err, 'postMenu.blockFailed'));
    }
  };

  const handleDelete = async () => {
    setError('');
    try {
      await deletePost(post.id, token);
      setConfirmDeleteOpen(false);
      onDeleted?.(post.id);
    } catch (err) {
      console.error(err);
      setError(serverErrorText(err, 'postMenu.deleteFailed'));
    }
  };

  const ownerItems = [
        // PostCard owns the change (optimistic + error display).
        ...AUDIENCE_ITEMS.filter((a) => a.value !== visibility).map((a) => ({
          key: `visibility-${a.value}`,
          label: t(a.label),
          icon: a.icon,
          onSelect: () => onChangeVisibility?.(a.value)
        })),
        // Day 36: on your own profile, pin it to the top (or unpin).
        ...(onTogglePin
          ? [{
              key: 'pin',
              label: post.is_pinned ? t('postMenu.unpin') : t('postMenu.pin'),
              icon: post.is_pinned ? PinOff : Pin,
              onSelect: () => onTogglePin()
            }]
          : []),
        {
          key: 'edit',
          label: t('postMenu.edit'),
          icon: Pencil,
          onSelect: () => onEdit?.()
        },
        {
          key: 'delete',
          label: t('postMenu.delete'),
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmDeleteOpen(true)
        }
      ];

  // B13/B14: the Public/Followers audience doesn't apply to group or page posts.
  // Group and page posts have no audience of their own: no audience items.
  const ownerMenu = post.community_id || post.page ? ownerItems.filter((i) => !i.key.startsWith('visibility')) : ownerItems;
  const otherMenu = [
        {
          key: 'report-post',
          label: t('postMenu.report'),
          icon: Flag,
          onSelect: () => setReportTarget({ type: 'post', label: t('report.thisPost') })
        },
        {
          key: 'report-user',
          label: t('postMenu.reportUser', { name: post.username }),
          icon: Flag,
          onSelect: () => setReportTarget({ type: 'user', label: post.username })
        },
        {
          key: 'block',
          label: t('postMenu.block', { name: post.username }),
          icon: UserX,
          danger: true,
          onSelect: () => setConfirmBlockOpen(true)
        }
      ];
  if (canModerate) {
    otherMenu.unshift({
      key: 'moderate-delete',
      label: t('postMenu.moderateDelete'),
      icon: Trash2,
      danger: true,
      onSelect: () => setConfirmDeleteOpen(true)
    });
  }
  const items = isOwner ? ownerMenu : otherMenu;

  return (
    <>
      <IconButton icon={MoreHorizontal} aria-label={t('postMenu.moreOptions')} onClick={() => setSheetOpen(true)} />
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('postMenu.title')} items={items} />
      <ConfirmDialog
        open={confirmBlockOpen}
        onClose={() => {
          setConfirmBlockOpen(false);
          setError('');
        }}
        onConfirm={handleBlock}
        title={t('postMenu.blockTitle', { name: post.username })}
        description={t('postMenu.blockDescription', { name: post.username })}
        confirmLabel={t('postMenu.blockConfirm')}
        danger
        error={error}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => {
          setConfirmDeleteOpen(false);
          setError('');
        }}
        onConfirm={handleDelete}
        title={t('postMenu.deleteTitle')}
        description={t('postMenu.deleteDescription')}
        confirmLabel={t('common.delete')}
        danger
        error={error}
      />
      {reportTarget && (
        <ReportDialog
          open={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.type === 'post' ? post.id : post.user_id}
          label={reportTarget.label}
        />
      )}
    </>
  );
}

export default PostMenu;
