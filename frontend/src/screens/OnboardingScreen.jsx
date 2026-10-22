import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Home, Search, MessageSquare, Menu } from 'lucide-react';
import { Avatar } from '../components/ui';
import FollowButton from '../components/feed/FollowButton';
import { useFollowToggle } from '../hooks/useFollowToggle';
import { fetchSuggestions } from '../services/suggestionService';
import { reasonText } from '../utils/suggestionReason';
import { LANGUAGES } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { chooseLanguage } from '../utils/languageChoice';
import { setProfilePhoto, finishOnboarding } from '../services/profileService';
import { resolveImageUrl } from '../api';
import { serverErrorText } from '../utils/serverError';
import './OnboardingScreen.css';

// Day 78: the first-run steps, shown once after a new account's first
// login (Login.jsx sends it here when the server says needsOnboarding).
// Like Facebook's and Instagram's: a few quick cards, each one optional,
// "Skip" ends them at any point. Finishing or skipping tells the server,
// so they aren't shown again.
const STEPS = ['language', 'photo', 'people', 'tour'];

// The tour: where the main things are, with the icons the app uses.
const TOUR = [
  { key: 'home', icon: Home },
  { key: 'search', icon: Search },
  { key: 'messages', icon: MessageSquare },
  { key: 'menu', icon: Menu }
];

// One suggested person; following happens in place (the hook is the one
// People you may know uses). No profile link: the steps stay on screen.
function SuggestionRow({ s, token }) {
  const follow = useFollowToggle(s.id, false, token);
  return (
    <li className="onboarding-person">
      <Avatar size={48} src={resolveImageUrl(s.avatar_url)} initials={(s.username || '?').slice(0, 2).toUpperCase()} decorative />
      <span className="onboarding-person-text">
        <span className="onboarding-person-name">{s.username}</span>
        <span className="onboarding-person-reason">{reasonText(s)}</span>
      </span>
      <FollowButton follow={follow} />
    </li>
  );
}

// Card 3: people to follow -- friends of friends, or the most-followed
// public accounts for a brand-new account (backend suggestionsController).
function PeopleCard({ token }) {
  const { t } = useTranslation();
  const [people, setPeople] = useState(null); // null while loading

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions(token)
      .then((list) => { if (!cancelled) setPeople(list); })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setPeople([]);
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <h1 className="onboarding-title">{t('onboarding.peopleTitle')}</h1>
      <p className="onboarding-text">{t('onboarding.peopleText')}</p>
      {!people && (
        <ul className="onboarding-people" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="onboarding-person" aria-hidden="true">
              <span className="onboarding-skeleton onboarding-skeleton-avatar" />
              <span className="onboarding-skeleton onboarding-skeleton-line" />
            </li>
          ))}
        </ul>
      )}
      {people && people.length === 0 && <p className="onboarding-empty">{t('onboarding.peopleEmpty')}</p>}
      {people && people.length > 0 && (
        <ul className="onboarding-people" aria-label={t('onboarding.peopleTitle')}>
          {people.map((p) => <SuggestionRow key={p.id} s={p} token={token} />)}
        </ul>
      )}
    </>
  );
}

function OnboardingScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { token, username } = useAuth();
  const [index, setIndex] = useState(0);
  const [languageSaveFailed, setLanguageSaveFailed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [finishing, setFinishing] = useState(false);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  // Done or skipped: the server remembers, then Home. If saving fails the
  // person still gets in (the steps simply show again next login).
  const finish = () => {
    setFinishing(true);
    finishOnboarding(token)
      .catch((err) => console.error(err))
      .finally(() => navigate('/', { replace: true }));
  };

  const next = () => (last ? finish() : setIndex((i) => i + 1));

  const chooseLang = (code) => {
    setLanguageSaveFailed(false);
    chooseLanguage(code, token).catch(() => setLanguageSaveFailed(true));
  };

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again still fires
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    setProfilePhoto(file, token)
      .then((data) => setPhotoUrl(data.avatar_url))
      .catch((err) => {
        console.error(err);
        setPhotoError(serverErrorText(err, 'onboarding.photoFailed'));
      })
      .finally(() => setPhotoBusy(false));
  };

  return (
    <div className="onboarding screen-enter">
      <header className="onboarding-header">
        <ol className="onboarding-dots" aria-label={t('onboarding.progress', { step: index + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <li key={s} className={i <= index ? 'onboarding-dot is-done' : 'onboarding-dot'} aria-current={i === index ? 'step' : undefined} />
          ))}
        </ol>
        <button type="button" className="onboarding-skip" onClick={finish} disabled={finishing}>
          {t('onboarding.skipAll')}
        </button>
      </header>

      <main className="onboarding-card" key={step}>
        {step === 'language' && (
          <>
            <h1 className="onboarding-title">{t('onboarding.welcome', { username: username || '' })}</h1>
            <p className="onboarding-text">{t('onboarding.languageText')}</p>
            <fieldset className="language-picker">
              <legend className="section-heading">{t('language.choose')}</legend>
              {LANGUAGES.map((lang) => {
                const selected = i18n.language === lang.code;
                return (
                  <label key={lang.code} className={selected ? 'language-option is-selected' : 'language-option'} lang={lang.code}>
                    <input type="radio" name="language" value={lang.code} checked={selected} onChange={() => chooseLang(lang.code)} />
                    <span className="language-option-label">{lang.label}</span>
                    {selected && <Check size={18} aria-hidden="true" />}
                  </label>
                );
              })}
            </fieldset>
            {languageSaveFailed && <p className="form-error" role="alert">{t('language.saveFailed')}</p>}
          </>
        )}

        {step === 'photo' && (
          <>
            <h1 className="onboarding-title">{t('onboarding.photoTitle')}</h1>
            <p className="onboarding-text">{t('onboarding.photoText')}</p>
            <div className="onboarding-photo">
              <Avatar
                size={120}
                src={resolveImageUrl(photoUrl)}
                initials={(username || '?').slice(0, 2).toUpperCase()}
                alt={photoUrl ? t('onboarding.photoAlt') : undefined}
                decorative={!photoUrl}
              />
              {/* A translated button, not the browser's own file picker text. */}
              <label className={`btn btn-secondary form-file-button${photoBusy ? ' is-busy' : ''}`} aria-busy={photoBusy}>
                {photoBusy ? t('onboarding.uploading') : photoUrl ? t('onboarding.changePhoto') : t('onboarding.choosePhoto')}
                <input className="feed-visually-hidden" type="file" accept="image/*" onChange={pickPhoto} disabled={photoBusy} />
              </label>
              {photoUrl && <p className="onboarding-saved" role="status">{t('onboarding.photoSaved')}</p>}
              {photoError && <p className="form-error" role="alert">{photoError}</p>}
            </div>
          </>
        )}
        {step === 'people' && <PeopleCard token={token} />}

        {step === 'tour' && (
          <>
            <h1 className="onboarding-title">{t('onboarding.tourTitle')}</h1>
            <ul className="onboarding-tour">
              {TOUR.map(({ key, icon: Icon }) => (
                <li key={key} className="onboarding-tour-item">
                  <span className="onboarding-tour-icon" aria-hidden="true"><Icon size={22} /></span>
                  <span>
                    <strong className="onboarding-tour-name">{t(`onboarding.tour.${key}.name`)}</strong>
                    <span className="onboarding-tour-text">{t(`onboarding.tour.${key}.text`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="onboarding-footer">
        <button type="button" className="btn btn-primary btn-block" onClick={next} disabled={finishing || photoBusy}>
          {last ? t('onboarding.finish') : t('onboarding.next')}
        </button>
        {index > 0 && (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setIndex((i) => i - 1)} disabled={finishing}>
            {t('common.back')}
          </button>
        )}
      </footer>
    </div>
  );
}

export default OnboardingScreen;
