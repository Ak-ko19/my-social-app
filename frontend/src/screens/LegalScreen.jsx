import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { formatDate } from '../i18n';
import './LegalScreen.css';

// C2: /terms and /privacy -- public (no login needed), text from the
// locale files (legal.<doc>.sections) so both exist in English and Arabic.
// Marked as a draft until the owner has it reviewed (see ROADMAP NEEDS OWNER).
// Each document has its own date (Day 28 rewrote the privacy policy;
// Day 36 added cover photo and links to it).
const LAST_UPDATED = { terms: '2026-09-27', privacy: '2026-10-28' };

function LegalScreen({ doc }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const sections = t(`legal.${doc}.sections`, { returnObjects: true });
  const other = doc === 'terms' ? { to: '/privacy', key: 'legal.otherPrivacy' } : { to: '/terms', key: 'legal.otherTerms' };
  // Opened from a link inside the app -> go back; opened directly -> Home.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={back} />
        <h1 className="screen-header-title">{t(`legal.${doc}.title`)}</h1>
      </header>
      <article className="screen-body legal-body">
        <p className="legal-draft" role="note">{t('legal.draftNote')}</p>
        <p className="legal-updated">{t('legal.updated', { date: formatDate(`${LAST_UPDATED[doc]}T12:00:00`, 'long') })}</p>
        {Array.isArray(sections) &&
          sections.map((s) => (
            <section key={s.heading} className="legal-section">
              <h2 className="legal-heading">{s.heading}</h2>
              <p>{s.body}</p>
            </section>
          ))}
        <Link to={other.to} className="screen-link">{t(other.key)}</Link>
      </article>
    </div>
  );
}

export default LegalScreen;
