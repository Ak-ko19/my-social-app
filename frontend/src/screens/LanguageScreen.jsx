import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Check } from 'lucide-react';
import { IconButton } from '../components/ui';
import { LANGUAGES, setLanguage } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { saveLanguage } from '../services/profileService';

// B15: /settings/language -- English / Myanmar / Arabic. Day 16: saved on
// this device AND on the account, so it follows you to every device.
function LanguageScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const [saveFailed, setSaveFailed] = useState(false);

  // Applied here at once; the account copy is best effort -- if it can't
  // be saved, the app still switches and says so quietly.
  const choose = (code) => {
    setSaveFailed(false);
    setLanguage(code).catch(() => {});
    if (token) saveLanguage(code, token).catch(() => setSaveFailed(true));
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('language.title')}</h1>
      </header>
      <div className="screen-body">
        <fieldset className="language-picker">
          <legend className="section-heading">{t('language.choose')}</legend>
          {LANGUAGES.map((lang) => {
            const selected = i18n.language === lang.code;
            return (
              <label key={lang.code} className={selected ? 'language-option is-selected' : 'language-option'} lang={lang.code}>
                <input
                  type="radio"
                  name="language"
                  value={lang.code}
                  checked={selected}
                  onChange={() => choose(lang.code)}
                />
                <span className="language-option-label">{lang.label}</span>
                {selected && <Check size={18} aria-hidden="true" />}
              </label>
            );
          })}
        </fieldset>
        <p className="form-hint">{t('language.hint')}</p>
        {saveFailed && <p className="form-error" role="alert">{t('language.saveFailed')}</p>}
      </div>
    </div>
  );
}

export default LanguageScreen;
