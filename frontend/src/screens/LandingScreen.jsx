import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, Heart, Languages, MessageCircle, Newspaper, Shield, Sparkles, UsersRound } from 'lucide-react';
import Logo from '../components/layout/Logo';
import ThemeToggle from '../components/common/ThemeToggle';
import { useAuth } from '../hooks/useAuth';
import { LANGUAGES } from '../i18n';
import './LandingScreen.css';

// C3: /welcome -- a public explainer page for people who aren't users yet,
// deliberately outside the phone-width app shell (PhoneShell) and full
// width. Logged-out visitors to "/" are sent here. Text is bilingual like
// the rest of the app; the header has a quick English/Myanmar switch.
const FEATURES = [
  { key: 'feed', icon: Newspaper },
  { key: 'stories', icon: Sparkles },
  { key: 'messages', icon: MessageCircle },
  { key: 'groups', icon: UsersRound },
  { key: 'privacy', icon: Shield },
  { key: 'language', icon: Languages }
];

function LandingScreen() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();

  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <span className="landing-nav-spacer" />
        <div className="landing-lang" role="group" aria-label={t('landing.footerLanguage')}>
          <Globe size={15} aria-hidden="true" />
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              lang={l.code}
              className={i18n.language === l.code ? 'landing-lang-btn is-active' : 'landing-lang-btn'}
              aria-pressed={i18n.language === l.code}
              onClick={() => i18n.changeLanguage(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <ThemeToggle />
        {!token && (
          <Link to="/login" className="landing-nav-link">{t('landing.navLogin')}</Link>
        )}
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-text">
            <h1 className="landing-title">{t('landing.heroTitle')}</h1>
            <p className="landing-lead">{t('landing.heroText')}</p>
            <div className="landing-ctas">
              {token ? (
                <Link to="/" className="btn btn-primary landing-cta">{t('landing.ctaOpen')}</Link>
              ) : (
                <>
                  <Link to="/signup" className="btn btn-primary landing-cta">{t('landing.ctaSignup')}</Link>
                  <Link to="/login" className="btn btn-secondary landing-cta">{t('landing.ctaLogin')}</Link>
                </>
              )}
            </div>
          </div>

          {/* A small, static illustration of a feed card (not real data). */}
          <figure className="landing-preview" aria-label={t('landing.previewCaption')}>
            <div className="landing-preview-card">
              <div className="landing-preview-head">
                <span className="landing-preview-avatar" aria-hidden="true">TH</span>
                <span>
                  <strong>thiri</strong>
                  <small>{t('time.m', { count: 5 })}</small>
                </span>
              </div>
              <p>{t('landing.previewPost')}</p>
              <div className="landing-preview-sketch" aria-hidden="true" />
              <div className="landing-preview-stats">
                <span aria-hidden="true">👍❤️😆</span> {t('landing.previewReactions')}
              </div>
            </div>
            <div className="landing-preview-bubble landing-preview-bubble-in" aria-hidden="true">{t('landing.previewMsgIn')}</div>
            <div className="landing-preview-bubble landing-preview-bubble-out" aria-hidden="true">
              <Heart size={12} /> {t('landing.previewMsgOut')}
            </div>
            <figcaption className="landing-visually-hidden">{t('landing.previewCaption')}</figcaption>
          </figure>
        </section>

        <section className="landing-section">
          <h2 className="landing-h2">{t('landing.featuresTitle')}</h2>
          <ul className="landing-features">
            {FEATURES.map(({ key, icon: Icon }) => (
              <li key={key} className="landing-feature">
                <span className="landing-feature-icon" aria-hidden="true"><Icon size={22} /></span>
                <h3>{t(`landing.features.${key}.title`)}</h3>
                <p>{t(`landing.features.${key}.text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section landing-local">
          <h2 className="landing-h2">{t('landing.localTitle')}</h2>
          <p className="landing-lead">{t('landing.localText')}</p>
        </section>

        {!token && (
          <section className="landing-section landing-final">
            <h2 className="landing-h2">{t('landing.finalTitle')}</h2>
            <p>{t('landing.finalText')}</p>
            <Link to="/signup" className="btn btn-primary landing-cta">{t('landing.ctaSignup')}</Link>
          </section>
        )}
      </main>

      <footer className="landing-footer">
        <Logo />
        <span className="landing-footer-tagline">{t('nav.tagline')}</span>
        <nav className="landing-footer-links">
          <Link to="/terms">{t('landing.footerTerms')}</Link>
          <Link to="/privacy">{t('landing.footerPrivacy')}</Link>
        </nav>
      </footer>
    </div>
  );
}

export default LandingScreen;
