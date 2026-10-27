import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, UserRoundPen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dismissProfileCard } from '../../services/profileService';
import './ProfileCompletionCard.css';

const STEPS = ['photo', 'cover', 'bio', 'links'];

// Day 105: "Finish your profile" on Home, like Facebook's -- how far along
// you are and what's left, each step one tap from its field in Edit
// profile. Shown once the first-run steps are done, until everything is
// filled in or you choose "Don't show again" (kept on the server, so it
// stays hidden on every device). `completion` comes from /profile/me
// (useCurrentUserSummary); absent until it has loaded.
function ProfileCompletionCard({ completion, token }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  if (!completion || !completion.onboarded || completion.dismissed || hidden) return null;
  const done = STEPS.filter((s) => completion[s]).length;
  if (done === STEPS.length) return null;

  const dismiss = () => {
    setHidden(true);
    // It is gone now either way; a failed save only means it may come back
    // on the next visit.
    dismissProfileCard(token).catch((err) => console.error(err));
  };

  return (
    <section className="profile-card" aria-labelledby="profile-card-title">
      <span className="profile-card-icon" aria-hidden="true">
        <UserRoundPen size={20} />
      </span>
      <div className="profile-card-body">
        <h2 className="profile-card-title" id="profile-card-title">{t('profileCard.title')}</h2>
        <p className="profile-card-progress-text" id="profile-card-progress">{t('profileCard.progress', { done, total: STEPS.length })}</p>
        <div
          className="profile-card-bar"
          role="progressbar"
          aria-labelledby="profile-card-progress"
          aria-valuemin={0}
          aria-valuemax={STEPS.length}
          aria-valuenow={done}
        >
          <span className="profile-card-bar-fill" style={{ inlineSize: `${(done / STEPS.length) * 100}%` }} />
        </div>
        <ul className="profile-card-steps">
          {STEPS.map((s) => (
            <li key={s} className={completion[s] ? 'is-done' : undefined}>
              {completion[s] ? (
                <span className="profile-card-step-done">
                  <Check size={16} aria-hidden="true" />
                  {t(`profileCard.done.${s}`)}
                </span>
              ) : (
                <Link to={`/edit-profile?focus=${s}`}>{t(`profileCard.todo.${s}`)}</Link>
              )}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="profile-card-close" aria-label={t('profileCard.dismiss')} title={t('profileCard.dismiss')} onClick={dismiss}>
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

export default ProfileCompletionCard;
