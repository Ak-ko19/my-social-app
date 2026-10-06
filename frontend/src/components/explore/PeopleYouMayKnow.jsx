import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui';
import FollowButton from '../feed/FollowButton';
import { useFollowToggle } from '../../hooks/useFollowToggle';
import { dismissSuggestion, fetchSuggestions } from '../../services/suggestionService';
import { X } from 'lucide-react';
import { serverErrorText } from '../../utils/serverError';
import { resolveImageUrl } from '../../api';
import './Explore.css';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

// Why this person is suggested, in plain words.
function reasonText(s) {
  if (s.reason === 'follows_you') return i18n.t('explore.reason.followsYou');
  if (s.reason === 'popular') return s.follower_count ? i18n.t('explore.reason.popular', { count: s.follower_count }) : i18n.t('explore.reason.newHere');
  const [first, second] = s.mutual_sample || [];
  const others = s.mutual_count - (s.mutual_sample?.length || 0);
  if (!first) return i18n.t('explore.reason.mutual', { count: s.mutual_count });
  if (second && others <= 0) return i18n.t('explore.reason.followedByTwo', { first, second });
  if (others > 0) return i18n.t('explore.reason.followedByOthers', { first, count: others + (second ? 1 : 0) });
  return i18n.t('explore.reason.followedBy', { first });
}

function SuggestionCard({ s, token, onHide }) {
  const { t } = useTranslation();
  const follow = useFollowToggle(s.id, false, token);
  return (
    <li className="pymk-card">
      {/* Day 39: hide this suggestion (doesn't block or tell anyone). */}
      <button type="button" className="pymk-hide" onClick={() => onHide(s)} aria-label={t('explore.hideSuggestion', { name: s.username })} title={t('explore.hideSuggestion', { name: s.username })}>
        <X size={16} aria-hidden="true" />
      </button>
      <Link to={`/profile/${s.id}`} className="pymk-profile-link">
        <Avatar size={56} src={resolveImageUrl(s.avatar_url)} initials={(s.username || '?').slice(0, 2).toUpperCase()} alt="" />
        <span className="pymk-name">{s.username}</span>
      </Link>
      <span className="pymk-reason">{reasonText(s)}</span>
      <FollowButton follow={follow} />
    </li>
  );
}

// B8 "People you may know" -- a horizontal row of suggestion cards. Shown
// on Explore and on Search before a query. Hidden entirely when there's
// nothing to suggest or the request fails (it's a discovery aid, not
// primary content).
function PeopleYouMayKnow({ token }) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState(null);
  const [hideError, setHideError] = useState('');

  // Optimistic: the card goes at once and comes back if the server refuses.
  const hide = (s) => {
    setHideError('');
    const before = suggestions;
    setSuggestions((current) => current.filter((x) => x.id !== s.id));
    dismissSuggestion(s.id, token).catch((err) => {
      console.error(err);
      setSuggestions(before);
      setHideError(serverErrorText(err, 'explore.hideFailed'));
    });
  };

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetchSuggestions(token)
      .then((data) => {
        if (!cancelled) setSuggestions(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!suggestions || (suggestions.length === 0 && !hideError)) return null;

  return (
    <section className="pymk" aria-label={t('explore.pymk')}>
      <h2 className="section-heading">{t('explore.pymk')}</h2>
      {hideError && <p className="form-error" role="alert">{hideError}</p>}
      <ul className="pymk-row">
        {suggestions.map((s) => (
          <SuggestionCard key={s.id} s={s} token={token} onHide={hide} />
        ))}
      </ul>
    </section>
  );
}

export default PeopleYouMayKnow;
