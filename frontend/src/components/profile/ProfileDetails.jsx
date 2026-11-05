import { Cake, CalendarDays, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../i18n';
import { safeHttpUrl } from '../../utils/safeUrl';
import { linkLabel } from '../../utils/linkLabel';
import { birthdayText } from '../../utils/birthday';

// Day 36: under the bio -- the profile's links and when they joined. Day 111:
// their birthday (month and day), when they show it to you.
// Links come from the server already checked, and are checked again here
// before going into an href (never trust stored URLs in markup). They open
// in a new tab, and rel tells search engines they're user-supplied.
function ProfileDetails({ links, joinedAt, birthday = null }) {
  const { t } = useTranslation();
  const safe = (links || []).map(safeHttpUrl).filter(Boolean);
  const joined = joinedAt ? formatDate(joinedAt, 'monthYear') : '';

  return (
    <div className="profile-details">
      {safe.length > 0 && (
        <ul className="profile-links" aria-label={t('profile.links')}>
          {safe.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="profile-link" dir="ltr">
                <Link2 size={14} aria-hidden="true" />
                <span>{linkLabel(url)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {birthday && (
        <p className="profile-joined">
          <Cake size={14} aria-hidden="true" />
          <span>{t('profile.birthday', { date: birthdayText(birthday) })}</span>
        </p>
      )}
      {joined && (
        <p className="profile-joined">
          <CalendarDays size={14} aria-hidden="true" />
          <span>{t('profile.joined', { date: joined })}</span>
        </p>
      )}
    </div>
  );
}

export default ProfileDetails;
