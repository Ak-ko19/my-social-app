import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, ActionSheet, ConfirmDialog, Modal } from '../components/ui';
import FeedList from '../components/feed/FeedList';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { useSavedPosts } from '../hooks/useSavedPosts';
import { serverErrorText } from '../utils/serverError';
import { renameCollection, deleteCollection, MAX_COLLECTION_NAME } from '../services/collectionService';
import '../components/feed/Feed.css';
import './SavedPostsScreen.css';
import '../components/saved/CollectionsRow.css';

// Day 46: /saved/collections/:id -- one of your collections' posts (newest
// added first), with rename and delete (the posts stay saved).
function CollectionScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation();
  const { token } = useAuth();
  const saved = useSavedPosts(token, id);
  const { posts, loading, loadingMore, error, hasMore, reload, loadMore, removePost, updatePostContent, collection, setCollection, notFound } = saved;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const state = notFound ? 'missing' : loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  const startRename = () => {
    setName(collection?.name || '');
    setActionError('');
    setRenaming(true);
  };
  const submitRename = async (e) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      setCollection(await renameCollection(id, name.trim(), token));
      setRenaming(false);
    } catch (err) {
      setActionError(serverErrorText(err, 'collections.renameFailed'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setActionError('');
    try {
      await deleteCollection(id, token);
      navigate('/saved', { replace: true });
    } catch (err) {
      setActionError(serverErrorText(err, 'collections.deleteFailed'));
    }
  };

  return (
    <div className="screen-enter">
      <header className="saved-posts-header">
        <IconButton icon={ChevronLeft} aria-label={t('collections.backToSaved')} onClick={() => navigate('/saved')} />
        <h1 className="saved-posts-header-title" dir="auto">{collection?.name || t('collections.title')}</h1>
        {collection && <IconButton icon={MoreHorizontal} aria-label={t('collections.options')} onClick={() => setMenuOpen(true)} />}
      </header>

      {state === 'missing' && <p className="saved-posts-empty" role="status">{t('collections.notFound')}</p>}
      {state === 'loading' && <FeedSkeleton />}
      {state === 'error' && <FeedErrorState message={error} onRetry={reload} />}
      {state === 'empty' && <p className="saved-posts-empty">{t('collections.empty')}</p>}
      {state === 'list' && (
        <FeedList
          posts={posts}
          hasMore={hasMore}
          isLoadingMore={loadingMore}
          onLoadMore={loadMore}
          onRemovePost={removePost}
          onUpdatePost={updatePostContent}
        />
      )}

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={collection?.name}
        items={[
          { key: 'rename', label: t('collections.rename'), icon: Pencil, onSelect: startRename },
          { key: 'delete', label: t('collections.delete'), icon: Trash2, danger: true, onSelect: () => { setActionError(''); setConfirmDelete(true); } }
        ]}
      />
      <Modal open={renaming} onClose={() => setRenaming(false)} title={t('collections.rename')}>
        <form onSubmit={submitRename} className="form-stack">
          <h2 className="ui-confirm-title">{t('collections.rename')}</h2>
          <label className="form-field">
            <span className="form-label">{t('collections.nameLabel')}</span>
            <input className="form-input" value={name} maxLength={MAX_COLLECTION_NAME} onChange={(e) => setName(e.target.value)} dir="auto" />
          </label>
          {actionError && <p className="form-error" role="alert">{actionError}</p>}
          <div className="collections-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>{t('common.save')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setRenaming(false)} disabled={busy}>{t('common.cancel')}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t('collections.deleteTitle', { name: collection?.name || '' })}
        description={t('collections.deleteText')}
        confirmLabel={t('common.delete')}
        danger
        error={actionError}
      />
    </div>
  );
}

export default CollectionScreen;
