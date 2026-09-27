import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import './layout.css';

// Same reasoning as ProfileSummaryRow -- identical markup was about to
// exist in both MenuScreen.jsx and SettingsScreen.jsx, so it's a shared
// layout piece instead of two copies that could drift.
function AppFooter({ className }) {
  const { t } = useTranslation();
  return (
    <footer className={className ? `app-footer ${className}` : 'app-footer'}>
      <Logo />
      <span className="app-footer-tagline">{t('nav.tagline')}</span>
    </footer>
  );
}

export default AppFooter;
