import Modal from './Modal';
import { useTranslation } from 'react-i18next';

// A bottom sheet of tappable rows -- the post "more options" menu (Edit /
// Delete / Block / Report) and the report-reason picker both render through
// this. `items` is [{ key, label, icon: Icon, danger, onSelect }]; selecting
// a row closes the sheet and then runs its action (so a confirm dialog it
// opens isn't fighting this one's own unmount).
function ActionSheet({ open, onClose, title, items }) {
  const { t } = useTranslation();
  const handleSelect = (item) => {
    onClose();
    // Deferred one tick: if onSelect opens another overlay (a ConfirmDialog),
    // it should mount after this sheet's own exit animation has started,
    // not stack on top of it mid-close.
    setTimeout(() => item.onSelect(), 0);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} variant="sheet" className="ui-action-sheet">
      {title && <p className="ui-action-sheet-title">{title}</p>}
      <div role="menu">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={`ui-action-sheet-item ${item.danger ? 'ui-action-sheet-item-danger' : ''}`}
            onClick={() => handleSelect(item)}
          >
            {item.icon && <item.icon size={18} aria-hidden="true" />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="ui-action-sheet-cancel" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </Modal>
  );
}

export default ActionSheet;
