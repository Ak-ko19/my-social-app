import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import {
  fetchTwoFactorStatus,
  startTwoFactorSetup,
  enableTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes
} from '../services/twoFactorService';
import { serverErrorText } from '../utils/serverError';
import { formatDate } from '../i18n';
import FeedErrorState from '../components/feed/FeedErrorState';
import './TwoFactorScreen.css';

// Fewer unused recovery codes than this and the screen suggests new ones.
const LOW_CODES = 3;

// "ABCDEFGH..." -> "ABCD EFGH ..." (how authenticator apps show keys).
const groupKey = (secret) => secret.match(/.{1,4}/g).join(' ');
// Digits and spaces only, as typed ("123 456" is fine).
const cleanCode = (value) => value.replace(/[^\d ]/g, '').slice(0, 7);

// Day 77: Settings > Two-factor authentication -- like Facebook's and
// Instagram's "authentication app" option. Off: set up with a QR code (or
// the key typed in), confirm with a first code, save the recovery codes.
// On: see how many recovery codes are left, get new ones, or turn it off.
function TwoFactorScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, username } = useAuth();
  const [status, setStatus] = useState(null); // null while loading
  const [loadError, setLoadError] = useState('');
  // 'idle' | 'password' (before setup) | 'scan' | 'codes' | 'turnOff' | 'newCodes'
  const [stage, setStage] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState(null); // { secret, qr }
  const [codes, setCodes] = useState([]);
  const [justTurnedOn, setJustTurnedOn] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(() => {
    fetchTwoFactorStatus(token)
      .then(setStatus)
      .catch((err) => {
        console.error(err);
        setLoadError(t('twoFactor.loadFailed'));
      });
  }, [token, t]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const retry = () => {
    setLoadError('');
    setStatus(null);
    load();
  };

  const goTo = (next) => {
    setStage(next);
    setPassword('');
    setCode('');
    setUseRecovery(false);
    setError('');
    setNotice('');
    setCopied('');
  };

  // Every action: one at a time, its server message shown on failure.
  const run = async (action, fallbackKey) => {
    setError('');
    setPending(true);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError(serverErrorText(err, fallbackKey));
    } finally {
      setPending(false);
    }
  };

  const handleStart = (e) => {
    e.preventDefault();
    run(async () => {
      const result = await startTwoFactorSetup(password, token);
      setSetup({ secret: result.secret, qr: result.qr });
      goTo('scan');
    }, 'twoFactor.actionFailed');
  };

  const handleEnable = (e) => {
    e.preventDefault();
    run(async () => {
      const recoveryCodes = await enableTwoFactor(code, token);
      setCodes(recoveryCodes);
      setJustTurnedOn(true);
      setSetup(null);
      goTo('codes');
      setStatus({ enabled: true, enabledAt: new Date().toISOString(), recoveryCodesLeft: recoveryCodes.length });
    }, 'twoFactor.actionFailed');
  };

  const handleDisable = (e) => {
    e.preventDefault();
    run(async () => {
      await disableTwoFactor(password, useRecovery ? { recoveryCode: code } : { code }, token);
      setStatus({ enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
      goTo('idle');
      setNotice(t('twoFactor.turnedOff'));
    }, 'twoFactor.actionFailed');
  };

  const handleNewCodes = (e) => {
    e.preventDefault();
    run(async () => {
      const recoveryCodes = await regenerateRecoveryCodes(password, token);
      setCodes(recoveryCodes);
      setJustTurnedOn(false);
      goTo('codes');
      setStatus((s) => ({ ...s, recoveryCodesLeft: recoveryCodes.length }));
    }, 'twoFactor.actionFailed');
  };

  const copy = (text, what) => {
    navigator.clipboard?.writeText(text)
      .then(() => setCopied(what))
      .catch(() => setCopied(''));
  };

  const downloadCodes = () => {
    const text = [t('twoFactor.fileTitle', { username: username || '' }), '', ...codes, '', t('twoFactor.fileNote')].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mysocialapp-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const errorLine = error && <p className="two-factor-error" role="alert">{error}</p>;
  const passwordInput = (
    <input
      type="password"
      className="two-factor-input"
      placeholder={t('twoFactor.password')}
      aria-label={t('twoFactor.password')}
      autoComplete="current-password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
    />
  );
  const codeInput = (label) => (
    <input
      type="text"
      className="two-factor-input two-factor-code-input"
      inputMode={useRecovery ? 'text' : 'numeric'}
      autoComplete="one-time-code"
      dir="ltr"
      placeholder={label}
      aria-label={label}
      value={code}
      onChange={(e) => setCode(useRecovery ? e.target.value.slice(0, 20) : cleanCode(e.target.value))}
      required
    />
  );
  const cancelButton = (
    <button type="button" className="two-factor-btn two-factor-btn-secondary" onClick={() => { setSetup(null); goTo('idle'); }}>
      {t('common.cancel')}
    </button>
  );

  return (
    <div className="screen-enter">
      <header className="two-factor-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="two-factor-header-title">{t('twoFactor.title')}</h1>
      </header>

      {!status && !loadError && (
        <div className="two-factor-section" aria-busy="true" aria-label={t('common.loading')}>
          <span className="two-factor-skeleton" aria-hidden="true" />
          <span className="two-factor-skeleton two-factor-skeleton-short" aria-hidden="true" />
        </div>
      )}
      {loadError && <FeedErrorState message={loadError} onRetry={retry} />}

      {status && stage !== 'codes' && (
        <section className="two-factor-section">
          <div className={`two-factor-status ${status.enabled ? 'two-factor-status-on' : ''}`}>
            {status.enabled ? <ShieldCheck size={22} aria-hidden="true" /> : <ShieldOff size={22} aria-hidden="true" />}
            <span>
              <strong>{status.enabled ? t('twoFactor.on') : t('twoFactor.off')}</strong>
              {status.enabled && status.enabledAt && (
                <span className="two-factor-muted"> · {t('twoFactor.onSince', { date: formatDate(status.enabledAt, 'long') })}</span>
              )}
            </span>
          </div>
          <p className="two-factor-text">{t('twoFactor.intro')}</p>
          {notice && <p className="two-factor-success" role="status">{notice}</p>}
        </section>
      )}

      {status && !status.enabled && stage === 'idle' && (
        <section className="two-factor-section">
          <button type="button" className="two-factor-btn two-factor-btn-primary" onClick={() => goTo('password')}>
            {t('twoFactor.setUp')}
          </button>
        </section>
      )}

      {stage === 'password' && (
        <form className="two-factor-section two-factor-form" onSubmit={handleStart}>
          <p className="two-factor-text">{t('twoFactor.passwordFirst')}</p>
          {passwordInput}
          {errorLine}
          <button type="submit" className="two-factor-btn two-factor-btn-primary" disabled={pending || !password}>
            {pending ? t('common.pleaseWait') : t('twoFactor.continue')}
          </button>
          {cancelButton}
        </form>
      )}

      {stage === 'scan' && setup && (
        <form className="two-factor-section two-factor-form" onSubmit={handleEnable}>
          <h2 className="two-factor-step">{t('twoFactor.scanTitle')}</h2>
          <p className="two-factor-text">{t('twoFactor.scanText')}</p>
          <img className="two-factor-qr" src={setup.qr} alt={t('twoFactor.qrAlt')} width="200" height="200" />
          <p className="two-factor-text">{t('twoFactor.cantScan')}</p>
          <div className="two-factor-key-row">
            <code className="two-factor-key" dir="ltr">{groupKey(setup.secret)}</code>
            <button type="button" className="two-factor-link-btn" onClick={() => copy(setup.secret, 'key')}>
              {copied === 'key' ? t('twoFactor.copied') : t('twoFactor.copyKey')}
            </button>
          </div>
          <h2 className="two-factor-step">{t('twoFactor.codeTitle')}</h2>
          {codeInput(t('twoFactor.codeLabel'))}
          {errorLine}
          <button type="submit" className="two-factor-btn two-factor-btn-primary" disabled={pending || code.replace(/\s/g, '').length !== 6}>
            {pending ? t('twoFactor.turningOn') : t('twoFactor.turnOn')}
          </button>
          {cancelButton}
        </form>
      )}

      {stage === 'codes' && (
        <section className="two-factor-section two-factor-form">
          {justTurnedOn && <p className="two-factor-success" role="status">{t('twoFactor.codesReady')}</p>}
          <h2 className="two-factor-step">{t('twoFactor.codesTitle')}</h2>
          <p className="two-factor-text">{t('twoFactor.codesText')}</p>
          <ol className="two-factor-codes" dir="ltr" aria-label={t('twoFactor.codesTitle')}>
            {codes.map((c) => <li key={c}><code>{c}</code></li>)}
          </ol>
          <div className="two-factor-row">
            <button type="button" className="two-factor-btn two-factor-btn-secondary" onClick={() => copy(codes.join('\n'), 'codes')}>
              {copied === 'codes' ? t('twoFactor.copied') : t('twoFactor.copyCodes')}
            </button>
            <button type="button" className="two-factor-btn two-factor-btn-secondary" onClick={downloadCodes}>
              {t('twoFactor.downloadCodes')}
            </button>
          </div>
          <button type="button" className="two-factor-btn two-factor-btn-primary" onClick={() => { setCodes([]); goTo('idle'); }}>
            {t('twoFactor.savedThem')}
          </button>
        </section>
      )}

      {status?.enabled && stage === 'idle' && (
        <>
          <section className="two-factor-section">
            <h2 className="two-factor-step">{t('twoFactor.recoveryTitle')}</h2>
            <p className={status.recoveryCodesLeft <= LOW_CODES ? 'two-factor-warning' : 'two-factor-text'}>
              {t('twoFactor.codesLeft', { count: status.recoveryCodesLeft })}
              {status.recoveryCodesLeft <= LOW_CODES && ` ${t('twoFactor.codesLow')}`}
            </p>
            <button type="button" className="two-factor-btn two-factor-btn-secondary" onClick={() => goTo('newCodes')}>
              {t('twoFactor.newCodes')}
            </button>
          </section>
          <section className="two-factor-section">
            <button type="button" className="two-factor-btn two-factor-btn-danger" onClick={() => goTo('turnOff')}>
              {t('twoFactor.turnOff')}
            </button>
          </section>
        </>
      )}

      {stage === 'newCodes' && (
        <form className="two-factor-section two-factor-form" onSubmit={handleNewCodes}>
          <h2 className="two-factor-step">{t('twoFactor.newCodes')}</h2>
          <p className="two-factor-text">{t('twoFactor.newCodesText')}</p>
          {passwordInput}
          {errorLine}
          <button type="submit" className="two-factor-btn two-factor-btn-primary" disabled={pending || !password}>
            {pending ? t('common.pleaseWait') : t('twoFactor.newCodes')}
          </button>
          {cancelButton}
        </form>
      )}

      {stage === 'turnOff' && (
        <form className="two-factor-section two-factor-form" onSubmit={handleDisable}>
          <h2 className="two-factor-step">{t('twoFactor.turnOffTitle')}</h2>
          <p className="two-factor-text">{t('twoFactor.turnOffText')}</p>
          {passwordInput}
          {codeInput(useRecovery ? t('twoFactor.recoveryLabel') : t('twoFactor.codeLabel'))}
          <button
            type="button"
            className="two-factor-link-btn"
            onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(''); }}
          >
            {useRecovery ? t('twoFactor.useApp') : t('twoFactor.useRecovery')}
          </button>
          {errorLine}
          <button type="submit" className="two-factor-btn two-factor-btn-danger" disabled={pending || !password || !code.trim()}>
            {pending ? t('common.pleaseWait') : t('twoFactor.turnOff')}
          </button>
          {cancelButton}
        </form>
      )}
    </div>
  );
}

export default TwoFactorScreen;
