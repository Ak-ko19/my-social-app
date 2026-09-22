import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, ConfirmDialog } from '../components/ui';
import { useAuth, forceLogout } from '../hooks/useAuth';
import { changePassword, deactivateAccount, deleteAccount } from '../services/accountService';
import './AccountManagementScreen.css';

function AccountManagementScreen() {
  const navigate = useNavigate();
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

  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleChangePassword = (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    setPasswordPending(true);
    changePassword(currentPassword, newPassword, token)
      .then(() => {
        setPasswordSuccess('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      })
      .catch((err) => {
        console.error(err);
        setPasswordError(err.response?.data || 'Failed to change password');
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
      setDeactivateError(err.response?.data || 'Failed to deactivate account');
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
      setDeleteError(err.response?.data || 'Failed to delete account');
    }
  };

  return (
    <div className="screen-enter">
      <header className="account-mgmt-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Settings" onClick={() => navigate('/settings')} />
        <h1 className="account-mgmt-header-title">Account Management</h1>
      </header>

      <section className="account-mgmt-section">
        <h2 className="account-mgmt-section-title">Change Password</h2>
        <form className="account-mgmt-form" onSubmit={handleChangePassword}>
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
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
          {passwordSuccess && <p className="account-mgmt-success">{passwordSuccess}</p>}
          <button type="submit" className="account-mgmt-btn account-mgmt-btn-primary" disabled={passwordPending}>
            {passwordPending ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </section>

      <section className="account-mgmt-section">
        <h2 className="account-mgmt-section-title">Deactivate Account</h2>
        <p className="account-mgmt-description">
          Temporarily hides your profile and posts. Log back in anytime to reactivate.
        </p>
        <input
          type="password"
          placeholder="Enter your password"
          value={deactivatePasswordInput}
          onChange={(e) => setDeactivatePasswordInput(e.target.value)}
        />
        <button
          type="button"
          className="account-mgmt-btn account-mgmt-btn-secondary"
          onClick={() => setConfirmDeactivateOpen(true)}
          disabled={!deactivatePasswordInput}
        >
          Deactivate Account
        </button>
      </section>

      <section className="account-mgmt-section account-mgmt-section-danger">
        <h2 className="account-mgmt-section-title">Delete Account</h2>
        <p className="account-mgmt-description">
          Permanently deletes your account and all your content. This cannot be undone.
        </p>
        <input
          type="password"
          placeholder="Enter your password"
          value={deletePasswordInput}
          onChange={(e) => setDeletePasswordInput(e.target.value)}
        />
        <button
          type="button"
          className="account-mgmt-btn account-mgmt-btn-danger"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={!deletePasswordInput}
        >
          Delete Account
        </button>
      </section>

      <ConfirmDialog
        open={confirmDeactivateOpen}
        onClose={() => {
          setConfirmDeactivateOpen(false);
          setDeactivateError('');
        }}
        onConfirm={handleDeactivate}
        title="Deactivate your account?"
        description="Your profile and posts will be hidden until you log back in."
        confirmLabel="Deactivate"
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
        title="Delete your account?"
        description="This permanently deletes your account and everything you've posted. This cannot be undone."
        confirmLabel="Delete Forever"
        danger
        requireTypedConfirmation={username}
        error={deleteError}
      />
    </div>
  );
}

export default AccountManagementScreen;
