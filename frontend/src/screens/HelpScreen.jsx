import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import './LegalScreen.css';

// Day 60: Settings > Help & Support -- short answers to the common
// questions, from the locale files (help.sections) so they exist in English
// and Arabic. Public, like /terms: someone who can't log in may need it.
function HelpScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const sections = t('help.sections', { returnObjects: true });
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={back} />
        <h1 className="screen-header-title">{t('help.title')}</h1>
      </header>
      <article className="screen-body legal-body">
        <p className="legal-updated">{t('help.intro')}</p>
        {Array.isArray(sections) &&
          sections.map((s) => (
            <section key={s.heading} className="legal-section">
              <h2 className="legal-heading">{s.heading}</h2>
              <p>{s.body}</p>
            </section>
          ))}
        <Link to="/about" className="screen-link">{t('help.toAbout')}</Link>
      </article>
    </div>
  );
}

export default HelpScreen;
