import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import i18n from '../../i18n';
import { reportClientError } from '../../utils/errorReporter';
import './ErrorBoundary.css';

// Day 10: if rendering crashes anywhere below it, show a friendly screen
// (instead of a blank white page) and report the crash to the error log.
// A class component: React's error boundaries can't be written as hooks.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    const withComponents = new Error(error?.message || String(error));
    withComponents.stack = `${error?.stack || ''}\n\nComponent stack:${info?.componentStack || ''}`;
    reportClientError('render', withComponents);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <AlertTriangle size={36} aria-hidden="true" className="error-boundary-icon" />
          <h1 className="error-boundary-title">{t('errorBoundary.title')}</h1>
          <p className="error-boundary-body">{t('errorBoundary.body')}</p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              {t('errorBoundary.reload')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.assign('/')}>
              {t('errorBoundary.home')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
