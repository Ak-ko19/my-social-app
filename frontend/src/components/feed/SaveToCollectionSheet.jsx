import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus } from 'lucide-react';
import { Modal } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import { serverErrorText } from '../../utils/serverError';
import {
  fetchCollections, fetchPostCollections, createCollection, setPostCollections, MAX_COLLECTION_NAME
} from '../../services/collectionService';
import './SaveToCollectionSheet.css';

// Day 46: "Save to collection" -- tick the collections a post belongs in
// (like Instagram's). Done saves the post too if it wasn't saved; with
// nothing ticked on a post that wasn't saved, it just closes.
function SaveToCollectionSheet({ open, onClose, post, saved, onSaved }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [collections, setCollections] = useState(null); // null = loading
  const [checked, setChecked] = useState(new Set());
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    Promise.all([fetchCollections(token), fetchPostCollections(post.id, token)])
      .then(([list, ids]) => {
        if (cancelled) return;
        setCollections(list);
        setChecked(new Set(ids));
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, post.id, token]);

  const close = () => {
    setError('');
    setNewName('');
    onClose();
  };

  const toggle = (id) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const create = async () => {
    if (busy || !newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const made = await createCollection(newName.trim(), token);
      setCollections((list) => [made, ...(list || [])]);
      setChecked((current) => new Set(current).add(made.id));
      setNewName('');
    } catch (err) {
      setError(serverErrorText(err, 'collections.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const done = async () => {
    if (busy) return;
    if (!saved && checked.size === 0) {
      close();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await setPostCollections(post.id, [...checked], token);
      onSaved?.(result);
      close();
    } catch (err) {
      setError(serverErrorText(err, 'collections.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('collections.sheetTitle')} variant="sheet" className="save-collection-sheet">
      <h2 className="save-collection-title">{t('collections.sheetTitle')}</h2>
      {loadFailed && <p className="form-error" role="alert">{t('collections.loadListFailed')}</p>}
      {!loadFailed && collections === null && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {collections && collections.length === 0 && <p className="form-hint">{t('collections.noneYet')}</p>}
      {collections && collections.length > 0 && (
        <fieldset className="save-collection-list">
          <legend className="feed-visually-hidden">{t('collections.pick')}</legend>
          {collections.map((c) => (
            <label key={c.id} className="save-collection-option">
              <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} disabled={busy} />
              {/* bdi: any script, aligned with the row (right in Arabic). */}
              <bdi className="save-collection-name">{c.name}</bdi>
              {checked.has(c.id) && <Check size={16} aria-hidden="true" className="save-collection-tick" />}
            </label>
          ))}
        </fieldset>
      )}
      {collections && (
        <div className="save-collection-new">
          <label className="form-field">
            <span className="form-label">{t('collections.newLabel')}</span>
            <input
              className="form-input"
              value={newName}
              maxLength={MAX_COLLECTION_NAME}
              placeholder={t('collections.newPlaceholder')}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create();
                }
              }}
              disabled={busy}
              dir="auto"
            />
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={create} disabled={busy || !newName.trim()}>
            <Plus size={16} aria-hidden="true" /> {t('collections.create')}
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="save-collection-actions">
        <button type="button" className="btn btn-primary" onClick={done} disabled={busy || collections === null}>{t('common.done')}</button>
        <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </Modal>
  );
}

export default SaveToCollectionSheet;
