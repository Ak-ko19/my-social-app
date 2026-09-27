import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

// B15: remounts the app when the language changes, so every screen --
// including ones that format text outside a useTranslation() hook (e.g.
// formatRelativeTime) -- re-renders in the new language. Switching is a
// rare Settings action, so the refetch this causes is fine.
function LanguageRoot({ children }) {
  const { i18n } = useTranslation();
  return <Fragment key={i18n.language}>{children}</Fragment>;
}

export default LanguageRoot;
