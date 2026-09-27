import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Check } from 'lucide-react';
import { IconButton } from '../components/ui';
import { LANGUAGES, setLanguage } from '../i18n';

// B15: /settings/language -- English / Myanmar, saved on this device.
function LanguageScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

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
                  onChange={() => setLanguage(lang.code)}
                />
                <span className="language-option-label">{lang.label}</span>
                {selected && <Check size={18} aria-hidden="true" />}
              </label>
            );
          })}
        </fieldset>
        <p className="form-hint">{t('language.hint')}</p>
      </div>
    </div>
  );
}

export default LanguageScreen;
