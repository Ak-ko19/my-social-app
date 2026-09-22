import { useState } from 'react';
import { Modal } from '../ui';
import { REPORT_REASONS, submitReport } from '../../services/reportService';
import { useAuth } from '../../hooks/useAuth';

// Reason-picker dialog shared by "Report post" and "Report user" (PostMenu)
// -- targetType/targetId/label are the only things that differ between the
// two call sites.
function ReportDialog({ open, onClose, targetType, targetId, label }) {
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
      setError('Please choose a reason');
      return;
    }
    setPending(true);
    setError('');
    submitReport({ targetType, targetId, reason, details }, token)
      .then(() => setSubmitted(true))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data || 'Failed to submit report');
      })
      .finally(() => setPending(false));
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Report ${label}`} className="ui-confirm-dialog">
      {submitted ? (
        <>
          <h2 className="ui-confirm-title">Report submitted</h2>
          <p className="ui-confirm-description">
            Thanks for letting us know. Our team will review {label} shortly.
          </p>
          <div className="ui-confirm-actions">
            <button type="button" className="ui-confirm-btn ui-confirm-btn-primary" onClick={handleClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="ui-confirm-title">Report {label}</h2>
          <p className="ui-confirm-description">Help us understand what's wrong.</p>

          <div className="report-dialog-reasons" role="radiogroup" aria-label="Report reason">
            {REPORT_REASONS.map((r) => (
              <label key={r.value} className="report-dialog-reason-row">
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>

          <textarea
            className="report-dialog-details"
            placeholder="Additional details (optional)"
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
              Cancel
            </button>
            <button type="button" className="ui-confirm-btn ui-confirm-btn-primary" onClick={handleSubmit} disabled={pending}>
              {pending ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default ReportDialog;
