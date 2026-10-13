import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import Logo from '../components/layout/Logo';
import { LANGUAGES } from '../i18n';
import './LegalScreen.css';

// Day 60: Settings > About MySocialApp -- what the app is, its languages,
// and the documents that govern it. Public, like /terms.
function AboutScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={back} />
        <h1 className="screen-header-title">{t('about.title')}</h1>
      </header>
      <article className="screen-body legal-body">
        <div className="about-brand">
          <Logo />
          <p className="legal-updated">{t('nav.tagline')}</p>
        </div>
        <section className="legal-section">
          <h2 className="legal-heading">{t('about.whatTitle')}</h2>
          <p>{t('about.what')}</p>
        </section>
        <section className="legal-section">
          <h2 className="legal-heading">{t('about.languagesTitle')}</h2>
          {/* Each language's own name, in its own direction. */}
          <p>
            {LANGUAGES.map((l, i) => (
              <span key={l.code}>
                {i > 0 && ' · '}
                <bdi lang={l.code}>{l.label}</bdi>
              </span>
            ))}
          </p>
          <p>{t('about.languages')}</p>
        </section>
        <section className="legal-section">
          <h2 className="legal-heading">{t('about.stageTitle')}</h2>
          <p>{t('about.stage')}</p>
        </section>
        <nav className="about-links" aria-label={t('about.linksLabel')}>
          <Link to="/terms" className="screen-link">{t('settings.rows.terms')}</Link>
          <Link to="/privacy" className="screen-link">{t('settings.rows.privacy-policy')}</Link>
          <Link to="/help" className="screen-link">{t('settings.rows.help-support')}</Link>
        </nav>
      </article>
    </div>
  );
}

export default AboutScreen;
