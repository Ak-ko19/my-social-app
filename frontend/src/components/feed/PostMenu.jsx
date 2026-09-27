import { useState } from 'react';
import { Flag, Globe, MoreHorizontal, Pencil, Trash2, UserX, Users } from 'lucide-react';
import { IconButton, ActionSheet, ConfirmDialog } from '../ui';
import ReportDialog from './ReportDialog';
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
function PostMenu({ post, visibility = 'public', onToggleVisibility, onBlocked, onDeleted, onEdit, canModerate = false }) {
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
      setError(err.response?.data || 'Failed to block user');
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
      setError(err.response?.data || 'Failed to delete post');
    }
  };

  const ownerItems = [
        {
          key: 'visibility',
          label: visibility === 'followers' ? 'Make public' : 'Make visible to followers only',
          icon: visibility === 'followers' ? Globe : Users,
          // B5: PostCard owns the change (optimistic + error display).
          onSelect: () => onToggleVisibility?.()
        },
        {
          key: 'edit',
          label: 'Edit post',
          icon: Pencil,
          onSelect: () => onEdit?.()
        },
        {
          key: 'delete',
          label: 'Delete post',
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmDeleteOpen(true)
        }
      ];

  // B13/B14: the Public/Followers audience doesn't apply to group or page posts.
  const ownerMenu = post.community_id || post.page ? ownerItems.filter((i) => i.key !== 'visibility') : ownerItems;
  const otherMenu = [
        {
          key: 'report-post',
          label: 'Report post',
          icon: Flag,
          onSelect: () => setReportTarget({ type: 'post', label: 'this post' })
        },
        {
          key: 'report-user',
          label: `Report ${post.username}`,
          icon: Flag,
          onSelect: () => setReportTarget({ type: 'user', label: post.username })
        },
        {
          key: 'block',
          label: `Block ${post.username}`,
          icon: UserX,
          danger: true,
          onSelect: () => setConfirmBlockOpen(true)
        }
      ];
  if (canModerate) {
    otherMenu.unshift({
      key: 'moderate-delete',
      label: 'Delete post (group admin)',
      icon: Trash2,
      danger: true,
      onSelect: () => setConfirmDeleteOpen(true)
    });
  }
  const items = isOwner ? ownerMenu : otherMenu;

  return (
    <>
      <IconButton icon={MoreHorizontal} aria-label="More options" onClick={() => setSheetOpen(true)} />
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Post options" items={items} />
      <ConfirmDialog
        open={confirmBlockOpen}
        onClose={() => {
          setConfirmBlockOpen(false);
          setError('');
        }}
        onConfirm={handleBlock}
        title={`Block ${post.username}?`}
        description={`You won't see posts, follows, or messages from ${post.username} anymore, and they won't see yours.`}
        confirmLabel="Block"
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
        title="Delete this post?"
        description="This cannot be undone."
        confirmLabel="Delete"
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
