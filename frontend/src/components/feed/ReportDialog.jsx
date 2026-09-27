import { useState } from 'react';
import { Modal } from '../ui';
import { REPORT_REASONS, submitReport } from '../../services/reportService';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../utils/serverError';

// Reason-picker dialog shared by "Report post" and "Report user" (PostMenu)
// -- targetType/targetId/label are the only things that differ between the
// two call sites.
function ReportDialog({ open, onClose, targetType, targetId, label }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleClose = () => {
    setReason('');
    setDetails('');
    setError('');
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!reason) {
      setError(t('report.chooseReason'));
      return;
    }
    setPending(true);
    setError('');
    submitReport({ targetType, targetId, reason, details }, token)
      .then(() => setSubmitted(true))
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'report.failed'));
      })
      .finally(() => setPending(false));
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('report.title', { label })} className="ui-confirm-dialog">
      {submitted ? (
        <>
          <h2 className="ui-confirm-title">{t('report.submitted')}</h2>
          <p className="ui-confirm-description">
            {t('report.thanks', { label })}
          </p>
          <div className="ui-confirm-actions">
            <button type="button" className="ui-confirm-btn ui-confirm-btn-primary" onClick={handleClose}>
              {t('common.done')}
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="ui-confirm-title">{t('report.title', { label })}</h2>
          <p className="ui-confirm-description">{t('report.help')}</p>

          <div className="report-dialog-reasons" role="radiogroup" aria-label={t('report.reasonLabel')}>
            {REPORT_REASONS.map((r) => (
              <label key={r.value} className="report-dialog-reason-row">
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span>{t(`report.reasons.${r.value}`)}</span>
              </label>
            ))}
          </div>

          <textarea
            className="report-dialog-details"
            placeholder={t('report.details')}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={3}
          />

          {error && (
            <p className="ui-confirm-error" role="alert">
              {error}
            </p>
          )}

          <div className="ui-confirm-actions">
            <button type="button" className="ui-confirm-btn ui-confirm-btn-secondary" onClick={handleClose} disabled={pending}>
              {t('common.cancel')}
            </button>
            <button type="button" className="ui-confirm-btn ui-confirm-btn-primary" onClick={handleSubmit} disabled={pending}>
              {pending ? t('report.submitting') : t('report.submit')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default ReportDialog;
