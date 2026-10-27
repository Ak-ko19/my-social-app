import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui';

// Day 103: Admin > Reports > Pending -- select several reports and dismiss
// them, or remove what they are about, in one go. Stays in view at the
// bottom while scrolling. Remove asks first (it can't be undone). The
// parent runs the action (onRun(action) -> Promise) and shows the result.
function AdminBulkBar({ selectedCount, pageCount, allSelected, onToggleAll, onRun, busy }) {
  const { t } = useTranslation();
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="admin-bulk-bar" role="region" aria-label={t('admin.bulk.label')}>
      <label className="admin-bulk-all">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} disabled={busy || pageCount === 0} />
        <span>{t('admin.bulk.selectAll')}</span>
      </label>
      <span className="admin-bulk-count" aria-live="polite">
        {t('admin.bulk.selected', { count: selectedCount })}
      </span>
      <span className="admin-bulk-spacer" />
      <button type="button" className="btn btn-secondary" disabled={busy || selectedCount === 0} onClick={() => onRun('dismiss')}>
        {t('admin.dismiss')}
      </button>
      <button type="button" className="btn btn-danger" disabled={busy || selectedCount === 0} onClick={() => setConfirmRemove(true)}>
        {t('admin.bulk.remove')}
      </button>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          onRun('remove');
        }}
        title={t('admin.bulk.confirmRemoveTitle', { count: selectedCount })}
        description={t('admin.bulk.confirmRemoveBody')}
        confirmLabel={t('admin.bulk.remove')}
        danger
      />
    </div>
  );
}

export default AdminBulkBar;
