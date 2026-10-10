import { useId } from 'react';
import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './HiddenContentCover.css';

// Day 49: in place of a post's body (text, poll, photos, link card) or a
// comment's text that contains one of your Hidden words, when you chose
// "warn". "Show anyway" uncovers this one only. A comment's cover sits
// inside the comment's paragraph, so it is made of inline elements only.
function HiddenContentCover({ kind = 'post', onShow }) {
  const { t } = useTranslation();
  const textId = useId();
  const Box = kind === 'post' ? 'div' : 'span';
  const Text = kind === 'post' ? 'p' : 'span';
  return (
    <Box className={`hidden-cover hidden-cover-${kind}`}>
      <EyeOff size={kind === 'post' ? 18 : 14} aria-hidden="true" className="hidden-cover-icon" />
      <Text id={textId} className="hidden-cover-text">{t(kind === 'post' ? 'hiddenWords.coverPost' : 'hiddenWords.coverComment')}</Text>
      <button type="button" className="hidden-cover-show" onClick={onShow} aria-describedby={textId}>
        {t('hiddenWords.show')}
      </button>
    </Box>
  );
}

export default HiddenContentCover;
