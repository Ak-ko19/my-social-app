import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '../../hooks/useOnline';

// Day 72: says so, on every screen, while the device has no connection.
// (Home shows the posts it saved; a message sent now waits and goes later.)
function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <p className="offline-banner" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>{t('offline.banner')}</span>
    </p>
  );
}

export default OfflineBanner;
