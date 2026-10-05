import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, ConfirmDialog } from '../components/ui';
import { useAuth, forceLogout, replaceToken } from '../hooks/useAuth';
import { changePassword, deactivateAccount, deleteAccount, downloadMyData } from '../services/accountService';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../utils/serverError';
import './AccountManagementScreen.css';

function AccountManagementScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, username } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [deactivatePasswordInput, setDeactivatePasswordInput] = useState('');
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleChangePassword = (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError(t('account.passwordsDontMatch'));
      return;
    }
    setPasswordPending(true);
    changePassword(currentPassword, newPassword, token)
      .then((res) => {
        // Other devices are now signed out; if this device's token was
        // cut off too (one from before sessions), the server sent a new one.
        if (res.data?.token) replaceToken(res.data.token);
        setPasswordSuccess(t('account.passwordChanged'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      })
      .catch((err) => {
        console.error(err);
        setPasswordError(serverErrorText(err, 'account.changeFailed'));
      })
      .finally(() => setPasswordPending(false));
  };

  const handleDeactivate = async () => {
    setDeactivateError('');
    try {
      await deactivateAccount(deactivatePasswordInput, token);
      setConfirmDeactivateOpen(false);
      forceLogout();
    } catch (err) {
      console.error(err);
      setDeactivateError(serverErrorText(err, 'account.deactivateFailed'));
    }
  };

  // Day 28: "Download your information" -- saved as a .json file named
  // like the server's own Content-Disposition (which a cross-origin page
  // can't read without extra CORS headers).
  const handleDownload = async () => {
    setDownloadError('');
    setDownloadDone(false);
    setDownloadPending(true);
    try {
      const json = await downloadMyData(token);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `mysocialapp-${(username || 'account').replace(/[^A-Za-z0-9_.-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked a moment later: revoking right away can cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDownloadDone(true);
    } catch (err) {
      console.error(err);
      setDownloadError(serverErrorText(err, 'account.downloadFailed'));
    } finally {
      setDownloadPending(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError('');
    try {
      await deleteAccount(deletePasswordInput, token);
      setConfirmDeleteOpen(false);
      forceLogout();
    } catch (err) {
      console.error(err);
      setDeleteError(serverErrorText(err, 'account.deleteFailed'));
    }
  };

  return (
    <div className="screen-enter">
      <header className="account-mgmt-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="account-mgmt-header-title">{t('account.title')}</h1>
      </header>

      <section className="account-mgmt-section">
        <h2 className="account-mgmt-section-title">{t('account.changePassword')}</h2>
        <form className="account-mgmt-form" onSubmit={handleChangePassword}>
          <input
            type="password"
            placeholder={t('account.currentPassword')}
            aria-label={t('account.currentPassword')}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder={t('account.newPassword')}
            aria-label={t('account.newPassword')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder={t('account.confirmPassword')}
            aria-label={t('account.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
          {passwordError && (
            <p className="account-mgmt-error" role="alert">
              {passwordError}
            </p>
          )}
          {passwordSuccess && <p className="account-mgmt-success" role="status">{passwordSuccess}</p>}
          <button type="submit" className="account-mgmt-btn account-mgmt-btn-primary" disabled={passwordPending}>
            {passwordPending ? t('common.saving') : t('account.changePassword')}
          </button>
        </form>
      </section>

      <section className="account-mgmt-section">
        <h2 className="account-mgmt-section-title">{t('account.downloadTitle')}</h2>
        <p className="account-mgmt-description">{t('account.downloadText')}</p>
        {downloadError && (
          <p className="account-mgmt-error" role="alert">
            {downloadError}
          </p>
        )}
        {downloadDone && <p className="account-mgmt-success" role="status">{t('account.downloadDone')}</p>}
        <button
          type="button"
          className="account-mgmt-btn account-mgmt-btn-secondary"
          onClick={handleDownload}
          disabled={downloadPending}
          aria-busy={downloadPending}
        >
          {downloadPending ? t('account.downloadPending') : t('account.downloadButton')}
        </button>
      </section>

      <section className="account-mgmt-section">
        <h2 className="account-mgmt-section-title">{t('account.deactivateTitle')}</h2>
        <p className="account-mgmt-description">
          {t('account.deactivateText')}
        </p>
        <input
          type="password"
          placeholder={t('account.enterPassword')}
          aria-label={t('account.enterPassword')}
          value={deactivatePasswordInput}
          onChange={(e) => setDeactivatePasswordInput(e.target.value)}
        />
        <button
          type="button"
          className="account-mgmt-btn account-mgmt-btn-secondary"
          onClick={() => setConfirmDeactivateOpen(true)}
          disabled={!deactivatePasswordInput}
        >
          {t('account.deactivateTitle')}
        </button>
      </section>

      <section className="account-mgmt-section account-mgmt-section-danger">
        <h2 className="account-mgmt-section-title">{t('account.deleteTitle')}</h2>
        <p className="account-mgmt-description">
          {t('account.deleteText')}
        </p>
        <input
          type="password"
          placeholder={t('account.enterPassword')}
          aria-label={t('account.enterPassword')}
          value={deletePasswordInput}
          onChange={(e) => setDeletePasswordInput(e.target.value)}
        />
        <button
          type="button"
          className="account-mgmt-btn account-mgmt-btn-danger"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={!deletePasswordInput}
        >
          {t('account.deleteTitle')}
        </button>
      </section>

      <ConfirmDialog
        open={confirmDeactivateOpen}
        onClose={() => {
          setConfirmDeactivateOpen(false);
          setDeactivateError('');
        }}
        onConfirm={handleDeactivate}
        title={t('account.confirmDeactivateTitle')}
        description={t('account.confirmDeactivateText')}
        confirmLabel={t('account.deactivate')}
        danger
        error={deactivateError}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => {
          setConfirmDeleteOpen(false);
          setDeleteError('');
        }}
        onConfirm={handleDelete}
        title={t('account.confirmDeleteTitle')}
        description={t('account.confirmDeleteText')}
        confirmLabel={t('account.deleteForever')}
        danger
        requireTypedConfirmation={username}
        error={deleteError}
      />
    </div>
  );
}

export default AccountManagementScreen;
