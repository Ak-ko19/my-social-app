import { Component, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '../../hooks/useOnline';
import { reportClientError } from '../../utils/errorReporter';
import { isChunkLoadError } from '../../utils/chunkError';
import './ScreenLoadBoundary.css';

// Offline: says so and tries again by itself once the connection is back.
// Online: the files most likely changed under us (a new version went
// live), so a reload is what helps. `compact` (Days 114-115): a part of a
// screen (comments, a sheet, the story viewer) -- one line in place, not a
// whole-screen message with a heading; `onClose` lets the person give up.
function ScreenLoadError({ onRetry, compact, onClose }) {
  const { t } = useTranslation();
  const online = useOnline();
  useEffect(() => {
    if (!online) {
      const retry = () => onRetry();
      window.addEventListener('online', retry);
      return () => window.removeEventListener('online', retry);
    }
    return undefined;
  }, [online, onRetry]);

  const action = online ? (
    <button type="button" className={compact ? 'btn btn-primary btn-sm' : 'btn btn-primary'} onClick={() => window.location.reload()}>{t('screenLoad.reload')}</button>
  ) : (
    <button type="button" className={compact ? 'btn btn-primary btn-sm' : 'btn btn-primary'} onClick={onRetry}>{t('common.retry')}</button>
  );

  if (compact) {
    return (
      <div className="part-load-error" role="alert">
        {online ? <RefreshCw size={18} aria-hidden="true" /> : <WifiOff size={18} aria-hidden="true" />}
        <p className="part-load-error-text">{online ? t('screenLoad.updatedTitle') : t('screenLoad.offlineTitle')}</p>
        <div className="part-load-error-actions">
          {action}
          {onClose && <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{t('common.close')}</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="screen-load-error" role="alert">
      {online ? <RefreshCw size={32} aria-hidden="true" /> : <WifiOff size={32} aria-hidden="true" />}
      <h1 className="screen-load-error-title">{online ? t('screenLoad.updatedTitle') : t('screenLoad.offlineTitle')}</h1>
      <p className="screen-load-error-text">{online ? t('screenLoad.updatedText') : t('screenLoad.offlineText')}</p>
      {action}
    </div>
  );
}

// Day 80: catches only a screen (or, compact, a part) whose code couldn't
// be downloaded; any other crash goes on to the app's ErrorBoundary as
// before.
class ScreenLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Offline is expected, not a bug; online it may be a broken deploy.
    if (isChunkLoadError(error) && navigator.onLine) reportClientError('error', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isChunkLoadError(error)) throw error;
    return <ScreenLoadError onRetry={this.props.onRetry} compact={this.props.compact} onClose={this.props.onClose} />;
  }
}

export default ScreenLoadBoundary;
