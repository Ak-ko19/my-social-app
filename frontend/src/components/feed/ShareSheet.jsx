import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Link2, Lock, PenLine, Repeat2, Share2, Star, Users } from 'lucide-react';
import { ActionSheet, Modal } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import { sharePost } from '../../services/postService';
import { serverErrorText } from '../../utils/serverError';
import { MAX_POST_LENGTH } from '../../utils/textLimits';
import SharedPostCard from './SharedPostCard';

const AUDIENCES = [
  ['public', Globe, 'compose.public'],
  ['followers', Users, 'compose.followers'],
  ['close_friends', Star, 'compose.closeFriends'],
  ['only_me', Lock, 'compose.onlyMe']
];

// Days 93-94: what Share offers, like Facebook's: "Share now" (to your feed,
// public, at once), "Write post" (your words and an audience first), and the
// link -- copied, or the device's own share sheet where there is one. The
// first two only when the post may be shared (post.can_share: open to
// everyone); the link always. `post` is the card's post; a share's Share
// shares its original (the server does that too). onFeedback(text) shows a
// short note on the card's Share button; onShared() after a share.
function ShareSheet({ open, onClose, post, onFeedback, onShared }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [writing, setWriting] = useState(false);
  const [words, setWords] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // What gets shared, as the preview shows it.
  const original = post.is_share ? post.shared_post : {
    id: post.id, content: post.content, created_at: post.created_at, user_id: post.user_id,
    username: post.username, avatar_url: post.avatar_url, page: post.page || null, media: post.media || []
  };

  const share = (body) => {
    setPending(true);
    setError('');
    return sharePost(post.id, body, token)
      .then(() => {
        onShared?.();
        onFeedback(t('feed.shared'));
        return true;
      })
      .catch((err) => {
        console.error(err);
        const text = serverErrorText(err, 'feed.shareFailed');
        setError(text);
        if (!writing) onFeedback(text);
        return false;
      })
      .finally(() => setPending(false));
  };

  const closeWriting = () => {
    setWriting(false);
    setWords('');
    setVisibility('public');
    setError('');
  };

  const url = `${window.location.origin}/posts/${post.id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      onFeedback(t('feed.linkCopied'));
    } catch (err) {
      console.error(err);
      onFeedback(t('feed.copyFailed'));
    }
  };
  // The device's share sheet; a cancel (AbortError) is the person's choice,
  // not a failure.
  const shareElsewhere = async () => {
    try {
      await navigator.share({ title: t('feed.shareTitle', { name: post.page ? post.page.name : post.username }), url });
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  };

  const items = [
    ...(post.can_share ? [
      { key: 'now', label: t('feed.shareNow'), icon: Repeat2, onSelect: () => share({}) },
      { key: 'write', label: t('feed.shareWrite'), icon: PenLine, onSelect: () => setWriting(true) }
    ] : []),
    { key: 'copy', label: t('feed.shareCopyLink'), icon: Link2, onSelect: copyLink },
    ...(typeof navigator !== 'undefined' && navigator.share ? [{ key: 'more', label: t('feed.shareMore'), icon: Share2, onSelect: shareElsewhere }] : [])
  ];

  return (
    <>
      <ActionSheet open={open} onClose={onClose} title={t('feed.share')} items={items} />
      <Modal open={writing} onClose={closeWriting} title={t('feed.shareDialogTitle')} className="ui-confirm-dialog share-dialog">
        <h2 className="ui-confirm-title">{t('feed.shareDialogTitle')}</h2>
        <label className="form-label" htmlFor={`share-words-${post.id}`}>{t('feed.shareWordsLabel')}</label>
        <textarea
          id={`share-words-${post.id}`}
          className="share-dialog-words"
          // Words in any language keep their own direction (B16).
          dir="auto"
          value={words}
          onChange={(e) => setWords(e.target.value)}
          maxLength={MAX_POST_LENGTH}
          rows={3}
        />
        <fieldset className="audience-picker">
          <legend className="form-label">{t('compose.audience')}</legend>
          {AUDIENCES.map(([value, Icon, key]) => (
            <label key={value} className={visibility === value ? 'audience-option is-selected' : 'audience-option'}>
              <input type="radio" name={`share-visibility-${post.id}`} value={value} checked={visibility === value} onChange={() => setVisibility(value)} />
              <Icon size={15} aria-hidden="true" /> {t(key)}
            </label>
          ))}
        </fieldset>
        <SharedPostCard shared={original} />
        {error && (
          <p className="ui-confirm-error" role="alert">
            {error}
          </p>
        )}
        <div className="ui-confirm-actions">
          <button type="button" className="ui-confirm-btn ui-confirm-btn-secondary" onClick={closeWriting} disabled={pending}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="ui-confirm-btn ui-confirm-btn-primary"
            disabled={pending}
            onClick={() => share({ content: words, visibility }).then((ok) => ok && closeWriting())}
          >
            {pending ? t('feed.sharing') : t('feed.share')}
          </button>
        </div>
      </Modal>
    </>
  );
}

export default ShareSheet;
