import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useHiddenWords } from '../hooks/useHiddenWords';
import { serverErrorText } from '../utils/serverError';
import './InteractionsScreen.css';
import './HiddenWordsScreen.css';

const MODES = ['warn', 'hide', 'off'];
const MAX_WORDS = 100;
const MAX_LENGTH = 40;

// Day 49: Settings -> Hidden words (Instagram's). What happens to posts and
// comments containing offensive words -- the built-in English / Arabic list
// plus your own words -- and your own words. Saved as soon as you pick.
function HiddenWordsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const hidden = useHiddenWords();
  const { refresh } = hidden;
  const [state, setState] = useState('loading'); // loading | error | ready
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    refresh().then(() => setState('ready')).catch(() => setState('error'));
  }, [refresh]);
  useEffect(load, [load]);

  const run = async (work, savedText) => {
    if (busy) return false;
    setBusy(true);
    setStatus('');
    setError('');
    try {
      await work();
      setStatus(savedText);
      return true;
    } catch (err) {
      setError(serverErrorText(err, 'hiddenWords.saveFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const word = draft.trim();
    if (!word) return;
    if (await run(() => hidden.addWord(word), t('hiddenWords.added', { word }))) setDraft('');
  };

  const full = hidden.words.length >= MAX_WORDS;
  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('hiddenWords.title')}</h1>
      </header>
      <div className="screen-body hidden-words">
        <p className="form-hint hidden-words-explain">{t('hiddenWords.explain')}</p>
        {state === 'error' && <FeedErrorState message={t('hiddenWords.loadFailed')} onRetry={() => { setState('loading'); load(); }} />}
        {state === 'loading' && <p className="screen-status" role="status">{t('common.loading')}</p>}
        {state === 'ready' && (
          <>
            <fieldset className="interactions-group" disabled={busy}>
              <legend className="section-heading">{t('hiddenWords.modeLegend')}</legend>
              {MODES.map((mode) => (
                <label key={mode} className={hidden.mode === mode ? 'interactions-option hidden-words-option is-selected' : 'interactions-option hidden-words-option'}>
                  <input type="radio" name="hidden-words-mode" value={mode} checked={hidden.mode === mode}
                    onChange={() => run(() => hidden.setMode(mode), t('hiddenWords.saved'))} aria-describedby={`hidden-words-${mode}-hint`} />
                  <span className="hidden-words-option-text">
                    <span>{t(`hiddenWords.mode.${mode}`)}</span>
                    <span id={`hidden-words-${mode}-hint`} className="hidden-words-option-hint">{t(`hiddenWords.modeHint.${mode}`)}</span>
                  </span>
                </label>
              ))}
              <p className="form-hint">{t('hiddenWords.builtIn')}</p>
            </fieldset>

            <section aria-labelledby="hidden-words-yours">
              <h2 id="hidden-words-yours" className="section-heading">{t('hiddenWords.yours')}</h2>
              <form className="hidden-words-form" onSubmit={add}>
                <label className="feed-visually-hidden" htmlFor="hidden-words-input">{t('hiddenWords.addLabel')}</label>
                <input id="hidden-words-input" type="text" className="form-input" dir="auto" value={draft} maxLength={MAX_LENGTH}
                  onChange={(e) => setDraft(e.target.value)} placeholder={t('hiddenWords.addPlaceholder')} disabled={busy || full} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || full || !draft.trim()}>{t('hiddenWords.add')}</button>
              </form>
              <p className="form-hint">{full ? t('hiddenWords.full', { max: MAX_WORDS }) : t('hiddenWords.count', { count: hidden.words.length, max: MAX_WORDS })}</p>
              {hidden.words.length === 0 ? (
                <p className="screen-status">{t('hiddenWords.empty')}</p>
              ) : (
                <ul className="hidden-words-list">
                  {hidden.words.map((word) => (
                    <li key={word} className="hidden-words-chip">
                      <bdi dir="auto">{word}</bdi>
                      <button type="button" className="hidden-words-remove" disabled={busy}
                        onClick={() => run(() => hidden.removeWord(word), t('hiddenWords.removed', { word }))}
                        aria-label={t('hiddenWords.remove', { word })}>
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        <p className="interactions-status" role="status">{status}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export default HiddenWordsScreen;
