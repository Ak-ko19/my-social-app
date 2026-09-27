import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Avatar, VerifiedTick } from '../ui';
import './layout.css';

// Extracted out of MenuScreen.jsx once SettingsScreen needed the exact same
// row (avatar/name/verified/handle+tagline/chevron), just at a different
// size and destination -- same reasoning Logo.jsx was already split out
// for. `to` lets each screen pick its own destination (Menu's own row goes
// to /settings; Settings' own row goes to /edit-profile -- see
// SettingsScreen.jsx for why).
function ProfileSummaryRow({ user, src, size = 52, to, className }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={className ? `profile-summary-row ${className}` : 'profile-summary-row'}
      onClick={() => navigate(to)}
    >
      <Avatar size={size} src={src} initials={user.initials} bg={user.bg} color={user.color} alt="" />
      <div className="profile-summary-text">
        <div className="profile-summary-name-row">
          <span className="profile-summary-name">{user.name}</span>
          {user.verified && <VerifiedTick size={15} />}
        </div>
        <span className="profile-summary-tagline">
          <bdi>@{user.handle}</bdi>
          {user.tagline ? ` · ${user.tagline}` : ''}
        </span>
      </div>
      <ChevronRight size={18} className="profile-summary-chevron" aria-hidden="true" />
    </button>
  );
}

export default ProfileSummaryRow;
